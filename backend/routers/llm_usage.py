"""LLM Usage and Cost Ledger API endpoints."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter(prefix="/api/admin/{tenant_id}/llm-usage", tags=["llm-usage"])


def _parse_time_filter(time_filter: str) -> Optional[datetime]:
    """Convert a time filter string to a cutoff datetime."""
    now = datetime.now(timezone.utc)
    if time_filter == "1h":
        return now - timedelta(hours=1)
    elif time_filter == "24h":
        return now - timedelta(hours=24)
    elif time_filter == "7d":
        return now - timedelta(days=7)
    elif time_filter == "30d":
        return now - timedelta(days=30)
    return None  # "all" or "custom"


@router.get("")
async def list_usage(
    tenant_id: str,
    request: Request,
    time_filter: str = Query("24h"),
    start_time: Optional[str] = Query(None),
    end_time: Optional[str] = Query(None),
):
    """List LLM usage events for a tenant, with optional time filtering."""
    events = await request.app.state.llm_usage_store.list_for_tenant(tenant_id)

    cutoff = _parse_time_filter(time_filter)
    if cutoff:
        events = [e for e in events if e.timestamp >= cutoff]
    elif start_time and end_time:
        try:
            st = datetime.fromisoformat(start_time)
            et = datetime.fromisoformat(end_time)
            events = [e for e in events if st <= e.timestamp <= et]
        except ValueError:
            pass

    return [
        {
            "id": e.id,
            "timestamp": e.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "tenant": tenant_id,
            "useCase": e.use_case,
            "skill": e.skill,
            "model": e.model,
            "tokens": e.total_tokens,
            "cost": round(e.cost, 6),
            "latency": f"{e.latency_ms / 1000:.1f}s",
            "runId": e.run_id,
        }
        for e in events
    ]


@router.get("/summary")
async def usage_summary(
    tenant_id: str,
    request: Request,
    time_filter: str = Query("24h"),
):
    """Compute summary metrics for the cost ledger cards."""
    events = await request.app.state.llm_usage_store.list_for_tenant(tenant_id)

    cutoff = _parse_time_filter(time_filter)
    if cutoff:
        events = [e for e in events if e.timestamp >= cutoff]

    if not events:
        return {
            "totalCost": 0.0,
            "totalTokens": 0,
            "avgCostPerRun": 0.0,
            "executionCount": 0,
            "uniqueRuns": 0,
            "avgTokensPerExecution": 0,
            "mostExpensiveUseCase": "N/A",
            "mostExpensiveUseCaseCost": 0.0,
        }

    total_cost = sum(e.cost for e in events)
    total_tokens = sum(e.total_tokens for e in events)
    unique_runs = len({e.run_id for e in events if e.run_id})
    avg_cost_per_run = total_cost / max(unique_runs, 1)

    # Most expensive use case
    uc_costs: dict[str, float] = {}
    for e in events:
        if e.use_case:
            uc_costs[e.use_case] = uc_costs.get(e.use_case, 0) + e.cost
    most_expensive = max(uc_costs.items(), key=lambda x: x[1]) if uc_costs else ("N/A", 0.0)

    return {
        "totalCost": round(total_cost, 6),
        "totalTokens": total_tokens,
        "avgCostPerRun": round(avg_cost_per_run, 6),
        "executionCount": len(events),
        "uniqueRuns": unique_runs,
        "avgTokensPerExecution": total_tokens // max(len(events), 1),
        "mostExpensiveUseCase": most_expensive[0],
        "mostExpensiveUseCaseCost": round(most_expensive[1], 6),
    }


@router.get("/ledger")
async def cost_ledger(
    tenant_id: str,
    request: Request,
    time_filter: str = Query("24h"),
    group_by: str = Query("none"),
):
    """Return ledger data, optionally grouped by a dimension."""
    events = await request.app.state.llm_usage_store.list_for_tenant(tenant_id)

    cutoff = _parse_time_filter(time_filter)
    if cutoff:
        events = [e for e in events if e.timestamp >= cutoff]

    if group_by == "none":
        return [
            {
                "id": e.id,
                "timestamp": e.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                "tenant": tenant_id,
                "useCase": e.use_case,
                "skill": e.skill,
                "model": e.model,
                "tokens": e.total_tokens,
                "cost": round(e.cost, 6),
                "latency": f"{e.latency_ms / 1000:.1f}s",
                "runId": e.run_id,
            }
            for e in events
        ]

    # Grouped response
    groups: dict[str, dict] = {}
    for e in events:
        if group_by == "model":
            key = e.model
        elif group_by == "useCase":
            key = e.use_case
        elif group_by == "skill":
            key = e.skill
        elif group_by == "tenant":
            key = tenant_id
        else:
            key = "all"

        if key not in groups:
            groups[key] = {
                "id": f"group_{key}",
                "timestamp": "-",
                "tenant": tenant_id if group_by == "tenant" else "Multiple",
                "useCase": key if group_by == "useCase" else "Multiple",
                "skill": key if group_by == "skill" else "Multiple",
                "model": key if group_by == "model" else "Multiple",
                "tokens": 0,
                "cost": 0.0,
                "latency": "-",
                "runId": "-",
                "isGroup": True,
                "count": 0,
            }
        groups[key]["tokens"] += e.total_tokens
        groups[key]["cost"] = round(groups[key]["cost"] + e.cost, 6)
        groups[key]["count"] += 1

    return list(groups.values())
