from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request

from models import TOOL_CATALOG

router = APIRouter(prefix="/api/admin/{tenant_id}/tools", tags=["tools"])


async def _require_tenant(tenant_id: str, request: Request):
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.get("/catalog")
async def get_tool_catalog(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    by_integration: dict[str, list] = defaultdict(list)
    for tool in TOOL_CATALOG:
        by_integration[tool["integration_type"]].append(tool)
    return {"tools": TOOL_CATALOG, "by_integration": dict(by_integration)}


@router.get("/available")
async def get_available_tools(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)

    integrations = await request.app.state.integration_store.list_for_tenant(tenant_id)
    snow_cfg = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    drive_cfg = await request.app.state.drive_config_store.get_by_tenant(tenant_id)

    # Determine which integration types are "available"
    available_types: set[str] = set()
    for integ in integrations:
        if not integ.enabled:
            continue
        if integ.integration_type == "servicenow":
            if snow_cfg is not None:
                available_types.add("servicenow")
        elif integ.integration_type == "google-drive":
            if drive_cfg is not None:
                available_types.add("google-drive")
        else:
            available_types.add(integ.integration_type)

    tools = [t for t in TOOL_CATALOG if t["integration_type"] in available_types]

    by_integration: dict[str, list] = defaultdict(list)
    for tool in tools:
        by_integration[tool["integration_type"]].append(tool)

    return {"tools": tools, "by_integration": dict(by_integration)}
