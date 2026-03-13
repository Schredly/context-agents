"""Cross-use-case run listing and detail endpoints."""

import json
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/admin/{tenant_id}/uc-runs", tags=["uc-runs"])


async def _require_tenant(tenant_id: str, request: Request):
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.get("/")
async def list_all_runs(tenant_id: str, request: Request, filter_tenant: Optional[str] = Query(None)):
    """List all use-case runs for a tenant across all use cases."""
    await _require_tenant(tenant_id, request)
    if filter_tenant is not None:
        runs = await request.app.state.use_case_run_store.list_filtered(filter_tenant)
    else:
        runs = await request.app.state.use_case_run_store.list_for_tenant(tenant_id)
    runs.sort(key=lambda r: r.started_at, reverse=True)
    return [r.model_dump(mode="json") for r in runs]


@router.get("/{run_id}")
async def get_run(tenant_id: str, run_id: str, request: Request):
    """Get a single use-case run by ID."""
    await _require_tenant(tenant_id, request)
    run = await request.app.state.use_case_run_store.get(run_id)
    if run is None or run.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Run not found")
    return run.model_dump(mode="json")


@router.post("/{run_id}/cancel")
async def cancel_run(tenant_id: str, run_id: str, request: Request):
    """Cancel a running use-case run."""
    await _require_tenant(tenant_id, request)
    store = request.app.state.use_case_run_store
    run = await store.get(run_id)
    if run is None or run.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in ("queued", "running"):
        raise HTTPException(status_code=409, detail=f"Run is already {run.status}")
    await store.update(run_id, status="cancelled", completed_at=datetime.now(timezone.utc))
    return {"ok": True}


@router.get("/{run_id}/events")
async def run_events_sse(tenant_id: str, run_id: str, request: Request):
    """Stream run execution events as Server-Sent Events."""
    await _require_tenant(tenant_id, request)

    store = request.app.state.use_case_run_store
    run = await store.get(run_id)
    if run is None or run.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Run not found")

    async def event_generator():
        last_step_count = 0

        while True:
            current_run = await store.get(run_id)
            if current_run is None:
                break

            # Emit completed or failed steps
            done_steps = [s for s in current_run.steps if s.status in ("completed", "failed")]
            if len(done_steps) > last_step_count:
                for step in done_steps[last_step_count:]:
                    event_data = json.dumps({
                        "type": "step.completed",
                        "step": step.model_dump(mode="json"),
                        "run_status": current_run.status,
                        "total_tokens": current_run.total_tokens,
                        "total_latency_ms": current_run.total_latency_ms,
                    })
                    yield f"data: {event_data}\n\n"
                last_step_count = len(done_steps)

            # Handle cancelled
            if current_run.status == "cancelled":
                cancel_data = json.dumps({
                    "type": "run.cancelled",
                    "run": current_run.model_dump(mode="json"),
                })
                yield f"data: {cancel_data}\n\n"
                break

            if current_run.status in ("completed", "failed"):
                final_data = json.dumps({
                    "type": "run.completed",
                    "run": current_run.model_dump(mode="json"),
                })
                yield f"data: {final_data}\n\n"
                break

            await asyncio.sleep(0.3)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
