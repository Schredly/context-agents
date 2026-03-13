import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from models import (
    AddEndpointRequest,
    CreateIntegrationRequest,
    Integration,
    IntegrationEndpoint,
    INTEGRATION_CATALOG,
    UpdateEndpointRequest,
    UpdateIntegrationConfigRequest,
)

router = APIRouter(prefix="/api/admin/{tenant_id}/integrations", tags=["integrations"])


async def _require_tenant(tenant_id: str, request: Request):
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


def _connection_status(integration: Integration, snow_cfg, drive_cfg, replit_cfg=None) -> str:
    if integration.integration_type == "servicenow":
        return "connected" if snow_cfg is not None else "not-connected"
    if integration.integration_type == "google-drive":
        return "connected" if drive_cfg is not None else "not-connected"
    if integration.integration_type == "replit":
        return "connected" if replit_cfg is not None else "not-connected"
    # For other types, derive from config + enabled
    if integration.config and integration.enabled:
        return "connected"
    return "not-connected"


def _serialize(integration: Integration, connection_status: str, catalog: dict | None = None) -> dict:
    data = integration.model_dump()
    data["connection_status"] = connection_status
    data["created_at"] = integration.created_at.isoformat()
    data["updated_at"] = integration.updated_at.isoformat()
    # Ensure name is populated (backfill for old records without name)
    if not data.get("name") and catalog:
        entry = catalog.get(integration.integration_type)
        if entry:
            data["name"] = entry["name"]
    return data


# --- Catalog ---


@router.get("/catalog")
async def get_catalog():
    return INTEGRATION_CATALOG


# --- List ---


@router.get("/")
async def list_integrations(tenant_id: str, request: Request, filter_tenant: Optional[str] = Query(None)):
    await _require_tenant(tenant_id, request)
    store = request.app.state.integration_store
    if filter_tenant is not None:
        integrations = await store.list_filtered(filter_tenant)
    else:
        integrations = await store.list_for_tenant(tenant_id)

    snow_cfg = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    drive_cfg = await request.app.state.drive_config_store.get_by_tenant(tenant_id)
    replit_cfg = await request.app.state.replit_config_store.get_by_tenant(tenant_id)

    results = []
    for i in integrations:
        status = _connection_status(i, snow_cfg, drive_cfg, replit_cfg)
        results.append(_serialize(i, status))
    return results


# --- Create ---


MULTI_INSTANCE_TYPES = {"github"}


@router.post("/", status_code=201)
async def create_integration(tenant_id: str, body: CreateIntegrationRequest, request: Request):
    await _require_tenant(tenant_id, request)
    if body.integration_type not in INTEGRATION_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unknown integration type: {body.integration_type}")

    store = request.app.state.integration_store

    # Types that allow multiple instances skip the uniqueness check
    if body.integration_type not in MULTI_INSTANCE_TYPES:
        existing = await store.get_by_type(tenant_id, body.integration_type)
        if existing is not None:
            raise HTTPException(status_code=409, detail=f"Integration '{body.integration_type}' already exists for this tenant")

    # Default name from catalog if not provided
    default_name = INTEGRATION_CATALOG[body.integration_type]["name"]
    name = body.name.strip() if body.name else default_name

    integration = Integration(
        id=f"int_{uuid.uuid4().hex[:12]}",
        tenant_id=tenant_id,
        integration_type=body.integration_type,
        name=name,
    )
    created = await store.create(integration)

    snow_cfg = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    drive_cfg = await request.app.state.drive_config_store.get_by_tenant(tenant_id)
    replit_cfg = await request.app.state.replit_config_store.get_by_tenant(tenant_id)
    return _serialize(created, _connection_status(created, snow_cfg, drive_cfg, replit_cfg))


# --- Get single ---


@router.get("/{integration_id}")
async def get_integration(tenant_id: str, integration_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    integration = await request.app.state.integration_store.get(integration_id)
    if integration is None or integration.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Integration not found")

    snow_cfg = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    drive_cfg = await request.app.state.drive_config_store.get_by_tenant(tenant_id)
    replit_cfg = await request.app.state.replit_config_store.get_by_tenant(tenant_id)
    return _serialize(integration, _connection_status(integration, snow_cfg, drive_cfg, replit_cfg))


# --- Rename ---


@router.put("/{integration_id}/name")
async def rename_integration(
    tenant_id: str, integration_id: str, body: dict, request: Request
):
    await _require_tenant(tenant_id, request)
    store = request.app.state.integration_store
    integration = await store.get(integration_id)
    if integration is None or integration.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Integration not found")

    new_name = (body.get("name") or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name is required")

    updated = await store.update(integration_id, name=new_name)
    snow_cfg = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    drive_cfg = await request.app.state.drive_config_store.get_by_tenant(tenant_id)
    replit_cfg = await request.app.state.replit_config_store.get_by_tenant(tenant_id)
    return _serialize(updated, _connection_status(updated, snow_cfg, drive_cfg, replit_cfg))


# --- Reassign tenant ---


@router.put("/{integration_id}/tenant")
async def reassign_tenant(
    tenant_id: str, integration_id: str, body: dict, request: Request
):
    await _require_tenant(tenant_id, request)
    store = request.app.state.integration_store
    integration = await store.get(integration_id)
    if integration is None or integration.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Integration not found")

    new_tenant_id = (body.get("tenant_id") or "").strip()
    if not new_tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id is required")

    # Verify target tenant exists
    target = await request.app.state.tenant_store.get(new_tenant_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Target tenant not found")

    updated = await store.update(integration_id, tenant_id=new_tenant_id)
    snow_cfg = await request.app.state.snow_config_store.get_by_tenant(new_tenant_id)
    drive_cfg = await request.app.state.drive_config_store.get_by_tenant(new_tenant_id)
    replit_cfg = await request.app.state.replit_config_store.get_by_tenant(new_tenant_id)
    return _serialize(updated, _connection_status(updated, snow_cfg, drive_cfg, replit_cfg))


# --- Update config ---


@router.put("/{integration_id}/config")
async def update_config(
    tenant_id: str, integration_id: str, body: UpdateIntegrationConfigRequest, request: Request
):
    await _require_tenant(tenant_id, request)
    store = request.app.state.integration_store
    integration = await store.get(integration_id)
    if integration is None or integration.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Integration not found")

    updated = await store.update(integration_id, config=body.config)

    # Sync to existing config stores
    if integration.integration_type == "servicenow":
        cfg = body.config
        if cfg.get("instance_url") and cfg.get("username") and cfg.get("password"):
            await request.app.state.snow_config_store.upsert(
                tenant_id,
                instance_url=cfg["instance_url"],
                username=cfg["username"],
                password=cfg["password"],
            )
    elif integration.integration_type == "google-drive":
        cfg = body.config
        if cfg.get("root_folder_id"):
            await request.app.state.drive_config_store.upsert(
                tenant_id,
                root_folder_id=cfg["root_folder_id"],
                client_id=cfg.get("client_id"),
            )
    elif integration.integration_type == "replit":
        cfg = body.config
        if cfg.get("connect_sid"):
            await request.app.state.replit_config_store.upsert(
                tenant_id, connect_sid=cfg["connect_sid"], username=cfg.get("username", ""))

    snow_cfg = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    drive_cfg = await request.app.state.drive_config_store.get_by_tenant(tenant_id)
    replit_cfg = await request.app.state.replit_config_store.get_by_tenant(tenant_id)
    return _serialize(updated, _connection_status(updated, snow_cfg, drive_cfg, replit_cfg))


# --- Enable / Disable ---


@router.put("/{integration_id}/enable")
async def enable_integration(tenant_id: str, integration_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    store = request.app.state.integration_store
    integration = await store.get(integration_id)
    if integration is None or integration.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Integration not found")

    updated = await store.update(integration_id, enabled=True)
    snow_cfg = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    drive_cfg = await request.app.state.drive_config_store.get_by_tenant(tenant_id)
    replit_cfg = await request.app.state.replit_config_store.get_by_tenant(tenant_id)
    return _serialize(updated, _connection_status(updated, snow_cfg, drive_cfg, replit_cfg))


@router.put("/{integration_id}/disable")
async def disable_integration(tenant_id: str, integration_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    store = request.app.state.integration_store
    integration = await store.get(integration_id)
    if integration is None or integration.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Integration not found")

    updated = await store.update(integration_id, enabled=False)
    snow_cfg = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    drive_cfg = await request.app.state.drive_config_store.get_by_tenant(tenant_id)
    replit_cfg = await request.app.state.replit_config_store.get_by_tenant(tenant_id)
    return _serialize(updated, _connection_status(updated, snow_cfg, drive_cfg, replit_cfg))


# --- Test connection ---


@router.post("/{integration_id}/test")
async def test_integration(tenant_id: str, integration_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    integration = await request.app.state.integration_store.get(integration_id)
    if integration is None or integration.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Integration not found")

    if integration.integration_type == "servicenow":
        cfg = integration.config
        instance_url = cfg.get("instance_url", "")
        username = cfg.get("username", "")
        password = cfg.get("password", "")
        if not instance_url or not username or not password:
            return {"ok": False, "detail": "Missing ServiceNow config fields"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{instance_url.rstrip('/')}/api/now/table/incident",
                    params={"sysparm_limit": "1"},
                    auth=(username, password),
                )
            return {"ok": resp.status_code == 200}
        except Exception:
            return {"ok": False}

    if integration.integration_type == "google-drive":
        cfg = integration.config
        root_folder_id = cfg.get("root_folder_id", "")
        access_token = cfg.get("access_token", "")
        if not root_folder_id:
            return {"ok": False, "detail": "Root Folder ID is required"}
        if not access_token:
            return {"ok": False, "detail": "Sign in with Google first"}
        try:
            from services.google_drive import GoogleDriveProvider
            provider = GoogleDriveProvider()
            folder = await provider.test_folder(access_token, root_folder_id)
            return {"ok": True, "folder_name": folder.get("name", "")}
        except Exception as e:
            return {"ok": False, "detail": str(e)}

    if integration.integration_type == "jira":
        cfg = integration.config
        instance_url = cfg.get("instance_url", "")
        username = cfg.get("username", "")
        api_token = cfg.get("api_token", "")
        if not instance_url or not username or not api_token:
            missing = [f for f in ("instance_url", "username", "api_token") if not cfg.get(f)]
            return {"ok": False, "detail": f"Missing Jira config fields: {', '.join(missing)}"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{instance_url.rstrip('/')}/rest/api/3/myself",
                    auth=(username, api_token),
                    headers={"Accept": "application/json"},
                )
            if resp.is_success:
                data = resp.json()
                return {"ok": True, "detail": f"Authenticated as {data.get('displayName', username)}"}
            return {"ok": False, "detail": f"Jira returned HTTP {resp.status_code}"}
        except Exception as e:
            return {"ok": False, "detail": str(e)}

    if integration.integration_type == "slack":
        cfg = integration.config
        webhook_url = cfg.get("webhook_url", "")
        if not webhook_url:
            return {"ok": False, "detail": "Missing Slack webhook URL"}
        if not webhook_url.startswith("https://hooks.slack.com/"):
            return {"ok": False, "detail": "Invalid webhook URL — must start with https://hooks.slack.com/"}
        # Slack webhooks don't have a test endpoint; posting an empty payload returns an error
        # but a well-formed URL validates the format. We do a dry-run HEAD.
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(webhook_url, json={"text": ""})
            # Slack returns 400 "no_text" for empty text but 200 for valid text — 400 means the URL is valid
            if resp.status_code in (200, 400):
                return {"ok": True, "detail": "Webhook URL is valid"}
            return {"ok": False, "detail": f"Slack returned HTTP {resp.status_code}"}
        except Exception as e:
            return {"ok": False, "detail": str(e)}

    if integration.integration_type == "github":
        cfg = integration.config
        token = cfg.get("token", "")
        org = cfg.get("org", "")
        if not token:
            return {"ok": False, "detail": "Missing Personal Access Token"}
        if not org:
            return {"ok": False, "detail": "Missing Organization / Username"}
        try:
            headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get("https://api.github.com/user", headers=headers)
            if resp.status_code == 401:
                return {"ok": False, "detail": "Invalid token — check that your Personal Access Token is correct"}
            if resp.status_code == 403:
                return {"ok": False, "detail": "Token lacks permissions — generate a token with 'repo' scope"}
            if resp.is_success:
                user = resp.json()
                return {"ok": True, "detail": f"Authenticated as {user.get('login', '')} ({user.get('name', '')})"}
            return {"ok": False, "detail": f"GitHub returned HTTP {resp.status_code}"}
        except Exception as e:
            return {"ok": False, "detail": str(e)}

    if integration.integration_type == "replit":
        connect_sid = integration.config.get("connect_sid", "")
        username = integration.config.get("username", "")
        if not connect_sid:
            return {"ok": False, "detail": "Missing connect.sid cookie"}
        try:
            from services.replit_tools import verify_connection
            return await verify_connection(connect_sid, username)
        except Exception as e:
            return {"ok": False, "detail": str(e)}

    # For other types, return mock success
    return {"ok": True}


# --- Delete ---


@router.delete("/{integration_id}")
async def delete_integration(tenant_id: str, integration_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    integration = await request.app.state.integration_store.get(integration_id)
    if integration is None or integration.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Integration not found")

    await request.app.state.integration_store.delete(integration_id)
    return {"ok": True}


# --- Webservice Endpoints ---


async def _get_integration(tenant_id: str, integration_id: str, request: Request) -> Integration:
    await _require_tenant(tenant_id, request)
    integration = await request.app.state.integration_store.get(integration_id)
    if integration is None or integration.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Integration not found")
    return integration


@router.post("/{integration_id}/endpoints", status_code=201)
async def add_endpoint(
    tenant_id: str, integration_id: str, body: AddEndpointRequest, request: Request
):
    integration = await _get_integration(tenant_id, integration_id, request)
    ep = IntegrationEndpoint(
        id=f"ep_{uuid.uuid4().hex[:8]}",
        name=body.name,
        path=body.path,
        method=body.method.upper(),
        headers=body.headers,
        query_params=body.query_params,
        description=body.description,
    )
    updated_endpoints = list(integration.endpoints) + [ep]
    store = request.app.state.integration_store
    updated = await store.update(integration_id, endpoints=updated_endpoints)

    snow_cfg = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    drive_cfg = await request.app.state.drive_config_store.get_by_tenant(tenant_id)
    replit_cfg = await request.app.state.replit_config_store.get_by_tenant(tenant_id)
    return _serialize(updated, _connection_status(updated, snow_cfg, drive_cfg, replit_cfg))


@router.put("/{integration_id}/endpoints/{endpoint_id}")
async def update_endpoint(
    tenant_id: str, integration_id: str, endpoint_id: str,
    body: UpdateEndpointRequest, request: Request,
):
    integration = await _get_integration(tenant_id, integration_id, request)
    updated_endpoints = []
    found = False
    for ep in integration.endpoints:
        if ep.id == endpoint_id:
            found = True
            data = ep.model_dump()
            for field, value in body.model_dump(exclude_none=True).items():
                data[field] = value if field != "method" else value.upper()
            updated_endpoints.append(IntegrationEndpoint(**data))
        else:
            updated_endpoints.append(ep)
    if not found:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    store = request.app.state.integration_store
    updated = await store.update(integration_id, endpoints=updated_endpoints)

    snow_cfg = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    drive_cfg = await request.app.state.drive_config_store.get_by_tenant(tenant_id)
    replit_cfg = await request.app.state.replit_config_store.get_by_tenant(tenant_id)
    return _serialize(updated, _connection_status(updated, snow_cfg, drive_cfg, replit_cfg))


@router.delete("/{integration_id}/endpoints/{endpoint_id}")
async def delete_endpoint(
    tenant_id: str, integration_id: str, endpoint_id: str, request: Request
):
    integration = await _get_integration(tenant_id, integration_id, request)
    original_len = len(integration.endpoints)
    updated_endpoints = [ep for ep in integration.endpoints if ep.id != endpoint_id]
    if len(updated_endpoints) == original_len:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    store = request.app.state.integration_store
    await store.update(integration_id, endpoints=updated_endpoints)
    return {"ok": True}


def _build_endpoint_request(
    integration: Integration,
    ep: IntegrationEndpoint,
    limit: int = 1,
    path_vars: dict[str, str] | None = None,
):
    """Build URL, headers, params, auth for an endpoint request. Returns (url, headers, params, auth) or raises."""
    cfg = integration.config
    itype = integration.integration_type
    base_url = cfg.get("instance_url", "").rstrip("/")

    if itype == "github":
        base_url = "https://api.github.com"
    if not base_url:
        return None

    url = f"{base_url}{ep.path}"
    headers = {**ep.headers}
    params = {**ep.query_params}
    auth = None

    if itype == "servicenow":
        auth = (cfg.get("username", ""), cfg.get("password", ""))
        # Only add sysparm_limit for standard table/CMDB APIs, not scripted REST APIs
        if ep.path.startswith("/api/now/"):
            params["sysparm_limit"] = str(limit)
    elif itype == "jira":
        auth = (cfg.get("username", ""), cfg.get("api_token", ""))
        headers.setdefault("Accept", "application/json")
        params["maxResults"] = str(limit)
    elif itype == "salesforce":
        auth = (cfg.get("username", ""), cfg.get("password", ""))
    elif itype == "github":
        headers["Authorization"] = f"Bearer {cfg.get('token', '')}"
        headers.setdefault("Accept", "application/vnd.github+json")
        url = url.replace("{org}", cfg.get("org", "")).replace("{repo}", cfg.get("repo", "")).replace("{path}", "")
        params["per_page"] = str(limit)

    # Substitute user-supplied path variables (e.g. {sys_id}, {title})
    if path_vars:
        import re
        from urllib.parse import quote
        for key, value in path_vars.items():
            url = url.replace(f"{{{key}}}", quote(str(value), safe=""))
        # Remove any remaining un-substituted {var} placeholders
        url = re.sub(r"\{[^}]+\}", "", url)

    return url, headers, params, auth


@router.post("/{integration_id}/endpoints/{endpoint_id}/test")
async def test_endpoint(
    tenant_id: str, integration_id: str, endpoint_id: str,
    body: dict | None = None, request: Request = None,
):
    """Test an endpoint. Optional body: {path_vars: {key: value}, limit: int}"""
    if body is None:
        body = {}
    integration = await _get_integration(tenant_id, integration_id, request)
    ep = next((e for e in integration.endpoints if e.id == endpoint_id), None)
    if ep is None:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    limit = min(max(int(body.get("limit", 1)), 1), 25)
    path_vars = body.get("path_vars") or {}

    result = _build_endpoint_request(integration, ep, limit=limit, path_vars=path_vars)
    if result is None:
        return {"ok": False, "detail": "No base URL configured — save credentials first"}
    url, headers, params, auth = result

    try:
        import time
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(ep.method, url, headers=headers, params=params, auth=auth)
        latency_ms = int((time.monotonic() - t0) * 1000)
        resolved_url = str(resp.request.url)

        # Truncate response body for preview
        response_body = resp.text[:4000] if resp.text else None

        if resp.is_success:
            return {"ok": True, "status_code": resp.status_code, "latency_ms": latency_ms,
                    "resolved_url": resolved_url, "response_body": response_body,
                    "detail": f"{ep.method} {ep.path} returned {resp.status_code} in {latency_ms}ms"}
        return {"ok": False, "status_code": resp.status_code, "latency_ms": latency_ms,
                "resolved_url": resolved_url, "response_body": response_body,
                "detail": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"ok": False, "resolved_url": url, "detail": str(e)}


@router.post("/{integration_id}/endpoints/{endpoint_id}/fetch")
async def fetch_endpoint_records(
    tenant_id: str, integration_id: str, endpoint_id: str,
    body: dict, request: Request,
):
    """Fetch sample records from an endpoint. body: {limit: int (1-25, default 5)}"""
    integration = await _get_integration(tenant_id, integration_id, request)
    ep = next((e for e in integration.endpoints if e.id == endpoint_id), None)
    if ep is None:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    limit = min(max(int(body.get("limit", 5)), 1), 25)
    path_vars = body.get("path_vars") or {}

    result = _build_endpoint_request(integration, ep, limit=limit, path_vars=path_vars)
    if result is None:
        return {"ok": False, "detail": "No base URL configured — save credentials first"}
    url, headers, params, auth = result

    try:
        import time
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(ep.method, url, headers=headers, params=params, auth=auth)
        latency_ms = int((time.monotonic() - t0) * 1000)

        if not resp.is_success:
            return {"ok": False, "status_code": resp.status_code, "latency_ms": latency_ms,
                    "detail": f"HTTP {resp.status_code}: {resp.text[:500]}"}

        # Parse response and extract records
        try:
            data = resp.json()
        except Exception:
            return {"ok": True, "status_code": resp.status_code, "latency_ms": latency_ms,
                    "records": [], "raw_text": resp.text[:2000], "detail": "Response is not JSON"}

        # Extract records from common response shapes
        records = []
        record_count = None
        if isinstance(data, list):
            records = data[:limit]
            record_count = len(data)
        elif isinstance(data, dict):
            # ServiceNow: {result: [...]}
            if "result" in data and isinstance(data["result"], list):
                records = data["result"][:limit]
                record_count = len(data["result"])
            # Jira: {issues: [...], total: N}
            elif "issues" in data and isinstance(data["issues"], list):
                records = data["issues"][:limit]
                record_count = data.get("total", len(data["issues"]))
            # Salesforce: {records: [...], totalSize: N}
            elif "records" in data and isinstance(data["records"], list):
                records = data["records"][:limit]
                record_count = data.get("totalSize", len(data["records"]))
            # GitHub: array responses are already handled above; single object
            elif "items" in data and isinstance(data["items"], list):
                records = data["items"][:limit]
                record_count = data.get("total_count", len(data["items"]))
            else:
                # Single object or unknown shape — return as-is
                records = [data]
                record_count = 1

        return {
            "ok": True,
            "status_code": resp.status_code,
            "latency_ms": latency_ms,
            "record_count": record_count,
            "records": records,
            "detail": f"Fetched {len(records)} record(s) in {latency_ms}ms",
        }
    except Exception as e:
        return {"ok": False, "resolved_url": url, "detail": str(e)}
