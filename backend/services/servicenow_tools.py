"""ServiceNow tool implementations for the execution engine."""

from __future__ import annotations

import logging
import time

import httpx

logger = logging.getLogger(__name__)

SNOW_TIMEOUT = 15


async def _get_snow_config(tenant_id: str, app) -> dict:
    """Retrieve ServiceNow config for a tenant from the store."""
    cfg = await app.state.snow_config_store.get_by_tenant(tenant_id)
    if cfg is None:
        raise RuntimeError(f"ServiceNow not configured for tenant {tenant_id}")
    return {
        "instance_url": cfg.instance_url.rstrip("/"),
        "username": cfg.username,
        "password": cfg.password,
    }


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
            auth=(cfg["username"], cfg["password"]),
            headers={"Accept": "application/json"},
        )
    latency_ms = int((time.monotonic() - t0) * 1000)

    if not res.is_success:
        logger.error("ServiceNow search_incidents failed: %d", res.status_code)
        return {"status": "error", "error": f"HTTP {res.status_code}", "latency_ms": latency_ms}

    records = res.json().get("result", [])
    return {
        "records": records,
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
            auth=(cfg["username"], cfg["password"]),
            headers={"Accept": "application/json"},
        )
    latency_ms = int((time.monotonic() - t0) * 1000)

    if not res.is_success:
        logger.error("ServiceNow get_incident_details failed: %d", res.status_code)
        return {"status": "error", "error": f"HTTP {res.status_code}", "latency_ms": latency_ms}

    record = res.json().get("result", {})
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
            auth=(cfg["username"], cfg["password"]),
            headers={"Accept": "application/json"},
        )
    latency_ms = int((time.monotonic() - t0) * 1000)

    if not res.is_success:
        logger.error("ServiceNow search_kb failed: %d", res.status_code)
        return {"status": "error", "error": f"HTTP {res.status_code}", "latency_ms": latency_ms}

    records = res.json().get("result", [])
    return {
        "records": records,
        "count": len(records),
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
            auth=(cfg["username"], cfg["password"]),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            json={"work_notes": note},
        )
    latency_ms = int((time.monotonic() - t0) * 1000)

    if not res.is_success:
        logger.error("ServiceNow add_work_note failed: %d", res.status_code)
        return {"status": "error", "error": f"HTTP {res.status_code}", "latency_ms": latency_ms}

    return {
        "ok": True,
        "latency_ms": latency_ms,
    }
