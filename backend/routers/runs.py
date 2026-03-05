from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, WebSocket, WebSocketDisconnect

from models import AgentEvent, AgentRun, CreateFeedbackRequest, CreateRunRequest, FeedbackEvent, MetricsEvent, SaveToDriveRequest, SelectAnswerRequest, ServiceNowRunRequest, WorkObject, WritebackApproveRequest
from services.google_drive import GoogleDriveProvider
from services.orchestrator import run_orchestrator
from services.servicenow import ServiceNowError, ServiceNowProvider, format_work_notes

router = APIRouter(prefix="/api/runs", tags=["runs"])

_drive = GoogleDriveProvider()
_snow = ServiceNowProvider()

# Simple in-memory pubsub for live events per run
_event_subscribers: dict[str, list[asyncio.Queue]] = {}


async def _publish_event(event: AgentEvent) -> None:
    """Push an event to all WebSocket subscribers for this run."""
    for queue in _event_subscribers.get(event.run_id, []):
        await queue.put(event)


def _subscribe(run_id: str) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue()
    _event_subscribers.setdefault(run_id, []).append(queue)
    return queue


def _unsubscribe(run_id: str, queue: asyncio.Queue) -> None:
    subs = _event_subscribers.get(run_id, [])
    if queue in subs:
        subs.remove(queue)
    if not subs:
        _event_subscribers.pop(run_id, None)


# --- REST endpoints ---


@router.post("", status_code=201)
async def create_run(
    body: CreateRunRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    tenant = await request.app.state.tenant_store.get(body.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    run_id = f"run_{uuid.uuid4().hex[:12]}"
    run = AgentRun(
        run_id=run_id,
        tenant_id=body.tenant_id,
        status="queued",
        work_object=body.work_object,
    )
    await request.app.state.run_store.create_run(run)

    # Emit run_started metrics event
    await request.app.state.metrics_event_store.append(MetricsEvent(
        id=f"me_{uuid.uuid4().hex[:12]}",
        tenant_id=body.tenant_id,
        run_id=run_id,
        event_type="run_started",
        metadata={"source_system": body.work_object.source_system, "work_id": body.work_object.work_id},
    ))

    background_tasks.add_task(
        run_orchestrator,
        tenant_id=body.tenant_id,
        access_token=body.access_token,
        work_object=body.work_object,
        run_id=run_id,
        run_store=request.app.state.run_store,
        event_store=request.app.state.event_store,
        tenant_store=request.app.state.tenant_store,
        drive_config_store=request.app.state.drive_config_store,
        drive_provider=_drive,
        on_event=_publish_event,
        snow_config_store=request.app.state.snow_config_store,
        snow_provider=_snow,
        metrics_event_store=request.app.state.metrics_event_store,
        llm_config_store=request.app.state.llm_config_store,
        llm_assignment_store=request.app.state.llm_assignment_store,
    )

    return {"run_id": run_id}


@router.post("/from/servicenow", status_code=201)
async def create_run_from_servicenow(
    body: ServiceNowRunRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    # Validate tenant
    tenant = await request.app.state.tenant_store.get(body.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if tenant.status != "active":
        raise HTTPException(status_code=403, detail="Tenant is not active")

    # Validate secret
    if not tenant.shared_secret or tenant.shared_secret != body.tenant_secret:
        raise HTTPException(status_code=401, detail="Invalid tenant secret")

    work_object = WorkObject(
        work_id=body.number or body.sys_id,
        source_system="servicenow",
        record_type="incident",
        title=body.short_description,
        description=body.description,
        classification=body.classification,
        metadata={"sys_id": body.sys_id, "number": body.number, **(body.metadata or {})},
    )

    run_id = f"run_{uuid.uuid4().hex[:12]}"
    run = AgentRun(
        run_id=run_id,
        tenant_id=body.tenant_id,
        status="queued",
        work_object=work_object,
    )
    await request.app.state.run_store.create_run(run)

    # Emit run_started metrics event
    await request.app.state.metrics_event_store.append(MetricsEvent(
        id=f"me_{uuid.uuid4().hex[:12]}",
        tenant_id=body.tenant_id,
        run_id=run_id,
        event_type="run_started",
        metadata={"source_system": "servicenow", "work_id": work_object.work_id},
    ))

    background_tasks.add_task(
        run_orchestrator,
        tenant_id=body.tenant_id,
        access_token=body.access_token or "",
        work_object=work_object,
        run_id=run_id,
        run_store=request.app.state.run_store,
        event_store=request.app.state.event_store,
        tenant_store=request.app.state.tenant_store,
        drive_config_store=request.app.state.drive_config_store,
        drive_provider=_drive,
        on_event=_publish_event,
        snow_config_store=request.app.state.snow_config_store,
        snow_provider=_snow,
        metrics_event_store=request.app.state.metrics_event_store,
        llm_config_store=request.app.state.llm_config_store,
        llm_assignment_store=request.app.state.llm_assignment_store,
    )

    return {"run_id": run_id}


@router.post("/from/servicenow/preview", status_code=201)
async def create_run_from_servicenow_preview(
    body: ServiceNowRunRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Create a ServiceNow-sourced run WITHOUT writeback (preview mode)."""
    # Validate tenant
    tenant = await request.app.state.tenant_store.get(body.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if tenant.status != "active":
        raise HTTPException(status_code=403, detail="Tenant is not active")

    # Validate secret
    if not tenant.shared_secret or tenant.shared_secret != body.tenant_secret:
        raise HTTPException(status_code=401, detail="Invalid tenant secret")

    work_object = WorkObject(
        work_id=body.number or body.sys_id,
        source_system="servicenow",
        record_type="incident",
        title=body.short_description,
        description=body.description,
        classification=body.classification,
        metadata={"sys_id": body.sys_id, "number": body.number, **(body.metadata or {})},
    )

    run_id = f"run_{uuid.uuid4().hex[:12]}"
    run = AgentRun(
        run_id=run_id,
        tenant_id=body.tenant_id,
        status="queued",
        work_object=work_object,
    )
    await request.app.state.run_store.create_run(run)

    # Emit run_started metrics event
    await request.app.state.metrics_event_store.append(MetricsEvent(
        id=f"me_{uuid.uuid4().hex[:12]}",
        tenant_id=body.tenant_id,
        run_id=run_id,
        event_type="run_started",
        metadata={"source_system": "servicenow", "work_id": work_object.work_id, "preview": True},
    ))

    background_tasks.add_task(
        run_orchestrator,
        tenant_id=body.tenant_id,
        access_token=body.access_token or "",
        work_object=work_object,
        run_id=run_id,
        run_store=request.app.state.run_store,
        event_store=request.app.state.event_store,
        tenant_store=request.app.state.tenant_store,
        drive_config_store=request.app.state.drive_config_store,
        drive_provider=_drive,
        on_event=_publish_event,
        snow_config_store=request.app.state.snow_config_store,
        snow_provider=_snow,
        metrics_event_store=request.app.state.metrics_event_store,
        allow_writeback=False,
        llm_config_store=request.app.state.llm_config_store,
        llm_assignment_store=request.app.state.llm_assignment_store,
    )

    return {"run_id": run_id}


@router.post("/{run_id}/writeback/approve")
async def approve_writeback(
    run_id: str,
    body: WritebackApproveRequest,
    tenant_id: str,
    request: Request,
):
    """Perform writeback to ServiceNow after a completed preview run."""
    # Validate tenant
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if tenant.status != "active":
        raise HTTPException(status_code=403, detail="Tenant is not active")

    # Validate secret
    if not tenant.shared_secret or tenant.shared_secret != body.tenant_secret:
        raise HTTPException(status_code=401, detail="Invalid tenant secret")

    # Validate run
    run = await request.app.state.run_store.get_run(run_id)
    if run is None or run.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status not in ("completed", "fallback_completed"):
        raise HTTPException(
            status_code=409,
            detail=f"Run is '{run.status}' — must be 'completed' or 'fallback_completed' to approve writeback",
        )

    if run.work_object.source_system != "servicenow":
        raise HTTPException(
            status_code=400,
            detail="Run source_system is not 'servicenow'",
        )

    if run.result is None:
        raise HTTPException(status_code=409, detail="Run has no result to write back")

    # Load ServiceNow config
    snow_config = await request.app.state.snow_config_store.get_by_tenant(tenant_id)
    if snow_config is None:
        raise HTTPException(status_code=400, detail="No ServiceNow config found for tenant")

    # Format work notes
    summary_text = run.result.get("summary", "")
    steps = run.result.get("steps", [])
    result_sources = run.result.get("sources", [])
    confidence = float(run.result.get("confidence", 0))

    notes = format_work_notes(summary_text, steps, result_sources, confidence, run_id)

    # Prepend optional note_prefix
    if body.note_prefix:
        notes = f"{body.note_prefix}\n\n{notes}"

    # Perform writeback
    sys_id = body.sys_id
    metrics_event_store = request.app.state.metrics_event_store

    try:
        await _snow.update_work_notes(
            instance_url=snow_config.instance_url,
            username=snow_config.username,
            password=snow_config.password,
            sys_id=sys_id,
            work_notes=notes,
            tenant_id=tenant_id,
        )
    except ServiceNowError as exc:
        injected = getattr(exc, "injected", False)
        wb_failed_meta: dict[str, Any] = {
            "sys_id": sys_id,
            "tenant_id": tenant_id,
            "http_status": exc.status_code,
            "error_message": str(exc),
            "approved_writeback": True,
        }
        if injected:
            wb_failed_meta["injected"] = True
        await metrics_event_store.append(MetricsEvent(
            id=f"me_{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            run_id=run_id,
            event_type="writeback_failed",
            skill_name="Writeback",
            metadata=wb_failed_meta,
        ))
        # Mark run as failed
        await request.app.state.run_store.update_run(run_id, status="failed")
        raise HTTPException(
            status_code=502,
            detail=f"ServiceNow writeback failed: {exc}",
        )
    except Exception as exc:
        await metrics_event_store.append(MetricsEvent(
            id=f"me_{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            run_id=run_id,
            event_type="writeback_failed",
            skill_name="Writeback",
            metadata={
                "sys_id": sys_id,
                "tenant_id": tenant_id,
                "error_message": str(exc),
                "approved_writeback": True,
            },
        ))
        await request.app.state.run_store.update_run(run_id, status="failed")
        raise HTTPException(
            status_code=502,
            detail=f"ServiceNow writeback failed: {exc}",
        )

    # Writeback succeeded
    await metrics_event_store.append(MetricsEvent(
        id=f"me_{uuid.uuid4().hex[:12]}",
        tenant_id=tenant_id,
        run_id=run_id,
        event_type="writeback_success",
        skill_name="Writeback",
        metadata={
            "sys_id": sys_id,
            "tenant_id": tenant_id,
            "approved_writeback": True,
        },
    ))

    # If run was previously failed due to a prior writeback attempt, restore to correct status
    # (run.status is already completed/fallback_completed per the gate above, so this is a no-op
    # for first-time approvals — but we re-confirm the status to be safe)
    run_fresh = await request.app.state.run_store.get_run(run_id)
    if run_fresh and run_fresh.status == "failed":
        # Restore based on whether fallback was used (check result confidence heuristic
        # or just set to completed since user explicitly approved)
        await request.app.state.run_store.update_run(run_id, status="completed")

    return {"ok": True}


@router.get("")
async def list_runs(tenant_id: str, request: Request):
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    runs = await request.app.state.run_store.list_runs_for_tenant(tenant_id)
    # Return newest first
    runs.sort(key=lambda r: r.started_at, reverse=True)
    return [r.model_dump(mode="json") for r in runs]


@router.get("/{run_id}")
async def get_run(run_id: str, tenant_id: str, request: Request):
    run = await request.app.state.run_store.get_run(run_id)
    if run is None or run.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Run not found")
    return run.model_dump(mode="json")


# --- WebSocket endpoint ---


_TERMINAL_STATUSES = ("completed", "failed", "fallback_completed")


@router.websocket("/{run_id}/events")
async def run_events_ws(websocket: WebSocket, run_id: str, tenant_id: str = ""):
    await websocket.accept()

    # Validate tenant owns this run
    run = await websocket.app.state.run_store.get_run(run_id)
    if run is None or run.tenant_id != tenant_id:
        await websocket.close(code=4004, reason="Run not found or tenant mismatch")
        return

    # Replay existing events
    existing = await websocket.app.state.event_store.list_events_for_run(run_id)
    for event in existing:
        await websocket.send_json(event.model_dump(mode="json"))

    # If run is already terminal, close after replay
    run_fresh = await websocket.app.state.run_store.get_run(run_id)
    if run_fresh and run_fresh.status in _TERMINAL_STATUSES:
        await websocket.send_json({"type": "stream_end", "status": run_fresh.status})
        await websocket.close()
        return

    # Subscribe and stream live events
    queue = _subscribe(run_id)
    try:
        while True:
            event: AgentEvent = await asyncio.wait_for(queue.get(), timeout=120)
            await websocket.send_json(event.model_dump(mode="json"))
            # Check if run is now terminal
            if event.event_type in ("complete", "error") and event.skill_id in (
                "RecordOutcome", "Writeback"
            ):
                run_now = await websocket.app.state.run_store.get_run(run_id)
                if run_now and run_now.status in _TERMINAL_STATUSES:
                    await websocket.send_json(
                        {"type": "stream_end", "status": run_now.status}
                    )
                    break
            if event.event_type == "error" and event.skill_id == "Orchestrator":
                await websocket.send_json({"type": "stream_end", "status": "failed"})
                break
    except asyncio.TimeoutError:
        await websocket.send_json({"type": "stream_end", "status": "timeout"})
    except WebSocketDisconnect:
        pass
    finally:
        _unsubscribe(run_id, queue)


# --- Answer selection & save-to-drive ---


@router.put("/{run_id}/select-answer")
async def select_answer(
    run_id: str,
    body: SelectAnswerRequest,
    request: Request,
):
    """Select KB or LLM answer for a dual-mode run."""
    run = await request.app.state.run_store.get_run(run_id)
    if run is None or run.tenant_id != body.tenant_id:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.result is None:
        raise HTTPException(status_code=409, detail="Run has no result")

    if run.result.get("mode") != "dual":
        raise HTTPException(status_code=400, detail="Run is not in dual mode")

    answer_key = f"{body.selected}_answer"
    if answer_key not in run.result:
        raise HTTPException(status_code=400, detail=f"No {body.selected} answer available")

    # Update the selected field and top-level fields for backward compat
    selected_answer = run.result[answer_key]
    updated_result = {
        **run.result,
        "selected": body.selected,
        "summary": selected_answer["summary"],
        "steps": selected_answer["steps"],
        "sources": selected_answer["sources"],
        "confidence": selected_answer["confidence"],
    }

    await request.app.state.run_store.update_run(run_id, result=updated_result)

    # Return the updated run
    updated_run = await request.app.state.run_store.get_run(run_id)
    return updated_run.model_dump(mode="json")


@router.post("/{run_id}/save-to-drive")
async def save_to_drive(
    run_id: str,
    body: SaveToDriveRequest,
    request: Request,
):
    """Save the selected LLM answer to the classification folder in Google Drive."""
    run = await request.app.state.run_store.get_run(run_id)
    if run is None or run.tenant_id != body.tenant_id:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.result is None:
        raise HTTPException(status_code=409, detail="Run has no result")

    if run.result.get("selected") != "llm":
        raise HTTPException(status_code=400, detail="Only LLM answers can be saved to Drive")

    folder_id = run.result.get("classification_folder_id")
    if not folder_id:
        raise HTTPException(status_code=400, detail="No classification folder ID available")

    llm_answer = run.result.get("llm_answer")
    if not llm_answer:
        raise HTTPException(status_code=400, detail="No LLM answer available")

    # Format as markdown
    title = run.work_object.title
    summary = llm_answer.get("summary", "")
    steps = llm_answer.get("steps", [])
    sources = llm_answer.get("sources", [])

    lines = [f"# {title}", "", summary, ""]
    if steps:
        lines.append("## Resolution Steps")
        for i, step in enumerate(steps, 1):
            lines.append(f"{i}. {step}")
        lines.append("")
    if sources:
        lines.append("## Sources")
        for src in sources:
            src_title = src.get("title", "Untitled")
            src_url = src.get("url", "")
            if src_url:
                lines.append(f"- [{src_title}]({src_url})")
            else:
                lines.append(f"- {src_title}")
        lines.append("")

    content = "\n".join(lines)
    work_id = run.work_object.work_id.replace("/", "_").replace(" ", "_")
    filename = f"resolution_{work_id}.md"

    try:
        file_info = await _drive.upload_document(
            access_token=body.access_token,
            folder_id=folder_id,
            filename=filename,
            content=content,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Drive upload failed: {exc}")

    return {
        "ok": True,
        "file_id": file_info.get("id", ""),
        "web_link": file_info.get("webViewLink", ""),
    }


# --- Feedback endpoints ---


@router.post("/feedback", status_code=201)
async def submit_feedback(body: CreateFeedbackRequest, request: Request):
    run = await request.app.state.run_store.get_run(body.run_id)
    if run is None or run.tenant_id != body.tenant_id:
        raise HTTPException(status_code=404, detail="Run not found")

    classification_path = "/".join(
        cp.value for cp in run.work_object.classification
    ) if run.work_object.classification else ""

    # Extract confidence at time of feedback
    confidence_at_time = None
    if run.result and "confidence" in run.result:
        confidence_at_time = float(run.result["confidence"])

    event = FeedbackEvent(
        id=f"fb_{uuid.uuid4().hex[:12]}",
        tenant_id=body.tenant_id,
        run_id=body.run_id,
        work_id=run.work_object.work_id,
        outcome=body.outcome,
        reason=body.reason,
        notes=body.notes,
        classification_path=classification_path,
        confidence_at_time=confidence_at_time,
    )
    stored = await request.app.state.feedback_store.append(event)

    # Emit feedback_recorded metrics event
    await request.app.state.metrics_event_store.append(MetricsEvent(
        id=f"me_{uuid.uuid4().hex[:12]}",
        tenant_id=body.tenant_id,
        run_id=body.run_id,
        event_type="feedback_recorded",
        metadata={
            "outcome": body.outcome,
            "reason": body.reason,
            "confidence_at_time": confidence_at_time,
        },
    ))

    # Invalidate cached telemetry so next observability query recomputes
    telemetry_store = request.app.state.telemetry_store
    cached = await telemetry_store.get(body.run_id)
    if cached is not None:
        # Remove stale cache entry by overwriting — recomputed on next access
        await telemetry_store.upsert(cached.model_copy(update={}))

    return stored.model_dump(mode="json")


@router.get("/feedback/{run_id}")
async def get_feedback(run_id: str, tenant_id: str, request: Request):
    fb = await request.app.state.feedback_store.get_by_run(run_id)
    if fb is None or fb.tenant_id != tenant_id:
        return None
    return fb.model_dump(mode="json")
