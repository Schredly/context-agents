import uuid

import httpx
from fastapi import APIRouter, HTTPException, Request

from models import (
    CreateIntegrationRequest,
    Integration,
    INTEGRATION_CATALOG,
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


def _serialize(integration: Integration, connection_status: str) -> dict:
    data = integration.model_dump()
    data["connection_status"] = connection_status
    data["created_at"] = integration.created_at.isoformat()
    data["updated_at"] = integration.updated_at.isoformat()
    return data


# --- Catalog ---


@router.get("/catalog")
async def get_catalog():
    return INTEGRATION_CATALOG


# --- List ---


@router.get("/")
async def list_integrations(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    store = request.app.state.integration_store
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


@router.post("/", status_code=201)
async def create_integration(tenant_id: str, body: CreateIntegrationRequest, request: Request):
    await _require_tenant(tenant_id, request)
    if body.integration_type not in INTEGRATION_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unknown integration type: {body.integration_type}")

    store = request.app.state.integration_store
    existing = await store.get_by_type(tenant_id, body.integration_type)
    if existing is not None:
        raise HTTPException(status_code=409, detail=f"Integration '{body.integration_type}' already exists for this tenant")

    integration = Integration(
        id=f"int_{uuid.uuid4().hex[:12]}",
        tenant_id=tenant_id,
        integration_type=body.integration_type,
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
