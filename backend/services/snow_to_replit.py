"""Composite action: fetch ServiceNow catalog JSON → LLM-analyze → interactive refinement → create Replit app."""

from __future__ import annotations

import json
import logging
import time
import uuid

import httpx

from services import servicenow_tools
from services.claude_client import call_llm, ClaudeClientError
from models import LLMUsageEvent, calculate_llm_cost

logger = logging.getLogger(__name__)

# ServiceNow dev instances hibernate — first request wakes them and can take 60-90s.
_SNOW_TIMEOUT = 90
_MAX_RETRIES = 2
_RETRY_DELAY = 5  # seconds between retries

_GRAPHQL_URL = "https://replit.com/graphql"

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


_DRAFT_SYSTEM_PROMPT = """\
You are analyzing a ServiceNow service catalog payload. Your job:
1. Identify EXACTLY which catalog items, fields, and categories are in the data
2. Generate a precise Replit Agent prompt to build a modern, responsive service catalog UI
3. The prompt MUST instruct Replit to build ONLY the catalog items found in the data
4. Do NOT add any catalog items, categories, or content not present in the data
5. Specify: React, modern design, proper form fields per catalog item, request submission flow

Return ONLY the Replit Agent prompt text — no preamble or explanation.\
"""

_REFINE_SYSTEM_PROMPT = """\
You are refining a Replit Agent prompt for building a service catalog.
Here is the current prompt and the user's feedback. Update the prompt
to incorporate the feedback. Keep focus on ONLY the catalog items from
the original ServiceNow data. Return ONLY the updated prompt text.\
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


async def convert_catalog_to_replit(tenant_id: str, payload: dict, app) -> dict:
    """Phase 1 — Fetch ServiceNow catalog, call LLM to analyze, return a draft prompt for review."""

    # 1. ServiceNow credentials
    cfg = await servicenow_tools._get_snow_config(tenant_id, app)
    print(f"[snow_to_replit] ServiceNow config loaded for tenant {tenant_id}")

    # 2. Fetch catalog data from the static service_url parameter
    service_url = payload.get("service_url", "")
    if not service_url:
        return {"status": "error", "error": "Missing service_url parameter"}

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

    # 3. Load tenant LLM config and call LLM to analyze the catalog
    catalog_str = json.dumps(catalog_json, indent=2)
    try:
        llm_cfg = await _get_llm_config(tenant_id, app)
        user_message = f"Analyze this ServiceNow catalog payload and generate a Replit Agent prompt:\n\n{catalog_str}"
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
    except ClaudeClientError as exc:
        print(f"[snow_to_replit] LLM error, falling back to template: {exc}")
        draft_prompt = (
            "Build a modern, responsive service catalog UI using React.\n\n"
            "Use ONLY the following ServiceNow catalog data — do NOT add items "
            "not present in the data:\n\n"
            f"{catalog_str}"
        )

    # 4. Return draft for interactive refinement (no repl created yet)
    return {
        "status": "draft",
        "draft_prompt": draft_prompt.strip(),
        "catalog_data": catalog_str,
        "analysis": f"Analyzed catalog payload ({len(catalog_str)} chars) and generated a focused Replit prompt.",
        "latency_ms": latency_ms,
    }


async def refine_prompt(tenant_id: str, current_prompt: str, user_feedback: str, catalog_data: str, app) -> dict:
    """Phase 2 — Refine the draft prompt using LLM + user feedback."""
    try:
        llm_cfg = await _get_llm_config(tenant_id, app)
    except ClaudeClientError as exc:
        return {"status": "error", "error": str(exc)}

    user_message = (
        f"Current Replit Agent prompt:\n\n{current_prompt}\n\n"
        f"User feedback:\n{user_feedback}\n\n"
        f"Original ServiceNow catalog data for reference:\n{catalog_data[:4000]}"
    )

    try:
        refined, refine_meta = await call_llm(
            provider=llm_cfg["provider"],
            api_key=llm_cfg["api_key"],
            model=llm_cfg["model"],
            user_message=user_message,
            system_prompt=_REFINE_SYSTEM_PROMPT,
        )
    except ClaudeClientError as exc:
        return {"status": "error", "error": f"LLM refinement failed: {exc}"}

    await _track_llm_usage(tenant_id, llm_cfg["model"], refine_meta, "catalog-refine", app)
    return {"status": "ok", "refined_prompt": refined.strip()}


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

    # 2. Build URL: replace spaces with %20
    encoded_title = catalog_title.replace(" ", "%20")
    service_url = f"https://dev221705.service-now.com/api/1939459/catalogbytitleservice/catalog/{encoded_title}"

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

    # 3. Load tenant LLM config and call LLM to analyze the catalog
    catalog_str = json.dumps(catalog_json, indent=2)
    try:
        llm_cfg = await _get_llm_config(tenant_id, app)
        user_message = f"Analyze this ServiceNow catalog payload and generate a Replit Agent prompt:\n\n{catalog_str}"
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
    except ClaudeClientError as exc:
        print(f"[snow_to_replit] LLM error, falling back to template: {exc}")
        draft_prompt = (
            "Build a modern, responsive service catalog UI using React.\n\n"
            "Use ONLY the following ServiceNow catalog data — do NOT add items "
            "not present in the data:\n\n"
            f"{catalog_str}"
        )

    # 4. Return draft for interactive refinement (no repl created yet)
    return {
        "status": "draft",
        "draft_prompt": draft_prompt.strip(),
        "catalog_data": catalog_str,
        "analysis": f"Analyzed catalog \"{catalog_title}\" ({len(catalog_str)} chars) and generated a focused Replit prompt.",
        "latency_ms": latency_ms,
    }


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
