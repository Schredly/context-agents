"""Composite action: fetch ServiceNow catalog list → user selects → fetch full catalog → display for GitHub export."""

from __future__ import annotations

import json
import logging
import time

from services import servicenow_tools
from services.snow_to_replit import _fetch_catalog, _reformat_catalog

logger = logging.getLogger(__name__)


def _parse_catalog_names(data: dict | list) -> list[str]:
    """Extract catalog names from a ServiceNow GetCatalogsByName response."""
    if isinstance(data, dict):
        items = data.get("result", data.get("catalogs", []))
        if isinstance(items, list):
            names = []
            for item in items:
                if isinstance(item, dict):
                    name = item.get("title") or item.get("name") or item.get("catalog_title") or ""
                    if name:
                        names.append(name.strip())
                elif isinstance(item, str):
                    names.append(item.strip())
            return names
    elif isinstance(data, list):
        names = []
        for item in data:
            if isinstance(item, dict):
                name = item.get("title") or item.get("name") or ""
                if name:
                    names.append(name.strip())
            elif isinstance(item, str):
                names.append(item.strip())
        return names
    return []


async def convert_catalog_to_github(tenant_id: str, payload: dict, app) -> dict:
    """Multi-step action: list catalogs → user picks one → fetch full catalog → return for GitHub export."""
    catalog_selection = payload.get("catalog_selection", "").strip()

    # Load ServiceNow credentials
    cfg = await servicenow_tools._get_snow_config(tenant_id, app)

    if not catalog_selection:
        # Phase 1: Fetch catalog list — prefer integration endpoint, fallback to hardcoded path
        list_url = await servicenow_tools.get_endpoint_url(tenant_id, "List Catalogs", app)
        if not list_url:
            list_url = f"{cfg['instance_url']}/api/1939459/catalogtitleservice"
        print(f"[snow_to_github] Fetching catalog list from {list_url}")

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
            return {"status": "error", "error": "No catalogs found in ServiceNow response"}

        print(f"[snow_to_github] Found {len(catalogs)} catalogs: {catalogs}")

        # Build numbered list
        lines = ["\nAvailable Catalogs\n"]
        for i, name in enumerate(catalogs, 1):
            lines.append(f"  {i}  {name}")
        lines.append("\nEnter the number of the catalog to export:")

        return {
            "status": "needs_input",
            "field": "catalog_selection",
            "prompt": "\n".join(lines),
        }

    # Phase 2: User selected a catalog — resolve number to name
    list_url = await servicenow_tools.get_endpoint_url(tenant_id, "List Catalogs", app)
    if not list_url:
        list_url = f"{cfg['instance_url']}/api/1939459/catalogtitleservice"
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

    # Fetch full catalog by title — prefer integration endpoint, fallback to hardcoded path
    encoded_title = catalog_name.replace(" ", "%20")
    service_url = await servicenow_tools.get_endpoint_url(
        tenant_id, "Catalog by Title", app, catalogTitle=encoded_title
    )
    if not service_url:
        service_url = f"{cfg['instance_url']}/api/1939459/catalogbytitleservic/catalog/{encoded_title}"
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

    # Clean and format the catalog data
    catalog_str = json.dumps(catalog_json, indent=2)
    clean_catalog = _reformat_catalog(catalog_str)

    # Generate default prompt for GitHub export
    draft_prompt = (
        f"Export ServiceNow catalog \"{catalog_name}\" to a GitHub repository.\n\n"
        "Repository structure:\n"
        "- README.md — catalog overview and item descriptions\n"
        "- data/catalog.json — full catalog payload\n"
        "- docs/ — one markdown file per catalog item\n\n"
        "Include all variables, choices, categories, and workflow summaries."
    )

    return {
        "status": "draft",
        "draft_prompt": draft_prompt,
        "catalog_data": clean_catalog,
        "draft_label": "ServiceNow \u2192 GitHub Export",
        "approve_label": "Commit to GitHub",
        "target": "github",
        "analysis": f"Fetched catalog \"{catalog_name}\" ({len(catalog_str):,} chars), cleaned to {len(clean_catalog):,} chars",
        "latency_ms": latency_ms,
    }


def _build_repo_files(prompt: str, payload: str) -> dict[str, str]:
    """Parse catalog payload and generate structured repo files.

    Returns a dict of {path: content} for the repo tree:
        catalog/catalog.json
        catalog/items.json
        forms/<item_name>.json   (one per catalog item with variables)
        workflows/workflows.json
        models/data_model.json
        README.md
    """
    try:
        catalog_data = json.loads(payload)
    except (json.JSONDecodeError, TypeError):
        catalog_data = {}

    files: dict[str, str] = {}

    # --- catalog/ ---
    files["catalog/catalog.json"] = json.dumps(catalog_data, indent=2)

    # Extract catalog items (try common ServiceNow response shapes)
    items = []
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

    if items:
        files["catalog/items.json"] = json.dumps(items, indent=2)

    # --- forms/ — one file per item that has variables ---
    for item in items:
        if not isinstance(item, dict):
            continue
        name = item.get("name") or item.get("title") or item.get("short_description") or ""
        variables = item.get("variables") or item.get("fields") or item.get("questions") or []
        if name and variables:
            safe_name = name.lower().replace(" ", "_").replace("/", "_")[:60]
            files[f"forms/{safe_name}.json"] = json.dumps(
                {"name": name, "variables": variables}, indent=2,
            )

    # If no per-item forms were generated, create a placeholder
    if not any(p.startswith("forms/") for p in files):
        files["forms/.gitkeep"] = ""

    # --- workflows/ ---
    workflows = []
    for item in items:
        if not isinstance(item, dict):
            continue
        wf = item.get("workflow") or item.get("execution_plan") or item.get("flow")
        if wf:
            workflows.append({"item": item.get("name", ""), "workflow": wf})
    files["workflows/workflows.json"] = json.dumps(workflows or [], indent=2)

    # --- models/ ---
    model_fields: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        for var in item.get("variables") or item.get("fields") or []:
            if isinstance(var, dict):
                model_fields.append({
                    "catalog_item": item.get("name", ""),
                    "field": var.get("name") or var.get("label", ""),
                    "type": var.get("type", "string"),
                    "mandatory": var.get("mandatory", False),
                })
    files["models/data_model.json"] = json.dumps(model_fields or [], indent=2)

    # --- README.md ---
    item_names = [
        (it.get("name") or it.get("title") or "Untitled")
        for it in items if isinstance(it, dict)
    ]
    item_list = "\n".join(f"- {n}" for n in item_names) if item_names else "_No items extracted_"
    files["README.md"] = (
        f"# ServiceNow Catalog Export\n\n"
        f"{prompt}\n\n"
        f"## Catalog Items\n\n{item_list}\n\n"
        f"## Repository Structure\n\n"
        f"```\n"
        f"catalog/    — full catalog payload and items list\n"
        f"forms/      — per-item variable definitions\n"
        f"workflows/  — workflow and execution plan data\n"
        f"models/     — extracted data model (fields, types)\n"
        f"README.md   — this file\n"
        f"```\n\n"
        f"_Generated by [OverYonder.ai](https://overyonder.ai)_\n"
    )

    return files


async def commit_to_github(tenant_id: str, prompt: str, payload: str, app) -> dict:
    """Create an org repo and commit structured catalog files via the GitHub API.

    Steps:
      1. POST /orgs/{org}/repos — create repository
      2. PUT  /repos/{org}/{repo}/contents/{path} — commit each file
      3. Return {repo_url, commit_hash}
    """
    import httpx
    import base64 as b64

    print(f"[snow_to_github] commit_to_github called for tenant {tenant_id}")
    print(f"[snow_to_github] prompt length={len(prompt)}, payload length={len(payload)}")

    # Look for a GitHub managed integration
    integrations = await app.state.managed_integration_store.list_for_tenant(tenant_id)
    github_int = next((i for i in integrations if i.type == "github" and i.enabled and i.token), None)

    if not github_int:
        logger.info("No GitHub managed integration found for tenant %s", tenant_id)
        return {
            "status": "error",
            "message": (
                "No GitHub integration configured. Add a GitHub managed integration "
                "with an org name (base_url) and personal access token to enable repo creation."
            ),
        }

    token = github_int.token
    org = github_int.base_url.strip().rstrip("/")  # org name stored in base_url
    if not org:
        return {"status": "error", "message": "GitHub integration missing org name (set base_url to your GitHub org)."}

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }

    repo_name = "servicenow-catalog-export"

    # Step 1: Create repository under the org
    print(f"[snow_to_github] Creating repo {org}/{repo_name}")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            create_resp = await client.post(
                f"https://api.github.com/orgs/{org}/repos",
                headers=headers,
                json={
                    "name": repo_name,
                    "description": prompt[:200],
                    "private": False,
                    "auto_init": True,
                },
            )
        if create_resp.status_code == 422:
            print(f"[snow_to_github] Repo {org}/{repo_name} already exists, will update files")
        elif not create_resp.is_success:
            return {"status": "error", "message": f"Failed to create repo: HTTP {create_resp.status_code} — {create_resp.text[:200]}"}
        else:
            print(f"[snow_to_github] Created repo {org}/{repo_name}")
    except Exception as e:
        return {"status": "error", "message": f"GitHub API error: {e}"}

    repo_url = f"https://github.com/{org}/{repo_name}"

    # Step 2: Build structured file tree from catalog payload
    files = _build_repo_files(prompt, payload)
    print(f"[snow_to_github] Generated {len(files)} files for commit")

    # Step 3: Commit each file via the Contents API
    pushed = []
    commit_hash = ""
    async with httpx.AsyncClient(timeout=15.0) as client:
        for path, content in files.items():
            encoded = b64.b64encode(content.encode()).decode()
            try:
                # Check if file exists (need SHA for update)
                existing = await client.get(
                    f"https://api.github.com/repos/{org}/{repo_name}/contents/{path}",
                    headers=headers,
                )
                body: dict = {
                    "message": f"Add {path} via OverYonder.ai",
                    "content": encoded,
                }
                if existing.is_success:
                    body["sha"] = existing.json().get("sha", "")
                    body["message"] = f"Update {path} via OverYonder.ai"

                put_resp = await client.put(
                    f"https://api.github.com/repos/{org}/{repo_name}/contents/{path}",
                    headers=headers,
                    json=body,
                )
                if put_resp.is_success:
                    pushed.append(path)
                    # Capture commit SHA from the last successful push
                    resp_data = put_resp.json()
                    commit_hash = resp_data.get("commit", {}).get("sha", commit_hash)
                else:
                    print(f"[snow_to_github] Failed to push {path}: HTTP {put_resp.status_code}")
            except Exception as e:
                print(f"[snow_to_github] Error pushing {path}: {e}")

    if not pushed:
        return {"status": "error", "message": "Failed to commit any files to GitHub"}

    print(f"[snow_to_github] Committed {len(pushed)} files, last commit: {commit_hash[:12]}")

    return {
        "status": "ok",
        "message": f"Committed {len(pushed)} file(s) to {org}/{repo_name}",
        "repo_url": repo_url,
        "commit_hash": commit_hash,
        "files_pushed": pushed,
    }
