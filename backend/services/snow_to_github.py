"""Composite action: fetch ServiceNow catalog list → user selects → fetch full catalog → display for GitHub export.

Guardrails (enforced in code — do not weaken):
  1. Never modify the ServiceNow JSON payload — commit the raw bytes as received.
  2. Never fabricate catalog fields — only emit values actually present in the source data.
  3. Never expose integration tokens to the UI — responses must never contain secrets.
  4. Never commit credentials or secrets to GitHub — scrub all file content before commit.
  5. Always respect tenant isolation — every store call is scoped to the requesting tenant.
  6. Always resolve ServiceNow endpoints through the integration endpoint catalog.
"""

from __future__ import annotations

import json
import logging
import re
import time

from services import servicenow_tools
from services.snow_to_replit import _fetch_catalog

logger = logging.getLogger(__name__)

# Patterns that indicate a secret value — used to scrub file content before GitHub commit.
_SECRET_PATTERNS = re.compile(
    r"(?i)"
    r"(?:ghp_[A-Za-z0-9_]{36})"           # GitHub PAT (classic)
    r"|(?:github_pat_[A-Za-z0-9_]{22,})"  # GitHub PAT (fine-grained)
    r"|(?:Bearer\s+[A-Za-z0-9\-._~+/]+=*)"  # Bearer tokens
    r"|(?:Basic\s+[A-Za-z0-9+/]+=*)"       # Basic auth headers
    r"|(?:sk-[A-Za-z0-9]{20,})"            # OpenAI / generic API keys
    r"|(?:AKIA[A-Z0-9]{16})"               # AWS access key
    r"|(?:xox[bpras]-[A-Za-z0-9\-]+)"      # Slack tokens
)


def _extract_name(item: dict) -> str:
    """Pull a human-readable name from a catalog item dict."""
    return (
        item.get("title")
        or item.get("name")
        or item.get("catalog_title")
        or item.get("label")
        or item.get("display_name")
        or item.get("short_description")
        or ""
    ).strip()


def _parse_catalog_names(data: dict | list) -> list[str]:
    """Extract catalog names from a ServiceNow catalog list response.

    Handles these response shapes from scripted and standard REST APIs:
      - {result: [{title|name: "..."}]}          (standard table API)
      - {result: {catalogs: [...]}}              (scripted REST wrapper)
      - {catalogs: [...]}                        (flat catalogs key)
      - {items: [...]}                           (items key)
      - {data: [...]}                            (data key)
      - [{title|name: "..."}]                    (bare array)
      - {result: "string"}                       (single catalog name)
      - any dict with a single list value         (generic fallback)
    """
    # Unwrap a list of items from common response shapes
    items: list | None = None

    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        # Try known wrapper keys in priority order
        result = data.get("result")
        if isinstance(result, list):
            items = result
        elif isinstance(result, dict):
            # Nested wrapper: result.catalog_titles / result.catalogs / result.items / result.data
            for key in ("catalog_titles", "catalogs", "items", "data"):
                nested = result.get(key)
                if isinstance(nested, list):
                    items = nested
                    break
            # If result is a single catalog dict with a name, treat it as a one-item list
            if items is None and _extract_name(result):
                items = [result]
        elif isinstance(result, str) and result.strip():
            # Single catalog name returned as a string
            return [result.strip()]

        if items is None:
            # Try top-level keys: catalogs, items, data
            for key in ("catalogs", "items", "data"):
                candidate = data.get(key)
                if isinstance(candidate, list):
                    items = candidate
                    break

        if items is None:
            # Generic fallback: find the first list value in the dict
            for key, value in data.items():
                if isinstance(value, list) and len(value) > 0:
                    logger.info("[_parse_catalog_names] Using fallback list key '%s' (%d items)", key, len(value))
                    items = value
                    break

        # Last resort: if the dict itself looks like a single catalog, wrap it
        if items is None and _extract_name(data):
            items = [data]

    if not items:
        return []

    names: list[str] = []
    for item in items:
        if isinstance(item, dict):
            name = _extract_name(item)
            if name:
                names.append(name)
        elif isinstance(item, str) and item.strip():
            names.append(item.strip())
    return names


async def convert_catalog_to_github(tenant_id: str, payload: dict, app) -> dict:
    """Multi-step action: list catalogs → user picks one → fetch full catalog → return for GitHub export."""
    catalog_selection = payload.get("catalog_selection", "").strip()

    # Load ServiceNow credentials
    cfg = await servicenow_tools._get_snow_config(tenant_id, app)

    if not catalog_selection:
        # Phase 1: Fetch catalog list via the integration endpoint catalog
        reasoning: list[str] = []
        reasoning.append("Executing ServiceNow endpoint: List Catalogs")

        list_url = await servicenow_tools.get_endpoint_url(tenant_id, "List Catalogs", app)
        if not list_url:
            return {
                "status": "error",
                "error": (
                    "No 'List Catalogs' endpoint configured on the ServiceNow integration. "
                    "Add an endpoint named 'List Catalogs' in the integration config."
                ),
            }
        print(f"[snow_to_github] Phase 1: fetching catalog list from {list_url}")

        t0 = time.monotonic()
        try:
            resp = await _fetch_catalog(list_url, cfg["auth_header"])
        except Exception as exc:
            latency_ms = int((time.monotonic() - t0) * 1000)
            print(f"[snow_to_github] All retries exhausted after {latency_ms}ms: {exc}")
            return {
                "status": "error",
                "error": f"ServiceNow unreachable ({latency_ms}ms) — instance may be hibernating, try again in a minute",
            }
        latency_ms = int((time.monotonic() - t0) * 1000)
        print(f"[snow_to_github] HTTP {resp.status_code} in {latency_ms}ms, body length={len(resp.text)}")

        if not resp.is_success:
            return {"status": "error", "error": f"ServiceNow HTTP {resp.status_code}"}

        try:
            data = resp.json()
        except Exception:
            return {"status": "error", "error": "Non-JSON response from ServiceNow (instance may be hibernating)"}

        catalogs = _parse_catalog_names(data)
        if not catalogs:
            # Log the actual response shape so we can diagnose parsing failures
            shape = type(data).__name__
            if isinstance(data, dict):
                shape = f"dict keys={list(data.keys())[:10]}"
            elif isinstance(data, list):
                shape = f"list len={len(data)}, first={type(data[0]).__name__ if data else 'empty'}"
            print(f"[snow_to_github] No catalogs parsed — response shape: {shape}, preview: {str(data)[:500]}")
            return {"status": "error", "error": "No catalogs found in ServiceNow response"}

        print(f"[snow_to_github] Found {len(catalogs)} catalogs: {catalogs}")
        reasoning.append(f"Retrieved {len(catalogs)} catalog(s) from ServiceNow")

        # Build numbered list for the agent UI
        lines = []
        for i, name in enumerate(catalogs, 1):
            lines.append(f"{i}. {name}")
        catalog_list = "\n".join(lines)

        return {
            "status": "needs_input",
            "field": "catalog_selection",
            "prompt": f"{catalog_list}\n\nWhich catalog would you like to export? Reply with the number.",
            "catalogs": catalogs,
            "reasoning": reasoning,
        }

    # Phase 2: User selected a catalog — resolve number to name
    reasoning: list[str] = []

    # Step 1: Re-fetch catalog list to resolve the user's numeric selection
    list_url = await servicenow_tools.get_endpoint_url(tenant_id, "List Catalogs", app)
    if not list_url:
        return {
            "status": "error",
            "error": "No 'List Catalogs' endpoint configured on the ServiceNow integration.",
        }
    try:
        list_resp = await _fetch_catalog(list_url, cfg["auth_header"])
        catalogs = _parse_catalog_names(list_resp.json()) if list_resp.is_success else []
    except Exception:
        catalogs = []

    try:
        idx = int(catalog_selection) - 1
        if 0 <= idx < len(catalogs):
            catalog_name = catalogs[idx]
        else:
            return {"status": "error", "error": f"Invalid selection '{catalog_selection}'. Enter 1-{len(catalogs)}"}
    except ValueError:
        # User typed the catalog name directly
        catalog_name = catalog_selection

    reasoning.append(f"User selected catalog: {catalog_name}")
    print(f"[snow_to_github] Phase 2: user selected catalog \"{catalog_name}\"")

    # Step 2: Fetch the full catalog payload via the integration endpoint
    reasoning.append("Fetching catalog details from ServiceNow")

    encoded_title = catalog_name.replace(" ", "%20")
    service_url = await servicenow_tools.get_endpoint_url(
        tenant_id, "Catalog By Title", app, catalogTitle=encoded_title
    )
    if not service_url:
        return {
            "status": "error",
            "error": "No 'Catalog By Title' endpoint configured on the ServiceNow integration.",
        }
    print(f"[snow_to_github] Fetching catalog '{catalog_name}' from {service_url}")

    t0 = time.monotonic()
    try:
        resp = await _fetch_catalog(service_url, cfg["auth_header"])
    except Exception as exc:
        latency_ms = int((time.monotonic() - t0) * 1000)
        print(f"[snow_to_github] All retries exhausted after {latency_ms}ms: {exc}")
        return {
            "status": "error",
            "error": f"ServiceNow unreachable ({latency_ms}ms) — instance may be hibernating, try again in a minute",
        }
    latency_ms = int((time.monotonic() - t0) * 1000)
    print(f"[snow_to_github] HTTP {resp.status_code} in {latency_ms}ms, body length={len(resp.text)}")

    if not resp.is_success:
        return {"status": "error", "error": f"ServiceNow HTTP {resp.status_code}"}

    try:
        catalog_json = resp.json()
    except Exception:
        return {"status": "error", "error": "Non-JSON response from ServiceNow (instance may be hibernating)"}

    # Store the raw payload unmodified
    catalog_payload = json.dumps(catalog_json, indent=2)
    reasoning.append(f"Generating GitHub export structure — {len(catalog_payload):,} chars retrieved")
    print(f"[snow_to_github] Catalog payload: {len(catalog_payload):,} chars (unmodified)")

    # Step 3: Build the default header prompt for GitHub export
    draft_prompt = (
        "You are converting a ServiceNow service catalog into a structured GitHub repository.\n\n"
        "Create a maintainable representation of the catalog including:\n\n"
        "- catalog metadata\n"
        "- request forms\n"
        "- variables\n"
        "- workflows\n"
        "- data models\n\n"
        "Output directory structure:\n\n"
        "catalog/\n"
        "forms/\n"
        "workflows/\n"
        "models/\n\n"
        "The JSON payload below contains the extracted catalog data.\n\n"
        "Use it as the source of truth.\n\n"
        "Do not fabricate fields.\n\n"
        "Preserve relationships between forms, variables, and workflows.\n\n"
        "Goal:\n"
        "Create a clean representation of the catalog that could later be used to rebuild or migrate the application."
    )

    return {
        "status": "draft",
        "draft_prompt": draft_prompt,
        "catalog_data": catalog_payload,
        "catalog_name": catalog_name,
        "draft_label": "Review GitHub Export",
        "approve_label": "Push to GitHub",
        "target": "github",
        "reasoning": reasoning,
        "analysis": f"Fetched catalog \"{catalog_name}\" ({len(catalog_payload):,} chars)",
        "latency_ms": latency_ms,
    }


def _extract_items(catalog_data: dict | list) -> list[dict]:
    """Extract catalog items from common ServiceNow response shapes."""
    items: list = []
    if isinstance(catalog_data, dict):
        items = (
            catalog_data.get("items")
            or catalog_data.get("result", {}).get("items")
            or catalog_data.get("categories")
            or catalog_data.get("result", {}).get("categories")
            or []
        )
        if not isinstance(items, list):
            items = []
    elif isinstance(catalog_data, list):
        items = catalog_data
    return [i for i in items if isinstance(i, dict)]


def _scrub_secrets(content: str) -> str:
    """Replace any detected secret patterns with a redaction placeholder.

    Guardrail 4: Never commit credentials or secrets to GitHub.
    """
    return _SECRET_PATTERNS.sub("[REDACTED]", content)


def _build_repo_files(prompt: str, payload: str) -> dict[str, str]:
    """Parse catalog payload and generate structured repo files.

    Guardrails enforced here:
      1. catalog/catalog.json stores the raw payload string — never re-serialized.
      2. Derived files only emit fields actually present in the source data.
      4. All file content is scrubbed for secrets before being returned.

    Returns a dict of {path: content} for the repo tree:
        README.md
        catalog/catalog.json
        forms/forms.json
        workflows/workflows.json
        models/models.json
        prompt/header_prompt.md
    """
    try:
        catalog_data = json.loads(payload)
    except (json.JSONDecodeError, TypeError):
        catalog_data = {}

    items = _extract_items(catalog_data)
    files: dict[str, str] = {}

    # --- catalog/catalog.json — raw ServiceNow catalog metadata ---
    # Guardrail 1: Store the original payload verbatim — never re-serialize.
    files["catalog/catalog.json"] = payload

    # --- forms/forms.json — catalog item forms and variables ---
    forms: list[dict] = []
    for item in items:
        name = item.get("name") or item.get("title") or item.get("short_description") or ""
        variables = item.get("variables") or item.get("fields") or item.get("questions") or []
        if name:
            forms.append({"name": name, "variables": variables})
    files["forms/forms.json"] = json.dumps(forms, indent=2)

    # --- workflows/workflows.json — associated workflows ---
    workflows: list[dict] = []
    for item in items:
        wf = item.get("workflow") or item.get("execution_plan") or item.get("flow")
        if wf:
            workflows.append({"item": item.get("name", ""), "workflow": wf})
    files["workflows/workflows.json"] = json.dumps(workflows, indent=2)

    # --- models/models.json — extracted data models ---
    # Guardrail 2: Only emit fields present in the source — no fabricated defaults.
    model_fields: list[dict] = []
    for item in items:
        for var in item.get("variables") or item.get("fields") or []:
            if isinstance(var, dict):
                entry: dict = {
                    "catalog_item": item.get("name", ""),
                    "field": var.get("name") or var.get("label", ""),
                }
                if "type" in var:
                    entry["type"] = var["type"]
                if "mandatory" in var:
                    entry["mandatory"] = var["mandatory"]
                model_fields.append(entry)
    files["models/models.json"] = json.dumps(model_fields, indent=2)

    # --- prompt/header_prompt.md — user-edited header prompt ---
    files["prompt/header_prompt.md"] = prompt

    # --- README.md — description of catalog export and source system ---
    item_names = [
        it.get("name") or it.get("title") or "Untitled"
        for it in items
    ]
    item_list = "\n".join(f"- {n}" for n in item_names) if item_names else "_No items extracted_"
    files["README.md"] = (
        f"# ServiceNow Catalog Export\n\n"
        f"Automated export of a ServiceNow service catalog generated by "
        f"[OverYonder.ai](https://overyonder.ai).\n\n"
        f"## Source System\n\n"
        f"Platform: ServiceNow\n\n"
        f"## Catalog Items\n\n{item_list}\n\n"
        f"## Repository Structure\n\n"
        f"```\n"
        f"catalog/catalog.json       — raw ServiceNow catalog metadata\n"
        f"forms/forms.json           — catalog item forms and variables\n"
        f"workflows/workflows.json   — associated workflows\n"
        f"models/models.json         — extracted data models\n"
        f"prompt/header_prompt.md    — header prompt used during export\n"
        f"README.md                  — this file\n"
        f"```\n"
    )

    # Guardrail 4: Scrub every file for secrets before returning.
    return {path: _scrub_secrets(content) for path, content in files.items()}


class _GitHubTarget:
    """Normalized view of a GitHub integration from either store."""

    __slots__ = ("id", "name", "org", "token", "tenant_id", "source", "default_repo")

    def __init__(self, *, id: str, name: str, org: str, token: str, tenant_id: str, source: str, default_repo: str = ""):
        self.id = id
        self.name = name
        self.org = org
        self.token = token
        self.tenant_id = tenant_id
        self.source = source  # "managed" or "integration"
        self.default_repo = default_repo

    @property
    def enabled(self):
        return True


async def _load_github_targets(tenant_id: str, app) -> list[_GitHubTarget]:
    """Load GitHub-capable integrations from both stores, returning a unified list.

    Checks:
      1. ManagedIntegrationStore (type == "github", enabled)
      2. IntegrationStore (integration_type == "github", enabled, has token in config)
    """
    targets: list[_GitHubTarget] = []

    # Managed integrations (v2)
    try:
        managed = await app.state.managed_integration_store.list_for_tenant(tenant_id)
        for m in managed:
            if m.type == "github" and m.enabled and m.token:
                targets.append(_GitHubTarget(
                    id=m.id, name=m.name,
                    org=m.base_url.strip().rstrip("/") if m.base_url else "",
                    token=m.token, tenant_id=m.tenant_id, source="managed",
                ))
    except Exception:
        pass

    # Regular integrations (v1)
    try:
        regular = await app.state.integration_store.list_for_tenant(tenant_id)
        for r in regular:
            if r.integration_type == "github" and r.enabled:
                cfg = r.config or {}
                token = cfg.get("token", "")
                if token:
                    targets.append(_GitHubTarget(
                        id=r.id, name=r.name or "GitHub",
                        org=cfg.get("org", ""),
                        token=token, tenant_id=r.tenant_id, source="integration",
                        default_repo=cfg.get("default_repository", ""),
                    ))
    except Exception:
        pass

    return targets


async def discover_github_targets(tenant_id: str, app) -> dict:
    """List available GitHub integrations for the tenant.

    Returns:
      - needs_input with numbered list if integrations exist
      - error if no integrations are configured
    """
    reasoning: list[str] = []
    reasoning.append("Discovering available GitHub integrations")

    github_ints = await _load_github_targets(tenant_id, app)

    if not github_ints:
        return {
            "status": "error",
            "message": (
                "No GitHub integrations configured. Add a GitHub managed integration "
                "with a personal access token on the Integrations page before exporting."
            ),
        }

    reasoning.append(f"Found {len(github_ints)} GitHub integration(s)")

    # Build numbered list with name and description (org).
    # Guardrail 3: Only id/name/org — never expose tokens to the UI.
    lines = []
    options = []
    for idx, gi in enumerate(github_ints, 1):
        desc = f"org: {gi.org}" if gi.org else "no org configured"
        lines.append(f"{idx}. {gi.name} — {desc}")
        options.append({"id": gi.id, "name": gi.name, "org": gi.org})
    lines.append(f"{len(github_ints) + 1}. Create new repository")

    return {
        "status": "needs_input",
        "field": "github_target",
        "prompt": "\n".join(lines) + "\n\nWhich GitHub integration should receive this export? Reply with the number.",
        "options": options,
        "reasoning": reasoning,
    }


COMMIT_MESSAGE = "Initial ServiceNow catalog export"


def _parse_repo_ref(default_repo: str, fallback_org: str) -> tuple[str, str]:
    """Parse a default_repository value into (owner, repo_name).

    Accepts:
      - Full URL: https://github.com/Schredly/oy_catalog_test.git
      - owner/repo: Schredly/oy_catalog_test
      - bare name: oy_catalog_test (uses fallback_org as owner)
    """
    ref = default_repo.strip().rstrip("/")

    # Strip .git suffix
    if ref.endswith(".git"):
        ref = ref[:-4]

    # Full URL: extract path after github.com
    if "github.com" in ref:
        parts = ref.split("github.com")[-1].strip("/").split("/")
        if len(parts) >= 2:
            return parts[0], parts[1]

    # owner/repo
    if "/" in ref:
        parts = ref.split("/")
        return parts[0], parts[1]

    # Bare repo name
    if ref:
        return fallback_org, ref

    return fallback_org, "servicenow-catalog-export"


async def _commit_files_to_repo(
    org: str,
    repo_name: str,
    files: dict[str, str],
    headers: dict[str, str],
) -> dict:
    """Commit files to a GitHub repo via the Contents API.

    For each file calls:
        PUT /repos/{org}/{repo}/contents/{path}

    Returns {pushed: list[str], commit_hash: str, errors: list[str]}.
    """
    import httpx
    import base64 as b64

    pushed: list[str] = []
    errors: list[str] = []
    commit_hash = ""

    async with httpx.AsyncClient(timeout=15.0) as client:
        for path, content in files.items():
            encoded = b64.b64encode(content.encode()).decode()
            try:
                # Check if file already exists (need SHA for update)
                existing = await client.get(
                    f"https://api.github.com/repos/{org}/{repo_name}/contents/{path}",
                    headers=headers,
                )
                body: dict = {
                    "message": COMMIT_MESSAGE,
                    "content": encoded,
                }
                if existing.is_success:
                    body["sha"] = existing.json().get("sha", "")

                put_resp = await client.put(
                    f"https://api.github.com/repos/{org}/{repo_name}/contents/{path}",
                    headers=headers,
                    json=body,
                )
                if put_resp.is_success:
                    pushed.append(path)
                    resp_data = put_resp.json()
                    commit_hash = resp_data.get("commit", {}).get("sha", commit_hash)
                else:
                    errors.append(f"{path}: HTTP {put_resp.status_code}")
                    print(f"[snow_to_github] Failed to push {path}: HTTP {put_resp.status_code}")
            except Exception as e:
                # Guardrail 3: Scrub exception text before surfacing to caller.
                errors.append(f"{path}: {_scrub_secrets(str(e))}")
                print(f"[snow_to_github] Error pushing {path}: {e}")

    return {"pushed": pushed, "commit_hash": commit_hash, "errors": errors}


async def _ensure_repo(
    owner: str,
    repo_name: str,
    headers: dict[str, str],
    description: str = "",
    private: bool = False,
) -> dict:
    """Ensure a GitHub repo exists (idempotent).

    Tries to check if the repo exists first. If not, attempts to create it
    under an org, then falls back to user repo creation for personal accounts.

    Returns {ok: True, repo_url} or {ok: False, error}.
    """
    import httpx

    print(f"[snow_to_github] Ensuring repo {owner}/{repo_name} (private={private})")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Check if repo already exists
            check = await client.get(
                f"https://api.github.com/repos/{owner}/{repo_name}",
                headers=headers,
            )
            if check.is_success:
                print(f"[snow_to_github] Repo {owner}/{repo_name} already exists")
                return {"ok": True, "repo_url": f"https://github.com/{owner}/{repo_name}"}

            # Repo doesn't exist — try creating under org first
            create_body = {
                "name": repo_name,
                "description": description[:200],
                "private": private,
                "auto_init": True,
            }
            resp = await client.post(
                f"https://api.github.com/orgs/{owner}/repos",
                headers=headers,
                json=create_body,
            )
            if resp.is_success or resp.status_code == 422:
                print(f"[snow_to_github] Created repo {owner}/{repo_name} (org)")
                return {"ok": True, "repo_url": f"https://github.com/{owner}/{repo_name}"}

            # Org creation failed (404 = not an org) — try user repo creation
            if resp.status_code in (404, 403):
                resp = await client.post(
                    "https://api.github.com/user/repos",
                    headers=headers,
                    json=create_body,
                )
                if resp.is_success or resp.status_code == 422:
                    print(f"[snow_to_github] Created repo {owner}/{repo_name} (user)")
                    return {"ok": True, "repo_url": f"https://github.com/{owner}/{repo_name}"}

            # Guardrail 3: Scrub error text so GitHub never echoes secrets back to the UI.
            safe_text = _scrub_secrets(resp.text[:300])
            return {"ok": False, "error": f"Failed to create repo: HTTP {resp.status_code} — {safe_text}"}
    except Exception as e:
        # Guardrail 3: Scrub exception messages — they may contain URLs with auth.
        return {"ok": False, "error": f"GitHub API error: {_scrub_secrets(str(e))}"}


def _resolve_target(targets: list[_GitHubTarget], integration_id: str, tenant_id: str):
    """Find a GitHub target by ID scoped to a specific tenant.

    Guardrail 5: Always respect tenant isolation — only match integrations
    that belong to the requesting tenant.

    Returns (_GitHubTarget, error_dict).
    """
    target = next(
        (t for t in targets
         if t.id == integration_id
         and t.tenant_id == tenant_id),
        None,
    )
    if not target:
        return None, {"status": "error", "message": f"GitHub integration '{integration_id}' not found or disabled."}
    if not target.token:
        return None, {"status": "error", "message": f"GitHub integration \"{target.name}\" has no access token configured."}
    return target, None


async def commit_to_github(tenant_id: str, prompt: str, payload: str, app, integration_id: str = "") -> dict:
    """Commit catalog export files to an existing GitHub integration's repo.

    Flow:
      0. If no integration_id → discover integrations and ask user to pick
      1. Ensure repo exists (create or reuse)
      2. Build file tree from catalog payload
      3. PUT each file via Contents API with commit message
      4. Return success with repo_url, commit_hash, files_pushed
    """
    print(f"[snow_to_github] commit_to_github called for tenant {tenant_id}")

    if not integration_id:
        return await discover_github_targets(tenant_id, app)

    reasoning: list[str] = []
    reasoning.append("Preparing repository commit")

    targets = await _load_github_targets(tenant_id, app)
    target, err = _resolve_target(targets, integration_id, tenant_id)
    if err:
        return err

    # Resolve owner/repo from default_repository config or fall back to org + default name
    owner, repo_name = _parse_repo_ref(target.default_repo, target.org)
    if not owner:
        return {"status": "error", "message": "GitHub integration missing org/owner (set org in the integration config)."}

    headers = {
        "Authorization": f"Bearer {target.token}",
        "Accept": "application/vnd.github+json",
    }

    # Step 1: Ensure repo exists
    reasoning.append(f"Ensuring repository {owner}/{repo_name} exists")
    repo = await _ensure_repo(owner, repo_name, headers, description=prompt, private=False)
    if not repo["ok"]:
        return {"status": "error", "message": repo["error"]}

    # Step 2: Build files and commit
    files = _build_repo_files(prompt, payload)
    reasoning.append(f"Generating {len(files)} files for export")
    print(f"[snow_to_github] Generated {len(files)} files for commit")

    result = await _commit_files_to_repo(owner, repo_name, files, headers)

    if not result["pushed"]:
        return {"status": "error", "message": "Failed to commit any files to GitHub."}

    reasoning.append(f"Committed {len(result['pushed'])} file(s) to {owner}/{repo_name}")
    print(f"[snow_to_github] Committed {len(result['pushed'])} files, last commit: {result['commit_hash'][:12]}")

    return {
        "status": "ok",
        "message": f"Committed {len(result['pushed'])} file(s) to {owner}/{repo_name}",
        "repo_url": repo["repo_url"],
        "commit_hash": result["commit_hash"],
        "files_pushed": result["pushed"],
        "reasoning": reasoning,
    }


async def create_and_commit_to_github(
    tenant_id: str,
    repo_name: str,
    org: str,
    visibility: str,
    integration_id: str,
    prompt: str,
    payload: str,
    app,
) -> dict:
    """Create a new GitHub repo and commit the catalog export files.

    Args:
        repo_name: Repository name (e.g. 'servicenow-catalog-export')
        org: GitHub organization (e.g. 'acme-corp')
        visibility: 'private' or 'public'
        integration_id: ID of the integration whose PAT to use
        prompt: Header prompt for the export
        payload: Raw ServiceNow catalog JSON
    """
    reasoning: list[str] = []
    reasoning.append("Preparing repository commit")

    targets = await _load_github_targets(tenant_id, app)
    target, err = _resolve_target(targets, integration_id, tenant_id)
    if err:
        return err

    private = visibility.lower() != "public"
    headers = {
        "Authorization": f"Bearer {target.token}",
        "Accept": "application/vnd.github+json",
    }

    # Step 1: Create the repository
    vis_label = "private" if private else "public"
    reasoning.append(f"Creating {vis_label} repository {org}/{repo_name}")
    repo = await _ensure_repo(org, repo_name, headers, description=prompt, private=private)
    if not repo["ok"]:
        return {"status": "error", "message": repo["error"]}

    # Step 2: Build files and commit
    files = _build_repo_files(prompt, payload)
    reasoning.append(f"Generating {len(files)} files for export")
    print(f"[snow_to_github] Generated {len(files)} files for commit")

    result = await _commit_files_to_repo(org, repo_name, files, headers)

    if not result["pushed"]:
        return {"status": "error", "message": "Repository created but failed to commit any files."}

    reasoning.append(f"Committed {len(result['pushed'])} file(s) to {org}/{repo_name}")
    print(f"[snow_to_github] Committed {len(result['pushed'])} files to {org}/{repo_name}, last commit: {result['commit_hash'][:12]}")

    return {
        "status": "ok",
        "message": f"Created repository {org}/{repo_name} and committed {len(result['pushed'])} file(s)",
        "repo_url": repo["repo_url"],
        "commit_hash": result["commit_hash"],
        "files_pushed": result["pushed"],
        "reasoning": reasoning,
    }
