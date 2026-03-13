import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from models import CreateManagedIntegrationRequest, ManagedIntegration
from services.integration_executor import test_managed_integration

router = APIRouter(
    prefix="/api/admin/{tenant_id}/managed-integrations",
    tags=["managed-integrations"],
)

VALID_TYPES = {"web_service", "github"}


async def _require_tenant(tenant_id: str, request: Request):
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.post("/", status_code=201)
async def create_managed_integration(
    tenant_id: str, body: CreateManagedIntegrationRequest, request: Request
):
    await _require_tenant(tenant_id, request)
    if body.type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid type: {body.type}. Must be one of {sorted(VALID_TYPES)}")

    integration = ManagedIntegration(
        id=f"mint_{uuid.uuid4().hex[:12]}",
        tenant_id=tenant_id,
        name=body.name,
        type=body.type,
        base_url=body.base_url,
        endpoint=body.endpoint,
        headers=body.headers,
        auth_type=body.auth_type,
        token=body.token,
        test_endpoint=body.test_endpoint,
    )
    created = await request.app.state.managed_integration_store.create(integration)
    return created.model_dump(mode="json")


@router.get("/")
async def list_managed_integrations(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    items = await request.app.state.managed_integration_store.list_for_tenant(tenant_id)
    return [i.model_dump(mode="json") for i in items]


@router.get("/{integration_id}")
async def get_managed_integration(tenant_id: str, integration_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    integration = await request.app.state.managed_integration_store.get(integration_id)
    if integration is None or integration.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Managed integration not found")
    return integration.model_dump(mode="json")


@router.put("/{integration_id}")
async def update_managed_integration(
    tenant_id: str, integration_id: str, body: CreateManagedIntegrationRequest, request: Request
):
    await _require_tenant(tenant_id, request)
    existing = await request.app.state.managed_integration_store.get(integration_id)
    if existing is None or existing.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Managed integration not found")

    updated = await request.app.state.managed_integration_store.update(
        integration_id,
        name=body.name,
        type=body.type,
        base_url=body.base_url,
        endpoint=body.endpoint,
        headers=body.headers,
        auth_type=body.auth_type,
        token=body.token,
        test_endpoint=body.test_endpoint,
        updated_at=datetime.now(timezone.utc),
    )
    return updated.model_dump(mode="json")


@router.delete("/{integration_id}")
async def delete_managed_integration(tenant_id: str, integration_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    existing = await request.app.state.managed_integration_store.get(integration_id)
    if existing is None or existing.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Managed integration not found")
    await request.app.state.managed_integration_store.delete(integration_id)
    return {"ok": True}


@router.post("/{integration_id}/test")
async def test_integration(tenant_id: str, integration_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    integration = await request.app.state.managed_integration_store.get(integration_id)
    if integration is None or integration.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Managed integration not found")
    return await test_managed_integration(integration)
