from __future__ import annotations

import asyncio
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

from models import AgentEvent, AgentRun, MetricsEvent, WorkObject
from services.claude_client import ClaudeClientError, synthesize_from_docs, synthesize_resolution
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
    allow_writeback: bool = True,
    llm_config_store: Any = None,
    llm_assignment_store: Any = None,
) -> None:
    """Execute the skill chain for a run. Updates run status and emits events."""

    # Read injection / slow-down config once
    slow_down_ms = int(os.environ.get("SLOW_DOWN_MS", "0"))
    slow_down_s = slow_down_ms / 1000 if slow_down_ms > 0 else 0

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

    async def _injected_delay() -> None:
        if slow_down_s > 0:
            await asyncio.sleep(slow_down_s)

    await run_store.update_run(run_id, status="running")

    try:
        # --- Skill A: ValidateInput ---
        await emit_metric("skill_started", skill_name="ValidateInput")
        await emit("ValidateInput", "thinking", "Validating tenant and configuration...")
        await _injected_delay()

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

        # --- Skill B: RetrieveDocs (classification-based folder navigation) ---
        await emit_metric("skill_started", skill_name="RetrieveDocs")
        await emit("RetrieveDocs", "thinking", "Locating classification folder...")
        await _injected_delay()

        root_folder_id = drive_config.root_folder_id
        sources: list[dict[str, str]] = []
        doc_count = 0
        classification_folder_id: str | None = None

        if not access_token:
            # No OAuth token available (e.g. preview from ServiceNow popup)
            await emit(
                "RetrieveDocs",
                "complete",
                "No Google OAuth token — skipping Drive search. Resolution will use incident context only.",
                metadata={"doc_count": 0, "sources": []},
            )
            await emit_metric("skill_completed", skill_name="RetrieveDocs", metadata={"status": "completed", "doc_count": 0, "skipped": True})
        else:
          try:
            # Navigate: root -> AgenticKnowledge -> {tenant_id} -> dimensions -> {Category} -> {Subcategory}
            ak = await drive_provider.ensure_folder(
                access_token, "AgenticKnowledge", root_folder_id
            )
            tenant_folder = await drive_provider.ensure_folder(
                access_token, tenant_id, ak["id"]  # type: ignore[arg-type]
            )
            dims_folder = await drive_provider.ensure_folder(
                access_token, "dimensions", tenant_folder["id"]  # type: ignore[arg-type]
            )

            # Walk down classification path: e.g. ["Network", "VPN"]
            classification_values = [p.value for p in work_object.classification if p.value]
            search_folder_id: str = dims_folder["id"]  # type: ignore[assignment]

            if classification_values:
                await emit(
                    "RetrieveDocs",
                    "retrieval",
                    f"Navigating classification path: {' > '.join(classification_values)}",
                    metadata={"classification_path": classification_values},
                )
                for segment in classification_values:
                    try:
                        child = await drive_provider.ensure_folder(
                            access_token, segment, search_folder_id
                        )
                        search_folder_id = child["id"]  # type: ignore[assignment]
                    except GoogleDriveError:
                        # Folder doesn't exist at this level — search from parent
                        break

            classification_folder_id = search_folder_id

            # Tokenize work object for search
            tokens = _tokenize(work_object)

            await emit(
                "RetrieveDocs",
                "retrieval",
                f"Searching classification folder with {len(tokens)} search tokens...",
                metadata={"tokens": tokens, "folder_id": search_folder_id},
            )

            if tokens:
                await emit_metric("tool_called", skill_name="RetrieveDocs", metadata={"tool": "drive_search"})
                found = await drive_provider.search_documents(
                    access_token, search_folder_id, tokens, limit=10
                )
                sources = found
                doc_count = len(found)

            await emit(
                "RetrieveDocs",
                "complete",
                f"Found {doc_count} document(s) in classification folder.",
                metadata={"doc_count": doc_count, "sources": sources, "classification_folder_id": classification_folder_id},
            )
            await emit_metric("skill_completed", skill_name="RetrieveDocs", metadata={"status": "completed", "doc_count": doc_count})
          except GoogleDriveError as exc:
            injected = getattr(exc, "injected", False)
            await emit(
                "RetrieveDocs",
                "error",
                f"Drive search failed: {exc}" + (" [INJECTED]" if injected else ""),
            )
            fail_meta: dict[str, Any] = {"error": str(exc)}
            if injected:
                fail_meta["injected"] = True
            await emit_metric("tool_failed", skill_name="RetrieveDocs", metadata=fail_meta)
            await emit_metric("skill_completed", skill_name="RetrieveDocs", metadata={"status": "failed"})
            # Continue with zero docs instead of failing the whole run

        await asyncio.sleep(0.3)

        # --- Skill C: SynthesizeResolution (dual KB + LLM) ---
        await emit_metric("skill_started", skill_name="SynthesizeResolution")
        await emit(
            "SynthesizeResolution",
            "thinking",
            "Synthesizing resolution from available sources...",
        )
        await _injected_delay()

        classification_pairs = [
            {"name": p.name, "value": p.value} for p in work_object.classification
        ]
        used_fallback = False

        # Load active LLM config for this tenant via assignment lookup
        llm_kwargs: dict[str, str] = {}
        has_llm = False
        if llm_assignment_store is not None and llm_config_store is not None:
            assignment = await llm_assignment_store.get_active(tenant_id)
            if assignment is not None:
                llm_config = await llm_config_store.get(assignment.llm_config_id)
                if llm_config is not None:
                    llm_kwargs = {
                        "provider": llm_config.provider,
                        "api_key": llm_config.api_key,
                        "model": llm_config.model,
                    }
                    has_llm = True

        # Also check env fallback
        if not has_llm:
            import os as _os
            if _os.environ.get("CLAUDE_API_KEY"):
                has_llm = True

        # Determine synthesis mode
        kb_answer: dict[str, Any] | None = None
        llm_answer: dict[str, Any] | None = None
        synthesis_mode: str = "single"

        if doc_count > 0 and has_llm:
            # DUAL mode: KB answer + LLM answer
            synthesis_mode = "dual"
            await emit(
                "SynthesizeResolution",
                "tool_call",
                "Calling dual LLM synthesis (KB + pure LLM)...",
                metadata={"doc_count": doc_count, "mode": "dual"},
            )
            await emit_metric("tool_called", skill_name="SynthesizeResolution", metadata={"tool": "llm_synthesis", "mode": "dual"})

            try:
                kb_result = await synthesize_from_docs(
                    title=work_object.title,
                    description=work_object.description,
                    classification=classification_pairs,
                    sources=sources,
                    **llm_kwargs,
                )
                kb_answer = {
                    "summary": kb_result["summary"],
                    "steps": kb_result["recommended_steps"],
                    "sources": kb_result["sources"],
                    "confidence": kb_result["confidence"],
                }
                kb_meta = kb_result.get("_meta", {})
                await emit(
                    "SynthesizeResolution",
                    "tool_result",
                    f"KB synthesis complete (confidence: {kb_result['confidence']:.0%}).",
                    confidence=kb_result["confidence"],
                    metadata={"answer_type": "kb", "model": kb_meta.get("model"), "latency_ms": kb_meta.get("latency_ms")},
                )
            except ClaudeClientError as exc:
                await emit("SynthesizeResolution", "error", f"KB synthesis failed: {exc}")
                # Fall through — kb_answer stays None, we still try LLM

            try:
                llm_result = await synthesize_resolution(
                    title=work_object.title,
                    description=work_object.description,
                    classification=classification_pairs,
                    sources=sources,
                    include_sources=False,
                    **llm_kwargs,
                )
                llm_answer = {
                    "summary": llm_result["summary"],
                    "steps": llm_result["recommended_steps"],
                    "sources": llm_result["sources"],
                    "confidence": llm_result["confidence"],
                }
                llm_meta = llm_result.get("_meta", {})
                await emit(
                    "SynthesizeResolution",
                    "tool_result",
                    f"LLM synthesis complete (confidence: {llm_result['confidence']:.0%}).",
                    confidence=llm_result["confidence"],
                    metadata={"answer_type": "llm", "model": llm_meta.get("model"), "latency_ms": llm_meta.get("latency_ms")},
                )
            except ClaudeClientError as exc:
                await emit("SynthesizeResolution", "error", f"LLM synthesis failed: {exc}")
                # Fall through — llm_answer stays None

            # If both failed, fall back to deterministic
            if kb_answer is None and llm_answer is None:
                synthesis_mode = "single"
                used_fallback = True
            elif kb_answer is None:
                # Only LLM succeeded
                synthesis_mode = "single"
            elif llm_answer is None:
                # Only KB succeeded
                synthesis_mode = "single"

        elif has_llm:
            # No docs — LLM only
            try:
                await emit(
                    "SynthesizeResolution",
                    "tool_call",
                    "Calling LLM synthesis (no KB docs available)...",
                    metadata={"doc_count": 0, "mode": "llm_only"},
                )
                await emit_metric("tool_called", skill_name="SynthesizeResolution", metadata={"tool": "llm_synthesis", "mode": "llm_only"})

                llm_result = await synthesize_resolution(
                    title=work_object.title,
                    description=work_object.description,
                    classification=classification_pairs,
                    sources=sources,
                    include_sources=False,
                    **llm_kwargs,
                )
                llm_answer = {
                    "summary": llm_result["summary"],
                    "steps": llm_result["recommended_steps"],
                    "sources": llm_result["sources"],
                    "confidence": llm_result["confidence"],
                }
                llm_meta = llm_result.get("_meta", {})
                await emit(
                    "SynthesizeResolution",
                    "tool_result",
                    f"LLM synthesis complete (confidence: {llm_result['confidence']:.0%}).",
                    confidence=llm_result["confidence"],
                    metadata={"model": llm_meta.get("model"), "latency_ms": llm_meta.get("latency_ms")},
                )
            except ClaudeClientError as exc:
                injected = getattr(exc, "injected", False)
                used_fallback = True
                await emit(
                    "SynthesizeResolution",
                    "error",
                    f"Claude unavailable, using fallback: {exc}" + (" [INJECTED]" if injected else ""),
                )
                fail_meta_claude: dict[str, Any] = {"error": str(exc), "fallback": True}
                if injected:
                    fail_meta_claude["injected"] = True
                await emit_metric("tool_failed", skill_name="SynthesizeResolution", metadata=fail_meta_claude)

        elif doc_count > 0:
            # No LLM but docs exist — deterministic KB-only
            kb_answer = {
                "summary": (
                    f"Based on analysis of '{work_object.title}', "
                    f"{doc_count} relevant document(s) were found in the knowledge base. "
                    "Review the linked sources for detailed guidance."
                ),
                "steps": _build_steps(work_object, sources),
                "sources": [{"title": s["name"], "url": s.get("webViewLink", "")} for s in sources],
                "confidence": 0.55,
            }

        # Build fallback if nothing produced
        if kb_answer is None and llm_answer is None:
            used_fallback = True
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
            llm_answer = {
                "summary": summary_text,
                "steps": _build_steps(work_object, sources),
                "sources": [{"title": s["name"], "url": s.get("webViewLink", "")} for s in sources],
                "confidence": confidence,
            }

        # Compute top-level confidence for events/status
        if synthesis_mode == "dual" and kb_answer and llm_answer:
            confidence = max(kb_answer["confidence"], llm_answer["confidence"])
        elif kb_answer:
            confidence = kb_answer["confidence"]
        elif llm_answer:
            confidence = llm_answer["confidence"]
        else:
            confidence = 0.2

        await emit(
            "SynthesizeResolution",
            "complete",
            f"Synthesized resolution ({synthesis_mode} mode, confidence: {confidence:.0%})."
            + (" [fallback]" if used_fallback else ""),
            confidence=confidence,
            metadata={"mode": synthesis_mode, "fallback": used_fallback},
        )
        await emit_metric("skill_completed", skill_name="SynthesizeResolution", metadata={"status": "completed", "fallback": used_fallback, "mode": synthesis_mode})

        await asyncio.sleep(0.3)

        # Determine if writeback will happen (before RecordOutcome)
        snow_config = None
        if allow_writeback and work_object.source_system == "servicenow" and snow_config_store is not None:
            snow_config = await snow_config_store.get_by_tenant(tenant_id)
        will_writeback = snow_config is not None

        # Determine terminal status
        terminal_status = "fallback_completed" if used_fallback else "completed"

        # --- Skill D: RecordOutcome ---
        await emit_metric("skill_started", skill_name="RecordOutcome")
        await emit("RecordOutcome", "thinking", "Recording run outcome...")
        await _injected_delay()

        # Build result with new dual-answer shape
        if synthesis_mode == "dual" and kb_answer and llm_answer:
            result: dict[str, Any] = {
                "mode": "dual",
                "kb_answer": kb_answer,
                "llm_answer": llm_answer,
                "selected": None,
                "classification_folder_id": classification_folder_id,
                # Top-level fields for backward compat
                "summary": kb_answer["summary"],
                "steps": kb_answer["steps"],
                "sources": kb_answer["sources"],
                "confidence": confidence,
            }
        elif kb_answer:
            result = {
                "mode": "single",
                "kb_answer": kb_answer,
                "selected": "kb",
                "classification_folder_id": classification_folder_id,
                "summary": kb_answer["summary"],
                "steps": kb_answer["steps"],
                "sources": kb_answer["sources"],
                "confidence": kb_answer["confidence"],
            }
        else:
            answer = llm_answer or {"summary": "", "steps": [], "sources": [], "confidence": 0.2}
            result = {
                "mode": "single",
                "llm_answer": answer,
                "selected": "llm",
                "classification_folder_id": classification_folder_id,
                "summary": answer["summary"],
                "steps": answer["steps"],
                "sources": answer["sources"],
                "confidence": answer["confidence"],
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

            # If dual mode and no selection yet, skip writeback (deferred until user selects)
            if result.get("mode") == "dual" and result.get("selected") is None:
                await emit("Writeback", "complete", "Writeback deferred — waiting for user to select an answer.", confidence=confidence)
                await run_store.update_run(
                    run_id,
                    status=terminal_status,
                    completed_at=datetime.now(timezone.utc),
                )
                await emit_metric("skill_completed", skill_name="Writeback", metadata={"status": "deferred"})
            else:
                await emit("Writeback", "thinking", "Writing resolution back to ServiceNow...")
                await _injected_delay()

                # Pick the selected answer for writeback
                selected = result.get("selected", "llm")
                wb_answer = result.get(f"{selected}_answer") or result
                summary_text = wb_answer.get("summary", "")
                steps = wb_answer.get("steps", [])
                result_sources = wb_answer.get("sources", [])

                writeback_error: str | None = None
                writeback_http_status: int | None = None
                writeback_injected: bool = False
                sys_id = (work_object.metadata or {}).get("sys_id", "")
                try:
                    notes = format_work_notes(
                        summary_text, steps, result_sources, confidence, run_id
                    )
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
                        tenant_id=tenant_id,
                    )
                except ServiceNowError as exc:
                    writeback_error = str(exc)
                    writeback_http_status = exc.status_code
                    writeback_injected = getattr(exc, "injected", False)
                    fail_meta_wb: dict[str, Any] = {"error": str(exc)}
                    if writeback_injected:
                        fail_meta_wb["injected"] = True
                    await emit_metric("tool_failed", skill_name="Writeback", metadata=fail_meta_wb)
                except Exception as exc:
                    writeback_error = str(exc)
                    await emit_metric("tool_failed", skill_name="Writeback", metadata={"error": str(exc)})

                if writeback_error is None:
                    await run_store.update_run(
                        run_id,
                        status=terminal_status,
                        completed_at=datetime.now(timezone.utc),
                    )
                    await emit("Writeback", "tool_result", "Work notes updated in ServiceNow.")
                    await emit("Writeback", "complete", "Resolution written back to ServiceNow.", confidence=confidence)
                    await emit_metric("skill_completed", skill_name="Writeback", metadata={"status": "completed"})
                    await emit_metric("writeback_success", skill_name="Writeback", metadata={"sys_id": sys_id, "tenant_id": tenant_id})
                else:
                    await run_store.update_run(
                        run_id,
                        status="failed",
                        completed_at=datetime.now(timezone.utc),
                    )
                    await emit(
                        "Writeback",
                        "error",
                        f"ServiceNow writeback failed: {writeback_error}"
                        + (" [INJECTED]" if writeback_injected else ""),
                    )
                    await emit_metric("skill_completed", skill_name="Writeback", metadata={"status": "failed"})
                    wb_failed_meta: dict[str, Any] = {
                        "sys_id": sys_id,
                        "tenant_id": tenant_id,
                        "http_status": writeback_http_status,
                        "error_message": writeback_error,
                    }
                    if writeback_injected:
                        wb_failed_meta["injected"] = True
                    await emit_metric("writeback_failed", skill_name="Writeback", metadata=wb_failed_meta)
                    terminal_status = "failed"

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
