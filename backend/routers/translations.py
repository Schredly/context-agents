"""Translations CRUD router."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request

from models import CreateTranslationRequest, Translation, UpdateTranslationRequest

router = APIRouter(prefix="/api/admin/{tenant_id}/translations", tags=["translations"])


async def _require_tenant(tenant_id: str, request: Request):
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.get("")
async def list_translations(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    return await request.app.state.translation_store.list_for_tenant(tenant_id)


@router.get("/by-vendor/{vendor}")
async def list_translations_by_vendor(tenant_id: str, vendor: str, request: Request):
    await _require_tenant(tenant_id, request)
    return await request.app.state.translation_store.list_by_vendor(tenant_id, vendor)


@router.get("/{translation_id}")
async def get_translation(tenant_id: str, translation_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    translation = await request.app.state.translation_store.get(translation_id)
    if translation is None:
        raise HTTPException(status_code=404, detail="Translation not found")
    return translation


@router.post("", status_code=201)
async def create_translation(tenant_id: str, body: CreateTranslationRequest, request: Request):
    await _require_tenant(tenant_id, request)
    translation = Translation(
        id=f"trans_{uuid.uuid4().hex[:12]}",
        tenant_id=tenant_id,
        **body.model_dump(),
    )
    return await request.app.state.translation_store.create(translation)


@router.put("/{translation_id}")
async def update_translation(tenant_id: str, translation_id: str, body: UpdateTranslationRequest, request: Request):
    await _require_tenant(tenant_id, request)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = await request.app.state.translation_store.update(translation_id, **updates)
    if updated is None:
        raise HTTPException(status_code=404, detail="Translation not found")
    return updated


@router.delete("/{translation_id}", status_code=204)
async def delete_translation(tenant_id: str, translation_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    deleted = await request.app.state.translation_store.delete(translation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Translation not found")
