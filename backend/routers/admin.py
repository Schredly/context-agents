import secrets

from fastapi import APIRouter, Query, Request, HTTPException

from collections import Counter
from typing import Optional

from models import (
    ActivateResponse,
    ClassificationSchema,
    GoogleDriveConfig,
    MetricsResponse,
    ObservabilitySummaryResponse,
    ObservabilityTrendsResponse,
    PutDriveConfigRequest,
    PutSchemaRequest,
    PutServiceNowConfigRequest,
    RunTelemetry,
    ScaffoldApplyRequest,
    ScaffoldApplyResponse,
    ScaffoldResultRequest,
    ServiceNowConfig,
    TestDriveFolderRequest,
    TestDriveFolderResponse,
)
from services.google_drive import GoogleDriveError, GoogleDriveProvider
from services.telemetry import aggregate_observability, build_run_telemetry, compute_trends

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


# --- ServiceNow Config ---


@router.get("/servicenow")
async def get_snow_config(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    config = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    return config  # None serialises to JSON null


@router.put("/servicenow", response_model=ServiceNowConfig)
async def put_snow_config(
    tenant_id: str, body: PutServiceNowConfigRequest, request: Request
):
    await _require_tenant(tenant_id, request)
    return await request.app.state.snow_config_store.upsert(
        tenant_id,
        instance_url=body.instance_url,
        username=body.username,
        password=body.password,
    )


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


# --- Metrics ---


@router.get("/metrics", response_model=MetricsResponse)
async def get_metrics(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)

    runs = await request.app.state.run_store.list_runs_for_tenant(tenant_id)
    feedback_list = await request.app.state.feedback_store.list_for_tenant(tenant_id)

    total_runs = len(runs)
    completed_runs_list = [r for r in runs if r.status == "completed"]
    completed_runs = len(completed_runs_list)

    # success_rate from feedback
    feedback_count = len(feedback_list)
    success_rate = None
    if feedback_count > 0:
        success_count = sum(1 for fb in feedback_list if fb.outcome == "success")
        success_rate = success_count / feedback_count

    # avg_confidence from completed runs with results
    confidences = [
        r.result["confidence"]
        for r in completed_runs_list
        if r.result and "confidence" in r.result
    ]
    avg_confidence = sum(confidences) / len(confidences) if confidences else None

    # doc_hit_rate: fraction of completed runs where sources is non-empty
    runs_with_results = [r for r in completed_runs_list if r.result]
    if runs_with_results:
        hits = sum(1 for r in runs_with_results if r.result.get("sources"))
        doc_hit_rate = hits / len(runs_with_results)
    else:
        doc_hit_rate = None

    # avg_latency_seconds
    latencies = []
    for r in completed_runs_list:
        if r.completed_at and r.started_at:
            diff = (r.completed_at - r.started_at).total_seconds()
            latencies.append(diff)
    avg_latency_seconds = sum(latencies) / len(latencies) if latencies else None

    # writeback_success_rate from event_store
    writeback_success_rate = None
    writeback_run_ids: set[str] = set()
    writeback_complete_run_ids: set[str] = set()
    for r in runs:
        events = await request.app.state.event_store.list_events_for_run(r.run_id)
        for ev in events:
            if ev.skill_id == "Writeback":
                writeback_run_ids.add(r.run_id)
                if ev.event_type == "complete":
                    writeback_complete_run_ids.add(r.run_id)
    if writeback_run_ids:
        writeback_success_rate = len(writeback_complete_run_ids) / len(writeback_run_ids)

    # breakdown_by_classification_path
    path_counter: Counter[str] = Counter()
    path_success: Counter[str] = Counter()
    for fb in feedback_list:
        path = fb.classification_path or "(none)"
        path_counter[path] += 1
        if fb.outcome == "success":
            path_success[path] += 1
    breakdown = sorted(
        [
            {
                "classification_path": path,
                "count": count,
                "success_rate": path_success[path] / count if count else 0,
            }
            for path, count in path_counter.items()
        ],
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    return MetricsResponse(
        total_runs=total_runs,
        completed_runs=completed_runs,
        success_rate=success_rate,
        avg_confidence=avg_confidence,
        doc_hit_rate=doc_hit_rate,
        avg_latency_seconds=avg_latency_seconds,
        writeback_success_rate=writeback_success_rate,
        feedback_count=feedback_count,
        breakdown_by_classification_path=breakdown,
    )


# --- Observability ---


async def _build_tenant_telemetries(
    tenant_id: str, request: Request
) -> tuple[list[RunTelemetry], dict[str, "FeedbackEvent"]]:
    """Build telemetry for all runs in a tenant, caching in telemetry_store."""
    from models import FeedbackEvent  # noqa: F811

    runs = await request.app.state.run_store.list_runs_for_tenant(tenant_id)
    telemetry_store = request.app.state.telemetry_store
    feedback_store = request.app.state.feedback_store
    event_store = request.app.state.event_store

    telemetries: list[RunTelemetry] = []
    feedback_map: dict[str, FeedbackEvent] = {}

    for run in runs:
        # Skip runs that are still queued/running
        if run.status not in ("completed", "failed", "fallback_completed"):
            continue

        # Check cache first
        cached = await telemetry_store.get(run.run_id)
        if cached is not None:
            telemetries.append(cached)
        else:
            events = await event_store.list_events_for_run(run.run_id)
            feedback = await feedback_store.get_by_run(run.run_id)
            rt = build_run_telemetry(run, events, feedback)
            await telemetry_store.upsert(rt)
            telemetries.append(rt)

        fb = await feedback_store.get_by_run(run.run_id)
        if fb is not None:
            feedback_map[run.run_id] = fb

    return telemetries, feedback_map


@router.get("/observability/summary", response_model=ObservabilitySummaryResponse)
async def get_observability_summary(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    telemetries, feedback_map = await _build_tenant_telemetries(tenant_id, request)
    return aggregate_observability(tenant_id, telemetries, feedback_map)


@router.get("/observability/trends", response_model=ObservabilityTrendsResponse)
async def get_observability_trends(
    tenant_id: str,
    request: Request,
    window: Optional[int] = Query(None, description="7 or 30"),
):
    await _require_tenant(tenant_id, request)
    telemetries, feedback_map = await _build_tenant_telemetries(tenant_id, request)

    if window == 7:
        return ObservabilityTrendsResponse(
            last_7d=compute_trends(telemetries, 7, feedback_map),
        )
    if window == 30:
        return ObservabilityTrendsResponse(
            last_30d=compute_trends(telemetries, 30, feedback_map),
        )
    # Default: return both
    return ObservabilityTrendsResponse(
        last_7d=compute_trends(telemetries, 7, feedback_map),
        last_30d=compute_trends(telemetries, 30, feedback_map),
    )


@router.get("/observability/runs", response_model=list[RunTelemetry])
async def get_observability_runs(
    tenant_id: str,
    request: Request,
    limit: int = Query(50, ge=1, le=500),
):
    await _require_tenant(tenant_id, request)
    telemetries, _ = await _build_tenant_telemetries(tenant_id, request)
    # Newest first
    telemetries.sort(key=lambda t: t.started_at, reverse=True)
    return telemetries[:limit]
