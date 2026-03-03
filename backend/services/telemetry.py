from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from models import (
    AgentEvent,
    AgentRun,
    FeedbackEvent,
    MetricsEvent,
    ObservabilitySummaryResponse,
    ObservabilityTrendPoint,
    ObservabilityTrendsResponse,
    RunTelemetry,
    SkillTelemetry,
)

SKILL_ORDER = ["ValidateInput", "RetrieveDocs", "SynthesizeResolution", "RecordOutcome", "Writeback"]


def _meta_val(event: AgentEvent, key: str) -> object:
    if event.metadata and key in event.metadata:
        return event.metadata[key]
    return None


def _int_or_none(val: object) -> Optional[int]:
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def build_skill_telemetry(skill_id: str, skill_events: list[AgentEvent]) -> SkillTelemetry:
    if not skill_events:
        return SkillTelemetry(skill_id=skill_id, status="skipped")

    has_error = any(e.event_type == "error" for e in skill_events)
    has_complete = any(e.event_type == "complete" for e in skill_events)

    if has_error and not has_complete:
        status = "failed"
    elif has_complete:
        status = "completed"
    else:
        status = "skipped"

    # Duration
    duration_ms: Optional[int] = None
    if len(skill_events) >= 2:
        first_ts = skill_events[0].timestamp
        last_ts = skill_events[-1].timestamp
        diff = (last_ts - first_ts).total_seconds() * 1000
        if diff > 0:
            duration_ms = int(diff)

    tool_calls = sum(1 for e in skill_events if e.event_type == "tool_call")
    tool_errors = sum(1 for e in skill_events if e.event_type == "error")

    # Extract metadata from latest tool_result
    model: Optional[str] = None
    model_latency_ms: Optional[int] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    doc_count: Optional[int] = None
    fallback_used: Optional[bool] = None

    tool_results = [e for e in skill_events if e.event_type == "tool_result"]
    if tool_results:
        tr = tool_results[-1]
        model = str(_meta_val(tr, "model")) if _meta_val(tr, "model") is not None else None
        model_latency_ms = _int_or_none(_meta_val(tr, "latency_ms"))
        input_tokens = _int_or_none(_meta_val(tr, "input_tokens"))
        output_tokens = _int_or_none(_meta_val(tr, "output_tokens"))
        doc_count = _int_or_none(_meta_val(tr, "doc_count"))

    # Check fallback in any event metadata
    for e in skill_events:
        if _meta_val(e, "fallback") is True:
            fallback_used = True
            break

    return SkillTelemetry(
        skill_id=skill_id,
        status=status,
        duration_ms=duration_ms,
        tool_calls=tool_calls,
        tool_errors=tool_errors,
        model=model,
        model_latency_ms=model_latency_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        doc_count=doc_count,
        fallback_used=fallback_used,
    )


def build_run_telemetry(
    run: AgentRun,
    events: list[AgentEvent],
    feedback: Optional[FeedbackEvent],
) -> RunTelemetry:
    classification_path = "/".join(
        cp.value for cp in run.work_object.classification
    ) if run.work_object.classification else ""

    # Duration
    duration_ms: Optional[int] = None
    if run.completed_at and run.started_at:
        diff = (run.completed_at - run.started_at).total_seconds() * 1000
        duration_ms = int(diff)

    # Confidence + doc_hit
    confidence: Optional[float] = None
    doc_hit: Optional[bool] = None
    if run.result:
        if "confidence" in run.result:
            confidence = float(run.result["confidence"])
        sources = run.result.get("sources")
        doc_hit = bool(sources) if sources is not None else None

    # Group events by skill
    skill_events: dict[str, list[AgentEvent]] = defaultdict(list)
    for ev in events:
        skill_events[ev.skill_id].append(ev)

    # Build skill telemetries
    seen_skills = set(skill_events.keys())
    all_skills = list(dict.fromkeys(SKILL_ORDER + list(seen_skills)))
    skills = [build_skill_telemetry(sid, skill_events.get(sid, [])) for sid in all_skills]

    # Fallback
    fallback_used = any(s.fallback_used is True for s in skills)

    # Writeback
    writeback_attempted = "Writeback" in seen_skills
    writeback_success: Optional[bool] = None
    if writeback_attempted:
        wb_events = skill_events.get("Writeback", [])
        has_wb_complete = any(e.event_type == "complete" for e in wb_events)
        has_wb_error = any(e.event_type == "error" for e in wb_events)
        if has_wb_complete:
            writeback_success = True
        elif has_wb_error:
            writeback_success = False

    # Model + tokens
    model_counter: Counter[str] = Counter()
    total_input: int = 0
    total_output: int = 0
    has_tokens = False
    for ev in events:
        m = _meta_val(ev, "model")
        if m is not None:
            model_counter[str(m)] += 1
        it = _int_or_none(_meta_val(ev, "input_tokens"))
        ot = _int_or_none(_meta_val(ev, "output_tokens"))
        if it is not None:
            total_input += it
            has_tokens = True
        if ot is not None:
            total_output += ot
            has_tokens = True

    model = model_counter.most_common(1)[0][0] if model_counter else None

    if run.status in ("completed", "fallback_completed"):
        status = "fallback_completed" if fallback_used else "completed"
    else:
        status = "failed"

    return RunTelemetry(
        tenant_id=run.tenant_id,
        run_id=run.run_id,
        work_id=run.work_object.work_id,
        source_system=run.work_object.source_system,
        record_type=run.work_object.record_type,
        classification_path=classification_path,
        started_at=run.started_at,
        completed_at=run.completed_at,
        status=status,
        duration_ms=duration_ms,
        confidence=confidence,
        doc_hit=doc_hit,
        writeback_attempted=writeback_attempted,
        writeback_success=writeback_success,
        fallback_used=fallback_used,
        model=model,
        total_input_tokens=total_input if has_tokens else None,
        total_output_tokens=total_output if has_tokens else None,
        skills=skills,
    )


def aggregate_observability(
    tenant_id: str,
    run_telemetries: list[RunTelemetry],
    feedback_map: Optional[dict[str, FeedbackEvent]] = None,
    metrics_events: Optional[list[MetricsEvent]] = None,
) -> ObservabilitySummaryResponse:
    now = datetime.now(timezone.utc)
    d7 = now - timedelta(days=7)
    d30 = now - timedelta(days=30)

    total = len(run_telemetries)
    completed = sum(1 for r in run_telemetries if r.status in ("completed", "fallback_completed"))
    failed = sum(1 for r in run_telemetries if r.status == "failed")
    last_7d = sum(1 for r in run_telemetries if r.started_at >= d7)
    last_30d = sum(1 for r in run_telemetries if r.started_at >= d30)

    # Durations
    durations = [r.duration_ms for r in run_telemetries if r.duration_ms is not None]
    avg_duration = sum(durations) / len(durations) if durations else None
    p95_duration: Optional[int] = None
    if durations:
        sorted_d = sorted(durations)
        idx = int(math.ceil(0.95 * len(sorted_d))) - 1
        p95_duration = sorted_d[max(0, idx)]

    # Confidence
    confidences = [r.confidence for r in run_telemetries if r.confidence is not None]
    avg_confidence = sum(confidences) / len(confidences) if confidences else None

    # Doc hit rate
    runs_with_doc_info = [r for r in run_telemetries if r.doc_hit is not None]
    doc_hit_rate = (
        sum(1 for r in runs_with_doc_info if r.doc_hit) / len(runs_with_doc_info)
        if runs_with_doc_info else None
    )

    # Fallback rate
    fallback_rate = (
        sum(1 for r in run_telemetries if r.fallback_used) / total
        if total > 0 else None
    )

    # Writeback success rate — prefer MetricsEvents when available
    wb_success_rate: Optional[float] = None
    if metrics_events:
        wb_success_count = sum(1 for e in metrics_events if e.event_type == "writeback_success")
        wb_failed_count = sum(1 for e in metrics_events if e.event_type == "writeback_failed")
        wb_total = wb_success_count + wb_failed_count
        if wb_total > 0:
            wb_success_rate = wb_success_count / wb_total
    else:
        wb_attempted = [r for r in run_telemetries if r.writeback_attempted]
        if wb_attempted:
            wb_succeeded = sum(1 for r in wb_attempted if r.writeback_success is True)
            wb_success_rate = wb_succeeded / len(wb_attempted)

    # Model mix
    model_counter: Counter[str] = Counter()
    for r in run_telemetries:
        if r.model:
            model_counter[r.model] += 1
    model_mix = [{"model": m, "count": c} for m, c in model_counter.most_common()]

    # Top classification paths
    fb_map = feedback_map or {}
    path_data: dict[str, list[RunTelemetry]] = defaultdict(list)
    for r in run_telemetries:
        path = r.classification_path or "(none)"
        path_data[path].append(r)

    top_paths = []
    for path, path_runs in sorted(path_data.items(), key=lambda x: -len(x[1]))[:10]:
        count = len(path_runs)
        # Success rate: prefer feedback outcome, else infer from status
        successes = 0
        rated = 0
        for r in path_runs:
            fb = fb_map.get(r.run_id)
            if fb:
                rated += 1
                if fb.outcome == "success":
                    successes += 1
            else:
                rated += 1
                if r.status in ("completed", "fallback_completed"):
                    successes += 1
        sr = successes / rated if rated > 0 else None
        confs = [r.confidence for r in path_runs if r.confidence is not None]
        ac = sum(confs) / len(confs) if confs else None
        top_paths.append({
            "path": path,
            "count": count,
            "success_rate": sr,
            "avg_confidence": ac,
        })

    # Model latency avg (from skill-level model_latency_ms)
    latencies: list[int] = []
    for r in run_telemetries:
        for s in r.skills:
            if s.model_latency_ms is not None:
                latencies.append(s.model_latency_ms)
    model_latency_avg = sum(latencies) / len(latencies) if latencies else None

    # Confidence vs outcome matrix
    fb_map = feedback_map or {}
    hi_conf_pos = 0
    hi_conf_neg = 0
    lo_conf_pos = 0
    lo_conf_neg = 0
    matrix_total = 0
    for r in run_telemetries:
        if r.confidence is None:
            continue
        matrix_total += 1
        high = r.confidence >= 0.7
        fb = fb_map.get(r.run_id)
        if fb:
            positive = fb.outcome == "success"
        else:
            positive = r.status in ("completed", "fallback_completed")
        if high and positive:
            hi_conf_pos += 1
        elif high and not positive:
            hi_conf_neg += 1
        elif not high and positive:
            lo_conf_pos += 1
        else:
            lo_conf_neg += 1

    def _pct(n: int) -> Optional[float]:
        return n / matrix_total if matrix_total > 0 else None

    confidence_outcome_matrix = [
        {"label": "high_confidence_positive", "count": hi_conf_pos, "rate": _pct(hi_conf_pos)},
        {"label": "high_confidence_negative", "count": hi_conf_neg, "rate": _pct(hi_conf_neg)},
        {"label": "low_confidence_positive", "count": lo_conf_pos, "rate": _pct(lo_conf_pos)},
        {"label": "low_confidence_negative", "count": lo_conf_neg, "rate": _pct(lo_conf_neg)},
    ]

    return ObservabilitySummaryResponse(
        total_runs=total,
        completed_runs=completed,
        failed_runs=failed,
        runs_last_7d=last_7d,
        runs_last_30d=last_30d,
        avg_duration_ms=avg_duration,
        p95_duration_ms=p95_duration,
        avg_confidence=avg_confidence,
        doc_hit_rate=doc_hit_rate,
        fallback_rate=fallback_rate,
        writeback_success_rate=wb_success_rate,
        model_latency_avg=model_latency_avg,
        model_mix=model_mix,
        top_classification_paths=top_paths,
        confidence_outcome_matrix=confidence_outcome_matrix,
    )


def compute_trends(
    run_telemetries: list[RunTelemetry],
    window_days: int,
    feedback_map: Optional[dict[str, FeedbackEvent]] = None,
) -> list[ObservabilityTrendPoint]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=window_days)
    fb_map = feedback_map or {}

    filtered = [r for r in run_telemetries if r.started_at >= cutoff]

    # Group by date
    by_date: dict[str, list[RunTelemetry]] = defaultdict(list)
    for r in filtered:
        day = r.started_at.strftime("%Y-%m-%d")
        by_date[day].append(r)

    # Generate all days in window
    points: list[ObservabilityTrendPoint] = []
    for i in range(window_days):
        day = (cutoff + timedelta(days=i + 1)).strftime("%Y-%m-%d")
        day_runs = by_date.get(day, [])
        count = len(day_runs)

        if count == 0:
            points.append(ObservabilityTrendPoint(date=day, runs=0))
            continue

        # Success rate
        successes = 0
        for r in day_runs:
            fb = fb_map.get(r.run_id)
            if fb:
                if fb.outcome == "success":
                    successes += 1
            elif r.status in ("completed", "fallback_completed"):
                successes += 1
        sr = successes / count

        confs = [r.confidence for r in day_runs if r.confidence is not None]
        ac = sum(confs) / len(confs) if confs else None

        fb_count = sum(1 for r in day_runs if r.fallback_used)
        fr = fb_count / count

        doc_runs = [r for r in day_runs if r.doc_hit is not None]
        dhr = sum(1 for r in doc_runs if r.doc_hit) / len(doc_runs) if doc_runs else None

        durs = [r.duration_ms for r in day_runs if r.duration_ms is not None]
        ad = sum(durs) / len(durs) if durs else None

        points.append(ObservabilityTrendPoint(
            date=day,
            runs=count,
            success_rate=sr,
            avg_confidence=ac,
            fallback_rate=fr,
            doc_hit_rate=dhr,
            avg_duration_ms=ad,
        ))

    return points
