import asyncio
import json
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from models import (
    CreateUseCaseRequest,
    ToolCallRecord,
    UpdateUseCaseRequest,
    UseCase,
    UseCaseRun,
    UseCaseRunStep,
    UseCaseStep,
)
from services.tool_executor import execute_tool

router = APIRouter(prefix="/api/admin/{tenant_id}/use-cases", tags=["use-cases"])


async def _require_tenant(tenant_id: str, request: Request):
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


async def _validate_steps(steps: list[UseCaseStep], tenant_id: str, request: Request) -> None:
    for step in steps:
        skill = await request.app.state.skill_store.get(step.skill_id)
        if skill is None or skill.tenant_id != tenant_id:
            raise HTTPException(
                status_code=400,
                detail=f"Skill '{step.skill_id}' not found for this tenant",
            )


@router.get("/")
async def list_use_cases(tenant_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    return await request.app.state.use_case_store.list_for_tenant(tenant_id)


@router.post("/", status_code=201)
async def create_use_case(tenant_id: str, body: CreateUseCaseRequest, request: Request):
    await _require_tenant(tenant_id, request)
    if body.steps:
        await _validate_steps(body.steps, tenant_id, request)

    use_case = UseCase(
        id=f"uc_{uuid.uuid4().hex[:12]}",
        tenant_id=tenant_id,
        name=body.name,
        description=body.description,
        status=body.status,
        triggers=body.triggers,
        steps=body.steps,
    )
    return await request.app.state.use_case_store.create(use_case)


@router.get("/{use_case_id}")
async def get_use_case(tenant_id: str, use_case_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    uc = await request.app.state.use_case_store.get(use_case_id)
    if uc is None or uc.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Use case not found")
    return uc


@router.put("/{use_case_id}")
async def update_use_case(
    tenant_id: str, use_case_id: str, body: UpdateUseCaseRequest, request: Request
):
    await _require_tenant(tenant_id, request)
    uc = await request.app.state.use_case_store.get(use_case_id)
    if uc is None or uc.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Use case not found")

    updates = body.model_dump(exclude_none=True)
    if "steps" in updates:
        await _validate_steps(body.steps, tenant_id, request)
        # Convert step dicts back to UseCaseStep for storage
        updates["steps"] = [s.model_dump() for s in body.steps]

    return await request.app.state.use_case_store.update(use_case_id, **updates)


@router.delete("/{use_case_id}")
async def delete_use_case(tenant_id: str, use_case_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    uc = await request.app.state.use_case_store.get(use_case_id)
    if uc is None or uc.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Use case not found")
    await request.app.state.use_case_store.delete(use_case_id)
    return {"ok": True}


# --- Run Use Case (real tool execution) ---


@router.post("/{use_case_id}/run", status_code=201)
async def run_use_case(tenant_id: str, use_case_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    uc = await request.app.state.use_case_store.get(use_case_id)
    if uc is None or uc.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Use case not found")

    # Build execution steps from use case definition
    run_steps: list[UseCaseRunStep] = []
    for i, step in enumerate(uc.steps):
        skill = await request.app.state.skill_store.get(step.skill_id)
        run_steps.append(UseCaseRunStep(
            step_index=i,
            skill_id=step.skill_id,
            skill_name=skill.name if skill else step.name,
            model=skill.model if skill else "",
            tools=skill.tools if skill else [],
            instructions=skill.instructions if skill else "",
            status="pending",
        ))

    run_id = f"run_{uuid.uuid4().hex[:12]}"
    run = UseCaseRun(
        run_id=run_id,
        tenant_id=tenant_id,
        use_case_id=use_case_id,
        use_case_name=uc.name,
        status="queued",
        steps=run_steps,
    )
    await request.app.state.use_case_run_store.create(run)

    # Launch background execution
    asyncio.create_task(_execute_run(run_id, request.app))

    return run.model_dump(mode="json")


async def _execute_run(run_id: str, app) -> None:
    """Execute use case steps with real tool invocation."""
    store = app.state.use_case_run_store
    run = await store.get(run_id)
    if run is None:
        return

    await store.update(run_id, status="running")

    total_tokens = 0
    total_latency_ms = 0
    updated_steps: list[UseCaseRunStep] = []

    for step in run.steps:
        # Check for cancellation before each step
        current_run = await store.get(run_id)
        if current_run and current_run.status == "cancelled":
            break

        step_start = datetime.now(timezone.utc)
        t0 = time.monotonic()

        # Execute each tool in the skill sequentially
        tool_calls: list[ToolCallRecord] = []
        combined_tool_request: dict = {}
        combined_tool_response: dict = {}
        step_status = "completed"

        for tool_id in step.tools:
            tool_input = {"query": step.skill_name}  # Base input derived from skill context

            tc_t0 = time.monotonic()
            tool_result = await execute_tool(
                tenant_id=run.tenant_id,
                tool_id=tool_id,
                input_payload=tool_input,
                app=app,
            )
            tc_latency = int((time.monotonic() - tc_t0) * 1000)

            tc_status = "completed"
            if tool_result.get("status") == "not_implemented":
                tc_status = "not_implemented"
            elif tool_result.get("status") == "error":
                tc_status = "failed"
                step_status = "failed"

            tool_calls.append(ToolCallRecord(
                name=tool_id,
                status=tc_status,
                latency_ms=tc_latency,
                request=tool_input,
                response=tool_result,
            ))

            combined_tool_request[tool_id] = tool_input
            combined_tool_response[tool_id] = tool_result

        step_latency_ms = int((time.monotonic() - t0) * 1000)
        total_latency_ms += step_latency_ms

        # Estimate token count from payload sizes
        tokens = len(json.dumps(combined_tool_response)) // 4 + 50
        total_tokens += tokens

        step_end = datetime.now(timezone.utc)

        result_summary = f"{step.skill_name} executed {len(tool_calls)} tool(s)"
        if step_status == "failed":
            result_summary += " — one or more tools failed"

        llm_output = f"Step {step.step_index + 1} ({step.skill_name}): "
        for tc in tool_calls:
            llm_output += f"{tc.name} -> {tc.status}. "

        updated_step = UseCaseRunStep(
            step_index=step.step_index,
            skill_id=step.skill_id,
            skill_name=step.skill_name,
            model=step.model,
            tools=step.tools,
            instructions=step.instructions,
            status=step_status,
            latency_ms=step_latency_ms,
            tokens=tokens,
            result_summary=result_summary,
            tool_request_payload=combined_tool_request,
            tool_response=combined_tool_response,
            tool_calls=[tc.model_dump() for tc in tool_calls],
            llm_output=llm_output,
            started_at=step_start,
            completed_at=step_end,
        )
        updated_steps.append(updated_step)

        # Update run in-place so SSE clients can see progress
        await store.update(
            run_id,
            steps=[s.model_dump() for s in updated_steps + [
                s for s in run.steps if s.step_index > step.step_index
            ]],
            total_tokens=total_tokens,
            total_latency_ms=total_latency_ms,
        )

        # If step failed, stop execution
        if step_status == "failed":
            await store.update(
                run_id,
                status="failed",
                completed_at=datetime.now(timezone.utc),
                steps=[s.model_dump() for s in updated_steps + [
                    s for s in run.steps if s.step_index > step.step_index
                ]],
                total_tokens=total_tokens,
                total_latency_ms=total_latency_ms,
                final_result=f"Execution failed at step {step.step_index + 1} ({step.skill_name}).",
            )
            return

    # Check if cancelled
    final_run = await store.get(run_id)
    if final_run and final_run.status == "cancelled":
        return

    # Mark completed
    await store.update(
        run_id,
        status="completed",
        completed_at=datetime.now(timezone.utc),
        steps=[s.model_dump() for s in updated_steps],
        total_tokens=total_tokens,
        total_latency_ms=total_latency_ms,
        final_result=f"Use case execution completed successfully. {len(updated_steps)} steps executed.",
    )


# --- Use Case Runs list/detail ---


@router.get("/{use_case_id}/runs")
async def list_use_case_runs(tenant_id: str, use_case_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    uc = await request.app.state.use_case_store.get(use_case_id)
    if uc is None or uc.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Use case not found")
    runs = await request.app.state.use_case_run_store.list_for_use_case(use_case_id)
    runs.sort(key=lambda r: r.started_at, reverse=True)
    return [r.model_dump(mode="json") for r in runs]


# --- SSE endpoint for streaming run events ---


@router.get("/{use_case_id}/runs/{run_id}/events")
async def run_events_sse(tenant_id: str, use_case_id: str, run_id: str, request: Request):
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

            # Check if run is terminal
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


# --- Single run detail ---


@router.get("/{use_case_id}/runs/{run_id}")
async def get_use_case_run(tenant_id: str, use_case_id: str, run_id: str, request: Request):
    await _require_tenant(tenant_id, request)
    run = await request.app.state.use_case_run_store.get(run_id)
    if run is None or run.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Run not found")
    return run.model_dump(mode="json")
