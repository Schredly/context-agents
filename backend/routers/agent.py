import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from models import UseCaseRun, UseCaseRunStep, ToolCallRecord
from services.tool_executor import execute_tool

router = APIRouter(prefix="/api/admin/{tenant_id}/agent", tags=["agent"])


class AgentAskRequest(BaseModel):
    prompt: str


class AgentAskResponse(BaseModel):
    reasoning: list[str]
    use_case: str
    skills: list[str]
    tools: list[str]
    result: str


async def _require_tenant(tenant_id: str, request: Request):
    tenant = await request.app.state.tenant_store.get(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


def _score_use_case(prompt: str, uc) -> float:
    """Score a use case against the prompt using keyword overlap."""
    prompt_tokens = set(prompt.lower().split())

    # Gather candidate tokens from the use case
    candidate_parts: list[str] = []
    candidate_parts.extend(uc.name.lower().split())
    candidate_parts.extend(uc.description.lower().split())
    for trigger in uc.triggers:
        candidate_parts.extend(trigger.lower().split())

    candidate_tokens = set(candidate_parts)
    if not candidate_tokens:
        return 0.0

    overlap = prompt_tokens & candidate_tokens
    return len(overlap) / max(len(prompt_tokens), 1)


@router.post("/ask", response_model=AgentAskResponse)
async def ask_agent(tenant_id: str, body: AgentAskRequest, request: Request):
    await _require_tenant(tenant_id, request)

    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    reasoning: list[str] = []

    # Step 1: Load active use cases for the tenant
    all_use_cases = await request.app.state.use_case_store.list_for_tenant(tenant_id)
    active_use_cases = [uc for uc in all_use_cases if uc.status == "active"]

    reasoning.append(f"Analyzing request: \"{prompt}\"")

    if not active_use_cases:
        return AgentAskResponse(
            reasoning=[*reasoning, "No active use cases found for this tenant"],
            use_case="None",
            skills=[],
            tools=[],
            result="No active workflows are configured. Please create and activate a use case first.",
        )

    # Step 2: Score each use case against the prompt
    scored = [(uc, _score_use_case(prompt, uc)) for uc in active_use_cases]
    scored.sort(key=lambda x: x[1], reverse=True)
    best_uc, best_score = scored[0]

    reasoning.append(f"Matched {len(active_use_cases)} use case(s) — best match: \"{best_uc.name}\" (score: {best_score:.0%})")

    if best_score < 0.05:
        return AgentAskResponse(
            reasoning=[*reasoning, "No matching workflow found for this query"],
            use_case="None",
            skills=[],
            tools=[],
            result="No matching workflow found. Try rephrasing your question or check available use cases.",
        )

    reasoning.append(f"Selected use case: \"{best_uc.name}\"")

    # Step 3: Load skills for each step
    skill_names: list[str] = []
    tool_ids: list[str] = []
    results: list[str] = []

    for step in best_uc.steps:
        skill = await request.app.state.skill_store.get(step.skill_id)
        if skill:
            skill_names.append(skill.name)
            tool_ids.extend(skill.tools)

    reasoning.append(f"Executing {len(best_uc.steps)} step(s) with {len(tool_ids)} tool(s)")

    # Step 4: Execute tools
    for step in best_uc.steps:
        skill = await request.app.state.skill_store.get(step.skill_id)
        if not skill:
            continue

        for tool_id in skill.tools:
            tool_input = {"query": prompt}
            tool_result = await execute_tool(
                tenant_id=tenant_id,
                tool_id=tool_id,
                input_payload=tool_input,
                app=request.app,
            )

            status = tool_result.get("status", "ok")
            if status == "not_implemented":
                results.append(f"{tool_id}: not implemented")
            elif status == "error":
                results.append(f"{tool_id}: error — {tool_result.get('error', 'unknown')}")
            else:
                # Summarize tool result
                if "incidents" in tool_result:
                    count = len(tool_result["incidents"])
                    results.append(f"Found {count} incident(s) matching query")
                elif "articles" in tool_result:
                    count = len(tool_result["articles"])
                    results.append(f"Found {count} knowledge base article(s)")
                elif "files" in tool_result:
                    count = len(tool_result["files"])
                    results.append(f"Found {count} document(s)")
                else:
                    results.append(f"{tool_id}: completed")

    # Build final result summary
    if results:
        result_text = "Agent completed execution.\n\n" + "\n".join(f"- {r}" for r in results)
    else:
        result_text = f"Use case \"{best_uc.name}\" matched but no tools were executed."

    return AgentAskResponse(
        reasoning=reasoning,
        use_case=best_uc.name,
        skills=skill_names,
        tools=tool_ids,
        result=result_text,
    )
