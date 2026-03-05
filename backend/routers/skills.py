import uuid

from fastapi import APIRouter, HTTPException, Request

from models import (
    CreateSkillRequest,
    Skill,
    TOOL_CATALOG_BY_ID,
    UpdateSkillRequest,
)

router = APIRouter(prefix="/api/admin/{tenant_id}/skills", tags=["skills"])


async def _require_tenant(tenant_id: str, request: Request):
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


def _validate_tools(tool_ids: list[str]) -> None:
    invalid = [t for t in tool_ids if t not in TOOL_CATALOG_BY_ID]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown tool IDs: {', '.join(invalid)}",
        )


@router.get("/")
async def list_skills(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    return await request.app.state.skill_store.list_for_tenant(tenant_id)


@router.post("/", status_code=201)
async def create_skill(tenant_id: str, body: CreateSkillRequest, request: Request):
    await _require_tenant(tenant_id, request)
    if body.tools:
        _validate_tools(body.tools)

    skill = Skill(
        id=f"sk_{uuid.uuid4().hex[:12]}",
        tenant_id=tenant_id,
        name=body.name,
        description=body.description,
        model=body.model,
        instructions=body.instructions,
        tools=body.tools,
    )
    return await request.app.state.skill_store.create(skill)


@router.get("/{skill_id}")
async def get_skill(tenant_id: str, skill_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    skill = await request.app.state.skill_store.get(skill_id)
    if skill is None or skill.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.put("/{skill_id}")
async def update_skill(tenant_id: str, skill_id: str, body: UpdateSkillRequest, request: Request):
    await _require_tenant(tenant_id, request)
    skill = await request.app.state.skill_store.get(skill_id)
    if skill is None or skill.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Skill not found")

    updates = body.model_dump(exclude_none=True)
    if "tools" in updates:
        _validate_tools(updates["tools"])

    updated = await request.app.state.skill_store.update(skill_id, **updates)
    return updated


@router.delete("/{skill_id}")
async def delete_skill(tenant_id: str, skill_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    skill = await request.app.state.skill_store.get(skill_id)
    if skill is None or skill.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Skill not found")

    await request.app.state.skill_store.delete(skill_id)
    return {"ok": True}
