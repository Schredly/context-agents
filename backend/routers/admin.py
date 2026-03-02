import secrets

from fastapi import APIRouter, Request, HTTPException

from models import (
    ActivateResponse,
    ClassificationSchema,
    GoogleDriveConfig,
    PutDriveConfigRequest,
    PutSchemaRequest,
    ScaffoldApplyRequest,
    ScaffoldApplyResponse,
    ScaffoldResultRequest,
    TestDriveFolderRequest,
    TestDriveFolderResponse,
)
from services.google_drive import GoogleDriveError, GoogleDriveProvider

_drive = GoogleDriveProvider()

router = APIRouter(prefix="/api/admin/{tenant_id}", tags=["admin"])


async def _require_tenant(tenant_id: str, request: Request):
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


# --- Classification Schema ---


@router.get("/classification-schema", response_model=ClassificationSchema)
async def get_schema(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    schema = await request.app.state.schema_store.get_by_tenant(tenant_id)
    if schema is None:
        return ClassificationSchema(tenant_id=tenant_id, schema_tree=[], version=0)
    return schema


@router.put("/classification-schema", response_model=ClassificationSchema)
async def put_schema(tenant_id: str, body: PutSchemaRequest, request: Request):
    await _require_tenant(tenant_id, request)
    tree_dicts = [node.model_dump() for node in body.schema_tree]
    return await request.app.state.schema_store.upsert(tenant_id, tree_dicts)


# --- Google Drive Config ---


@router.get("/google-drive")
async def get_drive_config(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    config = await request.app.state.drive_config_store.get_by_tenant(tenant_id)
    return config  # None serialises to JSON null


@router.put("/google-drive", response_model=GoogleDriveConfig)
async def put_drive_config(
    tenant_id: str, body: PutDriveConfigRequest, request: Request
):
    await _require_tenant(tenant_id, request)
    return await request.app.state.drive_config_store.upsert(
        tenant_id,
        root_folder_id=body.root_folder_id,
        folder_name=body.folder_name,
    )


# --- Google Drive test & scaffold ---


@router.post("/google-drive/test", response_model=TestDriveFolderResponse)
async def test_drive_folder(
    tenant_id: str, body: TestDriveFolderRequest, request: Request
):
    await _require_tenant(tenant_id, request)
    try:
        result = await _drive.test_folder(body.access_token, body.folder_id)
    except GoogleDriveError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    # Persist drive config in one shot
    await request.app.state.drive_config_store.upsert(
        tenant_id, root_folder_id=body.folder_id, folder_name=result["name"]
    )
    return TestDriveFolderResponse(folder_id=result["id"], folder_name=result["name"])


@router.post("/scaffold-apply", response_model=ScaffoldApplyResponse)
async def scaffold_apply(
    tenant_id: str, body: ScaffoldApplyRequest, request: Request
):
    await _require_tenant(tenant_id, request)
    tree_dicts = [node.model_dump() for node in body.schema_tree]
    try:
        result = await _drive.scaffold(
            body.access_token, body.root_folder_id, tenant_id, tree_dicts
        )
        await _drive.upload_schema(
            body.access_token, result["schema_folder_id"], tree_dicts
        )
    except GoogleDriveError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    # Persist scaffold result
    from datetime import datetime, timezone

    await request.app.state.drive_config_store.upsert(
        tenant_id,
        scaffolded=True,
        scaffolded_at=datetime.now(timezone.utc),
        root_folder_id=body.root_folder_id,
    )
    return ScaffoldApplyResponse(
        schema_folder_id=result["schema_folder_id"],
        progress_log=result["progress_log"],
        created_count=result["created_count"],
    )


# --- Activate ---


@router.post("/activate", response_model=ActivateResponse)
async def activate_tenant(tenant_id: str, request: Request):
    tenant = await _require_tenant(tenant_id, request)
    shared_secret = tenant.shared_secret or secrets.token_urlsafe(32)
    updated = await request.app.state.tenant_store.update(
        tenant_id, status="active", shared_secret=shared_secret
    )
    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to update tenant")
    return ActivateResponse(
        tenant_id=tenant_id,
        shared_secret=updated.shared_secret,  # type: ignore[arg-type]
        instructions_stub=(
            f"Use this shared secret to authenticate API calls for tenant '{updated.name}'.\n"
            f"Include the header: X-Tenant-Secret: {updated.shared_secret}"
        ),
    )


# --- Scaffold Result ---


@router.post("/scaffold-result", response_model=GoogleDriveConfig)
async def post_scaffold_result(
    tenant_id: str, body: ScaffoldResultRequest, request: Request
):
    await _require_tenant(tenant_id, request)
    return await request.app.state.drive_config_store.upsert(
        tenant_id,
        scaffolded=body.scaffolded,
        scaffolded_at=body.scaffolded_at,
        root_folder_id=body.root_folder_id,
        folder_name=body.folder_name,
    )
