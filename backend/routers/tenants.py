from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import Response

from models import CreateTenantRequest, Tenant

router = APIRouter(prefix="/api/tenants", tags=["tenants"])


def _tenant_store(request: Request):
    return request.app.state.tenant_store


@router.post("", response_model=Tenant, status_code=201)
async def create_tenant(body: CreateTenantRequest, request: Request):
    return await _tenant_store(request).create(body.name)


@router.get("", response_model=list[Tenant])
async def list_tenants(request: Request):
    return await _tenant_store(request).list()


@router.get("/{tenant_id}", response_model=Tenant)
async def get_tenant(tenant_id: str, request: Request):
    tenant = await _tenant_store(request).get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.delete("/{tenant_id}", status_code=204)
async def delete_tenant(tenant_id: str, request: Request):
    deleted = await _tenant_store(request).delete(tenant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return Response(status_code=204)
