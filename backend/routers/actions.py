"""Actions CRUD + execute + recommendations endpoint."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from models import Action, CreateActionRequest, ExecuteActionRequest, UpdateActionRequest
from services.action_recommendation import recommend_actions
from services.action_executor import execute_action as run_action

router = APIRouter(prefix="/api/admin/{tenant_id}/actions", tags=["actions"])


async def _require_tenant(tenant_id: str, request: Request):
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.get("")
async def list_actions(tenant_id: str, request: Request, filter_tenant: Optional[str] = Query(None)):
    await _require_tenant(tenant_id, request)
    if filter_tenant is not None:
        return await request.app.state.action_store.list_filtered(filter_tenant)
    return await request.app.state.action_store.list_for_tenant(tenant_id)


@router.get("/{action_id}")
async def get_action(tenant_id: str, action_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    action = await request.app.state.action_store.get(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    return action


@router.post("", status_code=201)
async def create_action(tenant_id: str, body: CreateActionRequest, request: Request):
    await _require_tenant(tenant_id, request)
    action = Action(
        id=f"act_{uuid.uuid4().hex[:12]}",
        tenant_id=tenant_id,
        **body.model_dump(),
    )
    return await request.app.state.action_store.create(action)


@router.put("/{action_id}")
async def update_action(tenant_id: str, action_id: str, body: UpdateActionRequest, request: Request):
    await _require_tenant(tenant_id, request)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = await request.app.state.action_store.update(action_id, **updates)
    if updated is None:
        raise HTTPException(status_code=404, detail="Action not found")
    return updated


@router.delete("/{action_id}", status_code=204)
async def delete_action(tenant_id: str, action_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    deleted = await request.app.state.action_store.delete(action_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Action not found")


# ---------------------------------------------------------------------------
# Execute (placeholder)
# ---------------------------------------------------------------------------


@router.post("/{action_id}/execute")
async def execute_action(tenant_id: str, action_id: str, body: ExecuteActionRequest, request: Request):
    await _require_tenant(tenant_id, request)
    action = await request.app.state.action_store.get(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")

    # Look up the run context if a run_id was provided
    run = None
    if body.run_id:
        run = await request.app.state.agent_ui_run_store.get(body.run_id)

    result = await run_action(
        action=action,
        run=run,
        user_input=body.input,
        app=request.app,
    )
    return result


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------


@router.get("/recommendations/{run_id}")
async def get_recommendations(tenant_id: str, run_id: str, request: Request):
    """Return recommended and available actions for a completed agent run."""
    await _require_tenant(tenant_id, request)

    run = await request.app.state.agent_ui_run_store.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    actions = await request.app.state.action_store.list_for_tenant(tenant_id)
    recommended, available = recommend_actions(run, actions)

    return {"recommended": recommended, "available": available}
