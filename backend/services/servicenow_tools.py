"""ServiceNow tool implementations for the execution engine."""

from __future__ import annotations

import logging
import time

import base64

import httpx

logger = logging.getLogger(__name__)

SNOW_TIMEOUT = 15


async def _get_snow_config(tenant_id: str, app) -> dict:
    """Retrieve ServiceNow config for a tenant from the store."""
    cfg = await app.state.snow_config_store.get_by_tenant(tenant_id)
    if cfg is None:
        raise RuntimeError(f"ServiceNow not configured for tenant {tenant_id}")
    token = base64.b64encode(f"{cfg.username}:{cfg.password}".encode()).decode()
    return {
        "instance_url": cfg.instance_url.rstrip("/"),
        "auth_header": f"Basic {token}",
    }


async def get_endpoint_url(tenant_id: str, endpoint_name: str, app, **path_vars) -> str | None:
    """Look up a named endpoint from the tenant's ServiceNow integration and return the full URL.

    Returns None if the endpoint is not found. Path variables like {title} are
    substituted from **path_vars.
    """
    integration = await app.state.integration_store.get_by_type(tenant_id, "servicenow")
    if integration is None:
        return None
    instance_url = integration.config.get("instance_url", "").rstrip("/")
    if not instance_url:
        return None
    for ep in integration.endpoints:
        if ep.name == endpoint_name:
            path = ep.path
            for key, value in path_vars.items():
                path = path.replace(f"{{{key}}}", str(value))
            return f"{instance_url}{path}"
    return None


async def search_incidents(tenant_id: str, payload: dict, app) -> dict:
    """Search ServiceNow incidents.

    payload keys: query (str), limit (int, default 10)
    """
    cfg = await _get_snow_config(tenant_id, app)
    query = payload.get("query", "")
    limit = payload.get("limit", 10)

    url = f"{cfg['instance_url']}/api/now/table/incident"
    params = {
        "sysparm_query": f"short_descriptionLIKE{query}^ORdescriptionLIKE{query}",
        "sysparm_limit": str(limit),
        "sysparm_fields": "sys_id,number,short_description,priority,state,assigned_to,opened_at,resolved_at,close_notes",
    }

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=SNOW_TIMEOUT) as client:
        res = await client.get(
            url,
            params=params,
            headers={"Accept": "application/json", "Authorization": cfg["auth_header"]},
        )
    latency_ms = int((time.monotonic() - t0) * 1000)

    if not res.is_success:
        logger.error("ServiceNow search_incidents failed: %d", res.status_code)
        return {"status": "error", "error": f"HTTP {res.status_code}", "latency_ms": latency_ms}

    try:
        records = res.json().get("result", [])
    except Exception:
        return {"status": "error", "error": "Instance unavailable (non-JSON response — may be hibernating)", "latency_ms": latency_ms}
    return {
        "incidents": records,
        "count": len(records),
        "latency_ms": latency_ms,
    }


async def get_incident_details(tenant_id: str, payload: dict, app) -> dict:
    """Get details for a single ServiceNow incident.

    payload keys: sys_id (str)
    """
    cfg = await _get_snow_config(tenant_id, app)
    sys_id = payload.get("sys_id", "")

    url = f"{cfg['instance_url']}/api/now/table/incident/{sys_id}"

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=SNOW_TIMEOUT) as client:
        res = await client.get(
            url,
            headers={"Accept": "application/json", "Authorization": cfg["auth_header"]},
        )
    latency_ms = int((time.monotonic() - t0) * 1000)

    if not res.is_success:
        logger.error("ServiceNow get_incident_details failed: %d", res.status_code)
        return {"status": "error", "error": f"HTTP {res.status_code}", "latency_ms": latency_ms}

    try:
        record = res.json().get("result", {})
    except Exception:
        return {"status": "error", "error": "Instance unavailable (non-JSON response — may be hibernating)", "latency_ms": latency_ms}
    return {
        "record": record,
        "latency_ms": latency_ms,
    }


async def search_kb(tenant_id: str, payload: dict, app) -> dict:
    """Search ServiceNow knowledge base articles.

    payload keys: query (str), limit (int, default 10)
    """
    cfg = await _get_snow_config(tenant_id, app)
    query = payload.get("query", "")
    limit = payload.get("limit", 10)

    url = f"{cfg['instance_url']}/api/now/table/kb_knowledge"
    params = {
        "sysparm_query": f"short_descriptionLIKE{query}^ORtextLIKE{query}",
        "sysparm_limit": str(limit),
        "sysparm_fields": "sys_id,number,short_description,text,rating,view_count",
    }

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=SNOW_TIMEOUT) as client:
        res = await client.get(
            url,
            params=params,
            headers={"Accept": "application/json", "Authorization": cfg["auth_header"]},
        )
    latency_ms = int((time.monotonic() - t0) * 1000)

    if not res.is_success:
        logger.error("ServiceNow search_kb failed: %d", res.status_code)
        return {"status": "error", "error": f"HTTP {res.status_code}", "latency_ms": latency_ms}

    try:
        records = res.json().get("result", [])
    except Exception:
        return {"status": "error", "error": "Instance unavailable (non-JSON response — may be hibernating)", "latency_ms": latency_ms}
    return {
        "articles": records,
        "count": len(records),
        "latency_ms": latency_ms,
    }


async def create_incident(tenant_id: str, payload: dict, app) -> dict:
    """Create a new ServiceNow incident.

    payload keys: title (str), description (str), priority (str, default "3")
    """
    cfg = await _get_snow_config(tenant_id, app)
    title = payload.get("title", "")
    description = payload.get("description", "")
    priority = payload.get("priority", "3")

    url = f"{cfg['instance_url']}/api/now/table/incident"

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=SNOW_TIMEOUT) as client:
        res = await client.post(
            url,
            headers={"Content-Type": "application/json", "Accept": "application/json", "Authorization": cfg["auth_header"]},
            json={
                "short_description": title,
                "description": description,
                "priority": priority,
            },
        )
    latency_ms = int((time.monotonic() - t0) * 1000)

    if not res.is_success:
        logger.error("ServiceNow create_incident failed: %d", res.status_code)
        return {"status": "error", "error": f"HTTP {res.status_code}", "latency_ms": latency_ms}

    try:
        record = res.json().get("result", {})
    except Exception:
        return {"status": "error", "error": "Instance unavailable (non-JSON response — may be hibernating)", "latency_ms": latency_ms}

    return {
        "status": "ok",
        "sys_id": record.get("sys_id", ""),
        "number": record.get("number", ""),
        "short_description": record.get("short_description", ""),
        "latency_ms": latency_ms,
    }


async def create_knowledge_article(tenant_id: str, payload: dict, app) -> dict:
    """Create a new ServiceNow knowledge base article.

    payload keys: title (str), content (str), category (str, optional)
    """
    cfg = await _get_snow_config(tenant_id, app)
    title = payload.get("title", "")
    content = payload.get("content", "")
    category = payload.get("category", "")

    url = f"{cfg['instance_url']}/api/now/table/kb_knowledge"

    body: dict = {
        "short_description": title,
        "text": content,
        "workflow_state": "draft",
    }
    if category:
        body["category"] = category

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=SNOW_TIMEOUT) as client:
        res = await client.post(
            url,
            headers={"Content-Type": "application/json", "Accept": "application/json", "Authorization": cfg["auth_header"]},
            json=body,
        )
    latency_ms = int((time.monotonic() - t0) * 1000)

    if not res.is_success:
        logger.error("ServiceNow create_knowledge_article failed: %d", res.status_code)
        return {"status": "error", "error": f"HTTP {res.status_code}", "latency_ms": latency_ms}

    try:
        record = res.json().get("result", {})
    except Exception:
        return {"status": "error", "error": "Instance unavailable (non-JSON response — may be hibernating)", "latency_ms": latency_ms}

    return {
        "status": "ok",
        "sys_id": record.get("sys_id", ""),
        "number": record.get("number", ""),
        "short_description": record.get("short_description", ""),
        "workflow_state": record.get("workflow_state", "draft"),
        "latency_ms": latency_ms,
    }


async def add_work_note(tenant_id: str, payload: dict, app) -> dict:
    """Add a work note to a ServiceNow incident.

    payload keys: sys_id (str), note (str)
    """
    cfg = await _get_snow_config(tenant_id, app)
    sys_id = payload.get("sys_id", "")
    note = payload.get("note", "")

    url = f"{cfg['instance_url']}/api/now/table/incident/{sys_id}"

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=SNOW_TIMEOUT) as client:
        res = await client.patch(
            url,
            headers={"Content-Type": "application/json", "Accept": "application/json", "Authorization": cfg["auth_header"]},
            json={"work_notes": note},
        )
    latency_ms = int((time.monotonic() - t0) * 1000)

    if not res.is_success:
        logger.error("ServiceNow add_work_note failed: %d", res.status_code)
        return {"status": "error", "error": f"HTTP {res.status_code}", "latency_ms": latency_ms}

    try:
        res.json()
    except Exception:
        return {"status": "error", "error": "Instance unavailable (non-JSON response — may be hibernating)", "latency_ms": latency_ms}

    return {
        "ok": True,
        "latency_ms": latency_ms,
    }
