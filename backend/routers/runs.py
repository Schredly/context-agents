from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, WebSocket, WebSocketDisconnect

from models import AgentEvent, AgentRun, CreateFeedbackRequest, CreateRunRequest, FeedbackEvent, ServiceNowRunRequest, WorkObject
from services.google_drive import GoogleDriveProvider
from services.orchestrator import run_orchestrator
from services.servicenow import ServiceNowProvider

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
    )

    return {"run_id": run_id}


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
    if run_fresh and run_fresh.status in ("completed", "failed"):
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
                if run_now and run_now.status in ("completed", "failed"):
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


# --- Feedback endpoints ---


@router.post("/feedback", status_code=201)
async def submit_feedback(body: CreateFeedbackRequest, request: Request):
    run = await request.app.state.run_store.get_run(body.run_id)
    if run is None or run.tenant_id != body.tenant_id:
        raise HTTPException(status_code=404, detail="Run not found")

    classification_path = "/".join(
        cp.value for cp in run.work_object.classification
    ) if run.work_object.classification else ""

    event = FeedbackEvent(
        id=f"fb_{uuid.uuid4().hex[:12]}",
        tenant_id=body.tenant_id,
        run_id=body.run_id,
        work_id=run.work_object.work_id,
        outcome=body.outcome,
        reason=body.reason,
        notes=body.notes,
        classification_path=classification_path,
    )
    stored = await request.app.state.feedback_store.append(event)
    return stored.model_dump(mode="json")


@router.get("/feedback/{run_id}")
async def get_feedback(run_id: str, tenant_id: str, request: Request):
    fb = await request.app.state.feedback_store.get_by_run(run_id)
    if fb is None or fb.tenant_id != tenant_id:
        return None
    return fb.model_dump(mode="json")
