"""Composite action: fetch ServiceNow catalog JSON → LLM-analyze → interactive refinement → create Replit app."""

from __future__ import annotations

import json
import logging
import time
import uuid

import httpx

from services import servicenow_tools
from services.claude_client import call_llm, ClaudeClientError
from adapters.servicenow_catalog_adapter import create_servicenow_extraction
from models import LLMUsageEvent, calculate_llm_cost

logger = logging.getLogger(__name__)

# ServiceNow dev instances hibernate — first request wakes them and can take 60-90s.
_SNOW_TIMEOUT = 90
_MAX_RETRIES = 2
_RETRY_DELAY = 5  # seconds between retries

_GRAPHQL_URL = "https://replit.com/graphql"
_MAX_LLM_CATALOG_CHARS = 150_000  # ~37k tokens — fits full cleaned catalog (~113k chars)

_CREATE_REPL_MUTATION = """
mutation CreateRepl($input: CreateReplInput!) {
  createRepl(input: $input) {
    __typename
    ... on Repl {
      id
      slug
      title
      url
    }
    ... on UserError {
      message
    }
  }
}
"""


async def _fetch_catalog(service_url: str, auth_header: str) -> httpx.Response:
    """GET the ServiceNow web service with retries for hibernating instances."""
    last_exc = None
    for attempt in range(1, _MAX_RETRIES + 1):
        print(f"[snow_to_replit] GET attempt {attempt}/{_MAX_RETRIES} → {service_url}")
        try:
            async with httpx.AsyncClient(timeout=_SNOW_TIMEOUT) as client:
                resp = await client.get(service_url, headers={
                    "Accept": "application/json",
                    "Authorization": auth_header,
                })
            # 5xx = instance waking up, retry; otherwise return immediately
            if resp.status_code < 500:
                return resp
            print(f"[snow_to_replit] HTTP {resp.status_code} (instance may be waking) — retrying in {_RETRY_DELAY}s")
        except httpx.TimeoutException as exc:
            print(f"[snow_to_replit] Timeout after {_SNOW_TIMEOUT}s — retrying in {_RETRY_DELAY}s")
            last_exc = exc
        except httpx.HTTPError as exc:
            print(f"[snow_to_replit] HTTP error: {exc} — retrying in {_RETRY_DELAY}s")
            last_exc = exc

        if attempt < _MAX_RETRIES:
            import asyncio
            await asyncio.sleep(_RETRY_DELAY)

    # Exhausted retries — return last response if we got one, else raise
    if last_exc is not None:
        raise last_exc
    return resp  # type: ignore[possibly-undefined]


async def _create_repl_with_prompt(
    connect_sid: str, title: str, language: str, description: str,
) -> dict | None:
    """Create a repl via GraphQL with the full prompt as description (no truncation)."""
    headers = {
        "Content-Type": "application/json",
        "Cookie": f"connect.sid={connect_sid}",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0",
    }
    variables = {
        "input": {
            "title": title,
            "language": language,
            "description": description,  # full prompt — no 500-char truncation
        }
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                _GRAPHQL_URL,
                headers=headers,
                json={"query": _CREATE_REPL_MUTATION, "variables": variables},
            )
        print(f"[snow_to_replit] GraphQL HTTP {resp.status_code}")
        if resp.status_code != 200:
            print(f"[snow_to_replit] GraphQL error body: {resp.text[:300]}")
            return None

        data = resp.json()
        result = data.get("data", {}).get("createRepl")
        if not result:
            print(f"[snow_to_replit] No createRepl in response: {data}")
            return None
        if result.get("__typename") == "UserError":
            print(f"[snow_to_replit] UserError: {result.get('message')}")
            return None

        print(f"[snow_to_replit] Repl created: {result}")
        return {
            "id": result.get("id", ""),
            "slug": result.get("slug", ""),
            "url": result.get("url", ""),
        }
    except Exception as e:
        print(f"[snow_to_replit] GraphQL exception: {e}")
        return None


_REFORMAT_SYSTEM_PROMPT = """\
You are an enterprise application architect.

The following JSON payload was extracted from a ServiceNow catalog item.

Your task is to reformat and simplify the payload so it is easier for an LLM or developer to understand.

Rules:
- Remove unnecessary ServiceNow metadata (sys_*, timestamps, etc.)
- Rename fields to plain English where helpful
- Group related information logically
- Keep the structure simple and readable
- Preserve all important functional information
- Output clean, well-formatted JSON only

Target structure:

CatalogItem
{
  name
  description
  categories[]
  variables[
    {
      name
      question
      type
      mandatory
      choices[]
    }
  ]
  workflow_summary
}\
"""

_DRAFT_SYSTEM_PROMPT = """\
You are analyzing a simplified ServiceNow service catalog payload. Your job:
1. Identify EXACTLY which catalog items, fields, and categories are in the data
2. Generate a precise Replit Agent prompt to build a modern, responsive service catalog UI
3. The prompt MUST instruct Replit to build ONLY the catalog items found in the data
4. Do NOT add any catalog items, categories, or content not present in the data
5. Specify: React, modern design, proper form fields per catalog item, request submission flow

Return ONLY the Replit Agent prompt text — no preamble or explanation.\
"""

_REFINE_SYSTEM_PROMPT = """\
You are refining the instruction header of a Replit Agent prompt for building
a service catalog app.  The catalog data (JSON) is attached separately and
will be reattached automatically — do NOT reproduce the data in your output.
Incorporate the user's feedback into the instructions. Return ONLY the
updated instruction text — no preamble, no explanation, no catalog data.\
"""


async def _track_llm_usage(
    tenant_id: str, model: str, meta: dict, skill: str, app,
) -> None:
    """Persist an LLMUsageEvent from actual API response metadata."""
    input_tokens = meta.get("input_tokens") or 0
    output_tokens = meta.get("output_tokens") or 0
    cost = calculate_llm_cost(model, input_tokens, output_tokens)
    await app.state.llm_usage_store.create(LLMUsageEvent(
        id=f"llmu_{uuid.uuid4().hex[:12]}",
        tenant_id=tenant_id,
        run_id="",
        use_case="ServiceNow to Replit",
        skill=skill,
        model=meta.get("model", model),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        cost=cost,
        latency_ms=meta.get("latency_ms", 0),
    ))


async def _get_llm_config(tenant_id: str, app) -> dict:
    """Load tenant's active LLM config. Returns {provider, api_key, model}."""
    assignment = await app.state.llm_assignment_store.get_active(tenant_id)
    if assignment is None:
        raise ClaudeClientError("No active LLM config for this tenant — configure one in Settings")
    llm_config = await app.state.llm_config_store.get(assignment.llm_config_id)
    if llm_config is None:
        raise ClaudeClientError("LLM config not found")
    return {
        "provider": llm_config.provider,
        "api_key": llm_config.api_key,
        "model": llm_config.model,
    }


def _strip_code_fences(text: str) -> str:
    """Remove markdown code fences (```json ... ```) that LLMs sometimes add."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_nl = cleaned.find("\n")
        if first_nl != -1:
            cleaned = cleaned[first_nl + 1:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
    return cleaned


def _strip_html(text: str) -> str:
    """Remove HTML tags from a string, decode common entities."""
    import re
    import html
    return html.unescape(re.sub(r"<[^>]+>", "", text)).strip()


def _clean_catalog_item(entry: dict) -> dict | None:
    """Clean a single ServiceNow catalog item entry (with 'item' and 'prompts' keys)."""
    item = entry.get("item", entry)  # handle both wrapped and unwrapped

    name = item.get("name", "").strip()
    if not name:
        return None

    desc = item.get("description", "")
    if isinstance(desc, str) and ("<" in desc and ">" in desc):
        desc = _strip_html(desc)

    clean: dict = {"name": name}
    if desc:
        clean["description"] = desc

    categories = item.get("categories", [])
    if categories:
        clean["categories"] = categories

    # Variables: keep name, question, type, mandatory, choices — drop sys_id, help_text
    variables = []
    for v in item.get("variables", []):
        cv: dict = {
            "name": v.get("name", ""),
            "question": v.get("question", ""),
            "type": v.get("type", ""),
        }
        if v.get("mandatory"):
            cv["mandatory"] = True
        choices = v.get("choices", [])
        if choices:
            cv["choices"] = [
                c.get("text", c) if isinstance(c, dict) else c
                for c in choices
            ]
        variables.append(cv)
    if variables:
        clean["variables"] = variables

    return clean


def _reformat_catalog(raw_catalog_str: str) -> str:
    """Pre-process raw ServiceNow catalog JSON into a clean, simplified structure.

    Structure-aware cleanup that:
    - Drops the huge 'prompts' field (79% of payload — duplicates item data)
    - Drops sys_* IDs, HTML markup, help_text, workflow metadata
    - Preserves ALL items, categories, variables, and choices
    """
    try:
        raw_obj = json.loads(raw_catalog_str)
    except Exception:
        return raw_catalog_str[:_MAX_LLM_CATALOG_CHARS]

    # Handle the {result: {catalog_title, items: [...]}} wrapper
    result = raw_obj.get("result", raw_obj)
    if isinstance(result, dict) and "items" in result:
        items_raw = result["items"]
        catalog_title = result.get("catalog_title", "")
    elif isinstance(raw_obj, list):
        items_raw = raw_obj
        catalog_title = ""
    else:
        # Unknown structure — generic fallback
        return json.dumps(raw_obj, indent=2)[:_MAX_LLM_CATALOG_CHARS]

    # Clean each item
    items_clean = []
    categories = set()
    for entry in items_raw:
        clean = _clean_catalog_item(entry)
        if clean:
            items_clean.append(clean)
            for c in clean.get("categories", []):
                categories.add(c)

    output = {
        "catalog_title": catalog_title,
        "total_items": len(items_clean),
        "total_categories": len(categories),
        "categories": sorted(categories),
        "items": items_clean,
    }

    result_str = json.dumps(output, indent=2)
    print(f"[snow_to_replit] Catalog cleaned: {len(items_clean)} items, "
          f"{len(categories)} categories, {len(result_str):,} chars")

    if len(result_str) > _MAX_LLM_CATALOG_CHARS:
        result_str = result_str[:_MAX_LLM_CATALOG_CHARS] + "\n... (truncated)"
    return result_str


async def convert_catalog_to_replit(tenant_id: str, payload: dict, app) -> dict:
    """Phase 1 — Fetch ServiceNow catalog, call LLM to analyze, return a draft prompt for review."""

    # 1. ServiceNow credentials
    cfg = await servicenow_tools._get_snow_config(tenant_id, app)
    print(f"[snow_to_replit] ServiceNow config loaded for tenant {tenant_id}")

    # 2. Resolve service_url — supports "endpoint:Name|key=val" syntax or a plain URL
    raw_url = payload.get("service_url", "")
    if not raw_url:
        return {"status": "error", "error": "Missing service_url parameter"}

    if raw_url.startswith("endpoint:"):
        # Parse "endpoint:Catalog by URL|sys_id=abc123"
        parts = raw_url[len("endpoint:"):].split("|", 1)
        ep_name = parts[0].strip()
        path_vars = {}
        if len(parts) > 1:
            for pair in parts[1].split(","):
                k, _, v = pair.partition("=")
                path_vars[k.strip()] = v.strip()
        service_url = await servicenow_tools.get_endpoint_url(tenant_id, ep_name, app, **path_vars)
        if not service_url:
            return {"status": "error", "error": f"Endpoint '{ep_name}' not found on ServiceNow integration"}
    else:
        service_url = raw_url

    t0 = time.monotonic()
    try:
        resp = await _fetch_catalog(service_url, cfg["auth_header"])
    except Exception as exc:
        latency_ms = int((time.monotonic() - t0) * 1000)
        print(f"[snow_to_replit] All retries exhausted after {latency_ms}ms: {exc}")
        return {
            "status": "error",
            "error": f"ServiceNow unreachable after {_MAX_RETRIES} attempts ({latency_ms}ms) — instance may be hibernating, try again in a minute",
            "latency_ms": latency_ms,
        }
    latency_ms = int((time.monotonic() - t0) * 1000)
    print(f"[snow_to_replit] HTTP {resp.status_code} in {latency_ms}ms, body length={len(resp.text)}")

    if not resp.is_success:
        print(f"[snow_to_replit] ERROR response body: {resp.text[:500]}")
        return {"status": "error", "error": f"ServiceNow HTTP {resp.status_code}", "latency_ms": latency_ms}

    try:
        catalog_json = resp.json()
    except Exception:
        print(f"[snow_to_replit] Non-JSON body: {resp.text[:500]}")
        return {"status": "error", "error": "Non-JSON response from ServiceNow (instance may be hibernating)", "latency_ms": latency_ms}

    print(f"[snow_to_replit] Catalog JSON keys: {list(catalog_json.keys()) if isinstance(catalog_json, dict) else type(catalog_json).__name__}")

    # 2b. Feed raw catalog into the genome extraction pipeline
    catalog_name = payload.get("catalog_name", "ServiceNow Catalog")
    try:
        extraction_id = await create_servicenow_extraction(tenant_id, catalog_name, catalog_json, app)
        print(f"[snow_to_replit] Genome extraction created: {extraction_id}")
    except Exception as exc:
        print(f"[snow_to_replit] Genome extraction failed (non-blocking): {exc}")
        extraction_id = None

    # 3. Clean the catalog locally (fast, no LLM) then load LLM config for draft
    catalog_str = json.dumps(catalog_json, indent=2)
    clean_catalog = _reformat_catalog(catalog_str)

    try:
        llm_cfg = await _get_llm_config(tenant_id, app)
    except ClaudeClientError as exc:
        return {"status": "error", "error": str(exc)}

    # 4. Generate draft Replit prompt from the clean catalog
    try:
        user_message = f"Analyze this ServiceNow catalog payload and generate a Replit Agent prompt:\n\n{clean_catalog}"
        draft_prompt, draft_meta = await call_llm(
            provider=llm_cfg["provider"],
            api_key=llm_cfg["api_key"],
            model=llm_cfg["model"],
            user_message=user_message,
            system_prompt=_DRAFT_SYSTEM_PROMPT,
        )
        if not draft_prompt.strip():
            raise ClaudeClientError("LLM returned empty draft prompt")
        print(f"[snow_to_replit] LLM draft generated ({len(draft_prompt)} chars)")
        await _track_llm_usage(tenant_id, llm_cfg["model"], draft_meta, "catalog-draft", app)
    except Exception as exc:
        print(f"[snow_to_replit] Draft generation failed, using template: {type(exc).__name__}: {exc}")
        draft_prompt = (
            "Build a modern, responsive service catalog UI using React.\n\n"
            "Use ONLY the following ServiceNow catalog data — do NOT add items "
            "not present in the data:\n\n"
            f"{clean_catalog}"
        )

    # 5. Return draft for interactive refinement (no repl created yet)
    result = {
        "status": "draft",
        "draft_prompt": draft_prompt.strip(),
        "catalog_data": clean_catalog,
        "analysis": f"Analyzed catalog payload ({len(catalog_str)} chars), reformatted, and generated a focused Replit prompt.",
        "latency_ms": latency_ms,
    }
    if extraction_id:
        result["extraction_id"] = extraction_id
    return result


def _split_prompt_and_data(prompt: str) -> tuple[str, str]:
    """Split a draft prompt into the instruction header and the embedded catalog data.

    The LLM-generated draft typically has textual instructions at the top followed
    by a large JSON block (the catalog data).  We only need to refine the
    instructions — the data stays unchanged.
    """
    # Look for the start of the JSON payload (first '{' or '[' on its own line)
    for i, line in enumerate(prompt.split("\n")):
        stripped = line.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            parts = prompt.split("\n")
            header = "\n".join(parts[:i]).rstrip()
            data = "\n".join(parts[i:])
            if header:
                return header, data
            break
    # No clear split — treat the whole thing as header
    return prompt, ""


async def refine_prompt(tenant_id: str, current_prompt: str, user_feedback: str, catalog_data: str, app) -> dict:
    """Phase 2 — Refine the draft prompt using LLM + user feedback.

    Only the instruction header is sent to the LLM — the embedded catalog
    data is stripped out and reattached after refinement, keeping the LLM
    call small and fast.
    """
    try:
        llm_cfg = await _get_llm_config(tenant_id, app)
    except ClaudeClientError as exc:
        return {"status": "error", "error": str(exc)}

    # Split: only refine the instruction header, not the 100K+ catalog JSON
    header, embedded_data = _split_prompt_and_data(current_prompt)
    print(f"[snow_to_replit] Refine: header={len(header)} chars, "
          f"embedded_data={len(embedded_data)} chars (stripped from LLM call)")

    user_message = (
        f"Current Replit Agent prompt (instruction header only):\n\n{header}\n\n"
        f"User feedback:\n{user_feedback}"
    )

    try:
        refined_header, refine_meta = await call_llm(
            provider=llm_cfg["provider"],
            api_key=llm_cfg["api_key"],
            model=llm_cfg["model"],
            user_message=user_message,
            system_prompt=_REFINE_SYSTEM_PROMPT,
        )
        if not refined_header.strip():
            return {"status": "error", "error": "LLM returned an empty refinement response"}
    except ClaudeClientError as exc:
        return {"status": "error", "error": f"LLM refinement failed: {exc}"}
    except Exception as exc:
        logger.exception("Unexpected error during refinement")
        err_str = str(exc) or f"{type(exc).__name__}: {repr(exc)}"
        return {"status": "error", "error": f"Refinement failed: {err_str}"}

    await _track_llm_usage(tenant_id, llm_cfg["model"], refine_meta, "catalog-refine", app)

    # Reassemble: refined header + original catalog data
    if embedded_data:
        full_refined = refined_header.strip() + "\n\n" + embedded_data
    else:
        full_refined = refined_header.strip()

    return {"status": "ok", "refined_prompt": full_refined}


async def convert_catalog_by_title_to_replit(tenant_id: str, payload: dict, app) -> dict:
    """Fetch ServiceNow catalog by title, then LLM-analyze and return a draft prompt.

    If catalog_title is missing, returns a needs_input response so the frontend
    can ask the user for it.
    """
    catalog_title = payload.get("catalog_title", "").strip()
    if not catalog_title:
        return {
            "status": "needs_input",
            "field": "catalog_title",
            "prompt": "What is the name of the catalog?",
        }

    # 1. ServiceNow credentials
    cfg = await servicenow_tools._get_snow_config(tenant_id, app)
    print(f"[snow_to_replit] ServiceNow config loaded for tenant {tenant_id}")

    # 2. Build URL from integration endpoint (fallback to config instance_url)
    encoded_title = catalog_title.replace(" ", "%20")
    service_url = await servicenow_tools.get_endpoint_url(
        tenant_id, "Catalog By Title", app, catalogTitle=encoded_title
    )
    if not service_url:
        # Fallback: build from instance_url in config
        service_url = f"{cfg['instance_url']}/api/1939459/catalogbytitleservic/catalog/{encoded_title}"

    t0 = time.monotonic()
    try:
        resp = await _fetch_catalog(service_url, cfg["auth_header"])
    except Exception as exc:
        latency_ms = int((time.monotonic() - t0) * 1000)
        print(f"[snow_to_replit] All retries exhausted after {latency_ms}ms: {exc}")
        return {
            "status": "error",
            "error": f"ServiceNow unreachable after {_MAX_RETRIES} attempts ({latency_ms}ms) — instance may be hibernating, try again in a minute",
            "latency_ms": latency_ms,
        }
    latency_ms = int((time.monotonic() - t0) * 1000)
    print(f"[snow_to_replit] HTTP {resp.status_code} in {latency_ms}ms, body length={len(resp.text)}")

    if not resp.is_success:
        print(f"[snow_to_replit] ERROR response body: {resp.text[:500]}")
        return {"status": "error", "error": f"ServiceNow HTTP {resp.status_code}", "latency_ms": latency_ms}

    try:
        catalog_json = resp.json()
    except Exception:
        print(f"[snow_to_replit] Non-JSON body: {resp.text[:500]}")
        return {"status": "error", "error": "Non-JSON response from ServiceNow (instance may be hibernating)", "latency_ms": latency_ms}

    print(f"[snow_to_replit] Catalog JSON keys: {list(catalog_json.keys()) if isinstance(catalog_json, dict) else type(catalog_json).__name__}")

    # 2b. Feed raw catalog into the genome extraction pipeline
    try:
        extraction_id = await create_servicenow_extraction(tenant_id, catalog_title, catalog_json, app)
        print(f"[snow_to_replit] Genome extraction created: {extraction_id}")
    except Exception as exc:
        print(f"[snow_to_replit] Genome extraction failed (non-blocking): {exc}")
        extraction_id = None

    # 3. Clean the catalog locally (fast, no LLM) then load LLM config for draft
    catalog_str = json.dumps(catalog_json, indent=2)
    clean_catalog = _reformat_catalog(catalog_str)

    try:
        llm_cfg = await _get_llm_config(tenant_id, app)
    except ClaudeClientError as exc:
        return {"status": "error", "error": str(exc)}

    # 4. Generate draft Replit prompt from the clean catalog
    try:
        user_message = f"Analyze this ServiceNow catalog payload and generate a Replit Agent prompt:\n\n{clean_catalog}"
        draft_prompt, draft_meta = await call_llm(
            provider=llm_cfg["provider"],
            api_key=llm_cfg["api_key"],
            model=llm_cfg["model"],
            user_message=user_message,
            system_prompt=_DRAFT_SYSTEM_PROMPT,
        )
        if not draft_prompt.strip():
            raise ClaudeClientError("LLM returned empty draft prompt")
        print(f"[snow_to_replit] LLM draft generated ({len(draft_prompt)} chars)")
        await _track_llm_usage(tenant_id, llm_cfg["model"], draft_meta, "catalog-by-title-draft", app)
    except Exception as exc:
        print(f"[snow_to_replit] Draft generation failed, using template: {type(exc).__name__}: {exc}")
        draft_prompt = (
            "Build a modern, responsive service catalog UI using React.\n\n"
            "Use ONLY the following ServiceNow catalog data — do NOT add items "
            "not present in the data:\n\n"
            f"{clean_catalog}"
        )

    # 5. Return draft for interactive refinement (no repl created yet)
    result = {
        "status": "draft",
        "draft_prompt": draft_prompt.strip(),
        "catalog_data": clean_catalog,
        "analysis": f"Analyzed catalog \"{catalog_title}\" ({len(catalog_str)} chars), reformatted, and generated a focused Replit prompt.",
        "latency_ms": latency_ms,
    }
    if extraction_id:
        result["extraction_id"] = extraction_id
    return result


async def approve_and_create_repl(tenant_id: str, approved_prompt: str, app) -> dict:
    """Phase 3 — Create the repl on Replit with the user-approved prompt."""
    repl_url = "https://replit.com/~"
    replit_cfg = await app.state.replit_config_store.get_by_tenant(tenant_id)
    connect_sid = (replit_cfg.connect_sid if replit_cfg else "") or ""

    if connect_sid:
        repl = await _create_repl_with_prompt(
            connect_sid, "servicenow-catalog", "react-javascript", approved_prompt,
        )
        if repl and repl.get("url"):
            repl_url = f"https://replit.com{repl['url']}"
            print(f"[snow_to_replit] Opening repl: {repl_url}")

    message = (
        "Repl created with your approved prompt — open the Agent tab and paste to start building."
        if repl_url != "https://replit.com/~"
        else "Prompt copied — paste it into Replit Agent to build your catalog app."
    )
    return {
        "status": "ok",
        "message": message,
        "repl_url": repl_url,
        "prompt_text": approved_prompt,
        "app_name": "servicenow-catalog",
        "tech_stack": "react",
    }
