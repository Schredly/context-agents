from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

from models import AgentEvent, AgentRun, WorkObject
from services.google_drive import GoogleDriveError, GoogleDriveProvider
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

    await run_store.update_run(run_id, status="running")

    try:
        # --- Skill A: ValidateInput ---
        await emit("ValidateInput", "thinking", "Validating tenant and configuration...")

        tenant = await tenant_store.get(tenant_id)
        if tenant is None:
            await emit("ValidateInput", "error", "Tenant not found.")
            await run_store.update_run(
                run_id, status="failed", completed_at=datetime.now(timezone.utc)
            )
            return

        if tenant.status != "active":
            await emit(
                "ValidateInput",
                "error",
                f"Tenant is '{tenant.status}' — must be 'active' to run.",
            )
            await run_store.update_run(
                run_id, status="failed", completed_at=datetime.now(timezone.utc)
            )
            return

        drive_config = await drive_config_store.get_by_tenant(tenant_id)
        if drive_config is None or not drive_config.root_folder_id:
            await emit(
                "ValidateInput",
                "error",
                "No Google Drive config found. Complete the setup wizard first.",
            )
            await run_store.update_run(
                run_id, status="failed", completed_at=datetime.now(timezone.utc)
            )
            return

        await emit(
            "ValidateInput",
            "complete",
            f"Tenant '{tenant.name}' is active with Drive folder configured.",
            confidence=1.0,
        )

        # Small delay so WS clients can see each step
        await asyncio.sleep(0.3)

        # --- Skill B: RetrieveDocs ---
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
        except GoogleDriveError as exc:
            await emit(
                "RetrieveDocs",
                "error",
                f"Drive search failed: {exc}",
            )
            # Continue with zero docs instead of failing the whole run

        await asyncio.sleep(0.3)

        # --- Skill C: SynthesizeResolution ---
        await emit(
            "SynthesizeResolution",
            "thinking",
            "Synthesizing resolution from available sources...",
        )

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

        await emit(
            "SynthesizeResolution",
            "complete",
            f"Synthesized resolution with {len(steps)} steps (confidence: {confidence:.0%}).",
            confidence=confidence,
            metadata={"step_count": len(steps)},
        )

        await asyncio.sleep(0.3)

        # --- Skill D: RecordOutcome ---
        await emit("RecordOutcome", "thinking", "Recording run outcome...")

        result = {
            "summary": summary_text,
            "steps": steps,
            "sources": [
                {"title": s["name"], "url": s.get("webViewLink", "")} for s in sources
            ],
            "confidence": confidence,
        }

        await run_store.update_run(
            run_id,
            status="completed",
            completed_at=datetime.now(timezone.utc),
            result=result,
        )

        await emit(
            "RecordOutcome",
            "complete",
            "Run completed and outcome recorded.",
            confidence=confidence,
        )

    except Exception as exc:
        await emit("Orchestrator", "error", f"Unexpected error: {exc}")
        await run_store.update_run(
            run_id, status="failed", completed_at=datetime.now(timezone.utc)
        )


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
