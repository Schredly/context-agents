"""OYExtractorRegistryService — manages vendor extractors and fetches application objects.

Pipeline position:
    ServiceNow → **OYExtractorRegistryService** → Application Objects

Flow:
  1. ALWAYS call /deploy to register the extractor
  2. ALWAYS call /extract/{key} with context.scan_depth
  3. Fall back to Catalog By Title only if self-deploy is unavailable

Rules:
  - ALWAYS call /deploy before /extract
  - ALWAYS include context.scan_depth
  - DO NOT call other endpoints for extraction
  - DO NOT assume fixed response shape — it depends on scan_depth
"""

from __future__ import annotations

import logging
import time

import httpx

from services import servicenow_tools

logger = logging.getLogger(__name__)

_SNOW_TIMEOUT = 90
_SELFDEPLOY_BASE = "/api/1939459/overyonder_selfdeploy"


async def extract(
    tenant_id: str,
    integration_id: str,
    target_type: str,
    target_name: str,
    depth: str,
    app,
    scope: str = "",
    application: str = "",
) -> dict:
    """Extract application objects from a vendor integration.

    Returns:
        {
            "status": "ok" | "error",
            "objects": dict,
            "raw_vendor_payload": dict,
            "latency_ms": int,
            "payload_size": int,
            "extractor_key": str,
        }
    """
    integration = await app.state.integration_store.get(integration_id)
    if not integration:
        return {"status": "error", "error": "Integration not found"}

    vendor = integration.integration_type

    if vendor == "servicenow":
        return await _extract_servicenow(
            tenant_id, integration, target_type, target_name, depth, app,
            scope=scope, application=application,
        )

    return {"status": "error", "error": f"No extractor registered for vendor: {vendor}"}


# ---------------------------------------------------------------------------
# ServiceNow extractor
# ---------------------------------------------------------------------------


async def _extract_servicenow(
    tenant_id: str,
    integration,
    target_type: str,
    target_name: str,
    depth: str,
    app,
    scope: str = "",
    application: str = "",
) -> dict:
    """Two-step extraction: deploy → extract.

    Step 1: POST /deploy — register the extractor
    Step 2: POST /extract/{key} — run extraction with context
    Fallback: GET Catalog By Title if self-deploy is unavailable
    """
    cfg = await servicenow_tools._get_snow_config(tenant_id, app)
    instance_url = cfg["instance_url"]
    auth_header = cfg["auth_header"]

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": auth_header,
    }

    extractor_key = target_name.lower().replace(" ", "_").replace("(", "").replace(")", "")
    deploy_url = f"{instance_url}{_SELFDEPLOY_BASE}/deploy"
    extract_url = f"{instance_url}{_SELFDEPLOY_BASE}/extract/{extractor_key}"

    logger.info("[oy_extractor] Pipeline: deploy → extract for '%s' (depth=%s)", target_name, depth)

    t0 = time.monotonic()

    # -----------------------------------------------------------------------
    # Step 1: Deploy extractor
    # -----------------------------------------------------------------------
    deploy_body = {
        "extractor_key": extractor_key,
        "type": "catalog_genome" if target_type == "service_catalog" else "application_genome",
        "name": target_name,
    }
    if target_type == "service_catalog":
        deploy_body["catalog_title"] = target_name

    deploy_ok = False
    try:
        async with httpx.AsyncClient(timeout=_SNOW_TIMEOUT) as client:
            deploy_resp = await client.post(deploy_url, headers=headers, json=deploy_body)
        if deploy_resp.is_success:
            deploy_data = deploy_resp.json()
            result = deploy_data.get("result", {})
            deploy_ok = result.get("status") in ("created", "updated")
            logger.info("[oy_extractor] Deploy: %s (key=%s)", result.get("status", "?"), extractor_key)
        else:
            logger.warning("[oy_extractor] Deploy failed: HTTP %s", deploy_resp.status_code)
    except Exception as exc:
        logger.warning("[oy_extractor] Deploy failed: %s", exc)

    # -----------------------------------------------------------------------
    # Step 2: Extract with full context
    # -----------------------------------------------------------------------
    context = {
        "tenant": tenant_id,
        "vendor": "servicenow",
        "application": application or target_name,
        "scope": scope,
        "scan_depth": depth,
    }

    resp = None

    if deploy_ok:
        try:
            async with httpx.AsyncClient(timeout=_SNOW_TIMEOUT) as client:
                resp = await client.post(extract_url, headers=headers, json={"context": context})
            logger.info("[oy_extractor] Extract: HTTP %s (%d bytes)",
                        resp.status_code, len(resp.text) if resp else 0)
        except Exception as exc:
            logger.warning("[oy_extractor] Extract failed: %s", exc)
            resp = None

    # -----------------------------------------------------------------------
    # Fallback: Catalog By Title (if self-deploy unavailable)
    # -----------------------------------------------------------------------
    if (resp is None or not resp.is_success) and target_type == "service_catalog":
        encoded_title = target_name.replace(" ", "%20")
        catalog_url = await servicenow_tools.get_endpoint_url(
            tenant_id, "Catalog By Title", app, catalogTitle=encoded_title,
        )
        if catalog_url:
            logger.info("[oy_extractor] Falling back to Catalog By Title")
            try:
                from services.snow_to_replit import _fetch_catalog
                resp = await _fetch_catalog(catalog_url, auth_header)
            except Exception as exc:
                latency_ms = int((time.monotonic() - t0) * 1000)
                return {"status": "error", "error": f"ServiceNow unreachable ({latency_ms}ms): {exc}"}

    latency_ms = int((time.monotonic() - t0) * 1000)

    if resp is None or not resp.is_success:
        status_code = resp.status_code if resp else "timeout"
        return {
            "status": "error",
            "error": f"ServiceNow HTTP {status_code}",
            "latency_ms": latency_ms,
        }

    try:
        data = resp.json()
    except Exception:
        return {"status": "error", "error": "Non-JSON response from ServiceNow"}

    # Unwrap ServiceNow response — shape depends on scan_depth
    result_data = data.get("result", data)
    if isinstance(result_data, dict) and result_data.get("status") == "error":
        return {
            "status": "error",
            "error": result_data.get("message", "Extraction failed"),
            "latency_ms": latency_ms,
        }

    raw_payload = result_data.get("result", result_data) if isinstance(result_data, dict) else result_data
    objects = _flatten(raw_payload if isinstance(raw_payload, dict) else {})

    return {
        "status": "ok",
        "objects": objects,
        "raw_vendor_payload": raw_payload,
        "latency_ms": latency_ms,
        "payload_size": len(resp.text),
        "extractor_key": extractor_key,
        "deploy_status": "ok" if deploy_ok else "skipped",
    }


def _flatten(raw: dict) -> dict:
    """Remove vendor-specific wrappers so objects have a clean structure."""
    result = dict(raw)

    if "result" in result and isinstance(result["result"], dict):
        inner = result["result"]
        for key in ("items", "tables", "scripts", "flows", "objects"):
            if key in inner and key not in result:
                result[key] = inner[key]

    items = result.get("items", [])
    if items and isinstance(items, list) and isinstance(items[0], dict) and "item" in items[0]:
        result["items"] = [
            entry["item"] if isinstance(entry.get("item"), dict) else entry
            for entry in items
        ]

    objects = result.get("objects")
    if isinstance(objects, dict):
        for key, val in objects.items():
            if isinstance(val, list) and key not in result:
                result[key] = val

    return result
