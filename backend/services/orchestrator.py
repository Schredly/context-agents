from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

from models import AgentEvent, AgentRun, MetricsEvent, WorkObject
from services.claude_client import ClaudeClientError, synthesize_resolution
from services.google_drive import GoogleDriveError, GoogleDriveProvider
from services.servicenow import ServiceNowError, format_work_notes
from store.interface import EventStore, RunStore


async def run_orchestrator(
    tenant_id: str,
    access_token: str,
    work_object: WorkObject,
    run_id: str,
    run_store: RunStore,
    event_store: EventStore,
    tenant_store: Any,
    drive_config_store: Any,
    drive_provider: GoogleDriveProvider,
    on_event: Callable[[AgentEvent], Coroutine] | None = None,
    snow_config_store: Any = None,
    snow_provider: Any = None,
    metrics_event_store: Any = None,
) -> None:
    """Execute the skill chain for a run. Updates run status and emits events."""

    async def emit(
        skill_id: str,
        event_type: str,
        summary: str,
        confidence: float | None = None,
        metadata: dict | None = None,
    ) -> AgentEvent:
        event = AgentEvent(
            run_id=run_id,
            skill_id=skill_id,
            event_type=event_type,  # type: ignore[arg-type]
            summary=summary,
            confidence=confidence,
            metadata=metadata,
        )
        await event_store.append_event(event)
        if on_event:
            await on_event(event)
        return event

    async def emit_metric(
        event_type: str,
        skill_name: str | None = None,
        metadata: dict | None = None,
    ) -> None:
        if metrics_event_store is None:
            return
        await metrics_event_store.append(MetricsEvent(
            id=f"me_{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            run_id=run_id,
            event_type=event_type,  # type: ignore[arg-type]
            skill_name=skill_name,
            metadata=metadata,
        ))

    await run_store.update_run(run_id, status="running")

    try:
        # --- Skill A: ValidateInput ---
        await emit_metric("skill_started", skill_name="ValidateInput")
        await emit("ValidateInput", "thinking", "Validating tenant and configuration...")

        tenant = await tenant_store.get(tenant_id)
        if tenant is None:
            await emit("ValidateInput", "error", "Tenant not found.")
            await emit_metric("skill_completed", skill_name="ValidateInput", metadata={"status": "failed"})
            await run_store.update_run(
                run_id, status="failed", completed_at=datetime.now(timezone.utc)
            )
            await emit_metric("run_completed", metadata={"status": "failed"})
            return

        if tenant.status != "active":
            await emit(
                "ValidateInput",
                "error",
                f"Tenant is '{tenant.status}' — must be 'active' to run.",
            )
            await emit_metric("skill_completed", skill_name="ValidateInput", metadata={"status": "failed"})
            await run_store.update_run(
                run_id, status="failed", completed_at=datetime.now(timezone.utc)
            )
            await emit_metric("run_completed", metadata={"status": "failed"})
            return

        drive_config = await drive_config_store.get_by_tenant(tenant_id)
        if drive_config is None or not drive_config.root_folder_id:
            await emit(
                "ValidateInput",
                "error",
                "No Google Drive config found. Complete the setup wizard first.",
            )
            await emit_metric("skill_completed", skill_name="ValidateInput", metadata={"status": "failed"})
            await run_store.update_run(
                run_id, status="failed", completed_at=datetime.now(timezone.utc)
            )
            await emit_metric("run_completed", metadata={"status": "failed"})
            return

        await emit(
            "ValidateInput",
            "complete",
            f"Tenant '{tenant.name}' is active with Drive folder configured.",
            confidence=1.0,
        )
        await emit_metric("skill_completed", skill_name="ValidateInput", metadata={"status": "completed"})

        # Small delay so WS clients can see each step
        await asyncio.sleep(0.3)

        # --- Skill B: RetrieveDocs ---
        await emit_metric("skill_started", skill_name="RetrieveDocs")
        await emit("RetrieveDocs", "thinking", "Locating documents folder...")

        root_folder_id = drive_config.root_folder_id
        sources: list[dict[str, str]] = []
        doc_count = 0

        try:
            # Navigate to documents folder: root -> AgenticKnowledge -> {tenant_id} -> documents
            ak = await drive_provider.ensure_folder(
                access_token, "AgenticKnowledge", root_folder_id
            )
            tenant_folder = await drive_provider.ensure_folder(
                access_token, tenant_id, ak["id"]  # type: ignore[arg-type]
            )
            docs_folder = await drive_provider.ensure_folder(
                access_token, "documents", tenant_folder["id"]  # type: ignore[arg-type]
            )

            # Tokenize work object for search
            tokens = _tokenize(work_object)

            await emit(
                "RetrieveDocs",
                "retrieval",
                f"Searching documents folder with {len(tokens)} search tokens...",
                metadata={"tokens": tokens},
            )

            if tokens:
                await emit_metric("tool_called", skill_name="RetrieveDocs", metadata={"tool": "drive_search"})
                found = await drive_provider.search_documents(
                    access_token, docs_folder["id"], tokens, limit=10  # type: ignore[arg-type]
                )
                sources = found
                doc_count = len(found)

            await emit(
                "RetrieveDocs",
                "complete",
                f"Found {doc_count} document(s) in Drive.",
                metadata={"doc_count": doc_count, "sources": sources},
            )
            await emit_metric("skill_completed", skill_name="RetrieveDocs", metadata={"status": "completed", "doc_count": doc_count})
        except GoogleDriveError as exc:
            await emit(
                "RetrieveDocs",
                "error",
                f"Drive search failed: {exc}",
            )
            await emit_metric("tool_failed", skill_name="RetrieveDocs", metadata={"error": str(exc)})
            await emit_metric("skill_completed", skill_name="RetrieveDocs", metadata={"status": "failed"})
            # Continue with zero docs instead of failing the whole run

        await asyncio.sleep(0.3)

        # --- Skill C: SynthesizeResolution ---
        await emit_metric("skill_started", skill_name="SynthesizeResolution")
        await emit(
            "SynthesizeResolution",
            "thinking",
            "Synthesizing resolution from available sources...",
        )

        classification_pairs = [
            {"name": p.name, "value": p.value} for p in work_object.classification
        ]
        used_fallback = False

        try:
            await emit(
                "SynthesizeResolution",
                "tool_call",
                "Calling Claude synthesis...",
                metadata={"doc_count": doc_count},
            )
            await emit_metric("tool_called", skill_name="SynthesizeResolution", metadata={"tool": "claude_synthesis"})

            claude_result = await synthesize_resolution(
                title=work_object.title,
                description=work_object.description,
                classification=classification_pairs,
                sources=sources,
            )

            summary_text = claude_result["summary"]
            steps = claude_result["recommended_steps"]
            result_sources = claude_result["sources"]
            confidence = claude_result["confidence"]

            meta = claude_result.get("_meta", {})
            await emit(
                "SynthesizeResolution",
                "tool_result",
                f"Claude synthesis complete (confidence: {confidence:.0%}).",
                confidence=confidence,
                metadata={
                    "model": meta.get("model"),
                    "latency_ms": meta.get("latency_ms"),
                    "input_tokens": meta.get("input_tokens"),
                    "output_tokens": meta.get("output_tokens"),
                    "doc_count": doc_count,
                },
            )

        except ClaudeClientError as exc:
            used_fallback = True
            await emit(
                "SynthesizeResolution",
                "error",
                f"Claude unavailable, using fallback: {exc}",
            )
            await emit_metric("tool_failed", skill_name="SynthesizeResolution", metadata={"error": str(exc), "fallback": True})

            # Deterministic fallback
            confidence = 0.55 if doc_count > 0 else 0.2
            summary_text = (
                f"Based on analysis of '{work_object.title}', "
                f"{doc_count} relevant document(s) were found in the knowledge base. "
            )
            if doc_count > 0:
                summary_text += (
                    "The documents provide context that can help resolve this issue. "
                    "Review the linked sources for detailed guidance."
                )
            else:
                summary_text += (
                    "No matching documents were found. Consider adding relevant "
                    "documentation to the knowledge base for future reference."
                )
            steps = _build_steps(work_object, sources)
            result_sources = [
                {"title": s["name"], "url": s.get("webViewLink", "")}
                for s in sources
            ]

        await emit(
            "SynthesizeResolution",
            "complete",
            f"Synthesized resolution with {len(steps)} steps (confidence: {confidence:.0%})."
            + (" [fallback]" if used_fallback else ""),
            confidence=confidence,
            metadata={"step_count": len(steps), "fallback": used_fallback},
        )
        await emit_metric("skill_completed", skill_name="SynthesizeResolution", metadata={"status": "completed", "fallback": used_fallback})

        await asyncio.sleep(0.3)

        # Determine if writeback will happen (before RecordOutcome)
        snow_config = None
        if work_object.source_system == "servicenow" and snow_config_store is not None:
            snow_config = await snow_config_store.get_by_tenant(tenant_id)
        will_writeback = snow_config is not None

        # Determine terminal status
        terminal_status = "fallback_completed" if used_fallback else "completed"

        # --- Skill D: RecordOutcome ---
        await emit_metric("skill_started", skill_name="RecordOutcome")
        await emit("RecordOutcome", "thinking", "Recording run outcome...")

        result = {
            "summary": summary_text,
            "steps": steps,
            "sources": result_sources,
            "confidence": confidence,
        }

        if will_writeback:
            # Store result but defer status — Writeback still needs to run
            await run_store.update_run(run_id, result=result)
        else:
            await run_store.update_run(
                run_id,
                status=terminal_status,
                completed_at=datetime.now(timezone.utc),
                result=result,
            )

        await emit(
            "RecordOutcome",
            "complete",
            "Run completed and outcome recorded.",
            confidence=confidence,
        )
        await emit_metric("skill_completed", skill_name="RecordOutcome", metadata={"status": "completed"})

        # --- Skill E: Writeback (conditional — ServiceNow only) ---
        if will_writeback:
            await asyncio.sleep(0.3)
            await emit_metric("skill_started", skill_name="Writeback")
            await emit("Writeback", "thinking", "Writing resolution back to ServiceNow...")

            writeback_error: str | None = None
            try:
                notes = format_work_notes(
                    summary_text, steps, result_sources, confidence, run_id
                )
                sys_id = (work_object.metadata or {}).get("sys_id", "")
                await emit(
                    "Writeback",
                    "tool_call",
                    f"Patching incident {sys_id} with work notes...",
                    metadata={"sys_id": sys_id},
                )
                await emit_metric("tool_called", skill_name="Writeback", metadata={"tool": "servicenow_patch", "sys_id": sys_id})
                await snow_provider.update_work_notes(
                    instance_url=snow_config.instance_url,
                    username=snow_config.username,
                    password=snow_config.password,
                    sys_id=sys_id,
                    work_notes=notes,
                )
            except ServiceNowError as exc:
                writeback_error = str(exc)
                await emit_metric("tool_failed", skill_name="Writeback", metadata={"error": str(exc)})
            except Exception as exc:
                writeback_error = str(exc)
                await emit_metric("tool_failed", skill_name="Writeback", metadata={"error": str(exc)})

            # Set terminal status BEFORE emitting the terminal event
            await run_store.update_run(
                run_id,
                status=terminal_status,
                completed_at=datetime.now(timezone.utc),
            )

            if writeback_error is None:
                await emit(
                    "Writeback",
                    "tool_result",
                    "Work notes updated in ServiceNow.",
                )
                await emit(
                    "Writeback",
                    "complete",
                    "Resolution written back to ServiceNow.",
                    confidence=confidence,
                )
                await emit_metric("skill_completed", skill_name="Writeback", metadata={"status": "completed"})
            else:
                await emit(
                    "Writeback",
                    "error",
                    f"ServiceNow writeback failed: {writeback_error}",
                )
                await emit_metric("skill_completed", skill_name="Writeback", metadata={"status": "failed"})

        # Emit run_completed metric
        await emit_metric("run_completed", metadata={"status": terminal_status, "fallback": used_fallback, "confidence": confidence})

    except Exception as exc:
        await emit("Orchestrator", "error", f"Unexpected error: {exc}")
        await run_store.update_run(
            run_id, status="failed", completed_at=datetime.now(timezone.utc)
        )
        await emit_metric("run_completed", metadata={"status": "failed", "error": str(exc)})


def _tokenize(work_object: WorkObject) -> list[str]:
    """Extract search tokens from the work object."""
    text = f"{work_object.title} {work_object.description}"
    for pair in work_object.classification:
        text += f" {pair.value}"
    # Split, lowercase, dedupe, strip short words
    words = re.findall(r"[a-zA-Z0-9]{3,}", text.lower())
    stop = {"the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
            "her", "was", "one", "our", "out", "has", "have", "from", "this", "that",
            "with", "they", "been", "said", "each", "which", "their", "will", "other"}
    seen: set[str] = set()
    tokens: list[str] = []
    for w in words:
        if w not in stop and w not in seen:
            seen.add(w)
            tokens.append(w)
        if len(tokens) >= 12:
            break
    return tokens


def _build_steps(work_object: WorkObject, sources: list[dict]) -> list[str]:
    """Build deterministic resolution steps."""
    steps = [
        f"Review the details of '{work_object.title}'.",
        "Check if this issue has been reported before.",
    ]
    if sources:
        steps.append(f"Review {len(sources)} source document(s) linked below.")
        if len(sources) >= 3:
            steps.append("Cross-reference multiple sources for consistent guidance.")
    steps.append("Apply the recommended resolution steps.")
    steps.append("Verify the issue is resolved and update the ticket.")
    return steps
