"""Multi-agent orchestrator for video genome extraction."""

import asyncio
import logging
import time
from typing import Callable, Optional

from services.video_agents.frame_intelligence import extract_frames_adaptive
from services.video_agents.audio_speech import (
    extract_and_transcribe,
    correlate_transcript_to_frames,
)
from services.video_agents.ui_extraction import analyze_screens
from services.video_agents.app_structure import analyze_structure
from services.video_agents.synthesis_validation import synthesize_and_validate

logger = logging.getLogger(__name__)


async def run_video_extraction_pipeline(
    video_path: str,
    llm_config: dict,
    *,
    max_tokens: int = 16384,
    user_notes: str = "",
    on_progress: Optional[Callable] = None,
) -> dict:
    """Run the full 5-agent extraction pipeline.

    on_progress callback signature: async (agent_name, status, data) -> None

    Returns the final merged genome dict with metadata.
    """
    t0 = time.monotonic()

    async def progress(agent: str, status: str, data: dict | None = None):
        if on_progress:
            await on_progress(agent, status, data or {})

    # ═══════════════════════════════════════════════════════════════
    # Stage 1: Frame Intelligence (must run first)
    # ═══════════════════════════════════════════════════════════════
    await progress("frame_intelligence", "running")
    t1 = time.monotonic()
    try:
        frames = await extract_frames_adaptive(video_path)
    except Exception as exc:
        logger.error("[orchestrator] Frame extraction failed: %s", exc)
        await progress("frame_intelligence", "error", {"error": str(exc)})
        return {"status": "error", "error": f"Frame extraction failed: {exc}"}

    frame_ms = int((time.monotonic() - t1) * 1000)
    await progress("frame_intelligence", "done", {
        "frame_count": len(frames),
        "unique_screens": len(frames),
        "latency_ms": frame_ms,
    })

    if not frames:
        return {"status": "error", "error": "No frames could be extracted from the video"}

    # ═══════════════════════════════════════════════════════════════
    # Stage 2: UI Extraction + Audio/Speech (run in PARALLEL)
    # ═══════════════════════════════════════════════════════════════
    await progress("ui_extraction", "running")
    await progress("audio_speech", "running")

    t2 = time.monotonic()
    ui_task = analyze_screens(frames, llm_config=llm_config, max_tokens=max_tokens)
    audio_task = extract_and_transcribe(video_path)

    ui_analyses, transcript = await asyncio.gather(ui_task, audio_task)

    stage2_ms = int((time.monotonic() - t2) * 1000)

    await progress("ui_extraction", "done", {
        "screens_analyzed": len(ui_analyses),
        "latency_ms": stage2_ms,
    })
    await progress("audio_speech", "done", {
        "has_audio": transcript.has_audio,
        "segments": len(transcript.segments),
        "duration_sec": transcript.duration_sec,
        "latency_ms": stage2_ms,
    })

    # Correlate transcript to frames
    frame_timestamps = [f.timestamp_sec for f in frames]
    correlations = correlate_transcript_to_frames(transcript, frame_timestamps)

    # ═══════════════════════════════════════════════════════════════
    # Stage 3: Application Structure (depends on stages 1+2)
    # ═══════════════════════════════════════════════════════════════
    await progress("app_structure", "running")
    t3 = time.monotonic()

    app_structure = await analyze_structure(
        ui_analyses,
        transcript.full_text,
        correlations,
        llm_config=llm_config,
        max_tokens=max_tokens,
    )

    stage3_ms = int((time.monotonic() - t3) * 1000)
    await progress("app_structure", "done", {
        "objects": len(app_structure.objects),
        "fields": len(app_structure.fields),
        "workflows": len(app_structure.workflows),
        "relationships": len(app_structure.relationships),
        "latency_ms": stage3_ms,
    })

    # ═══════════════════════════════════════════════════════════════
    # Stage 4: Synthesis & Validation (depends on stage 3)
    # ═══════════════════════════════════════════════════════════════
    await progress("synthesis", "running")
    t4 = time.monotonic()

    synthesis = await synthesize_and_validate(
        app_structure,
        ui_analyses,
        transcript.full_text,
        llm_config=llm_config,
        max_tokens=max_tokens,
    )

    stage4_ms = int((time.monotonic() - t4) * 1000)
    await progress("synthesis", "done", {
        "confidence": synthesis.confidence,
        "validation_notes": len(synthesis.validation_notes),
        "latency_ms": stage4_ms,
    })

    total_ms = int((time.monotonic() - t0) * 1000)

    # Build final result
    genome = synthesis.genome
    genome["_extraction_metadata"] = {
        "pipeline": "multi-agent-v1",
        "frame_count": len(frames),
        "unique_screens": len(frames),
        "has_audio": transcript.has_audio,
        "audio_duration_sec": transcript.duration_sec,
        "total_latency_ms": total_ms,
        "stage_latencies": {
            "frame_intelligence": frame_ms,
            "ui_extraction_and_audio": stage2_ms,
            "app_structure": stage3_ms,
            "synthesis": stage4_ms,
        },
        "user_notes": user_notes,
    }

    result = {
        "status": "ok",
        "genome": genome,
        "ui_analysis": [
            {
                "screen_index": ua.screen_index,
                "screen_description": ua.screen_description,
                "components": ua.components,
                "color_palette": ua.color_palette,
                "typography": ua.typography,
                "layout": ua.layout,
                "html_skeleton": ua.html_skeleton,
                "text_labels": ua.text_labels,
                "data_elements": ua.data_elements,
                "interactive_elements": ua.interactive_elements,
            }
            for ua in ui_analyses
        ],
        "audio_transcript": {
            "full_text": transcript.full_text,
            "segments": [
                {"start": s.start, "end": s.end, "text": s.text}
                for s in transcript.segments
            ],
            "has_audio": transcript.has_audio,
            "duration_sec": transcript.duration_sec,
        },
        "design_tokens": synthesis.design_tokens,
        "validation_notes": synthesis.validation_notes,
        "frame_count": len(frames),
        "unique_screens": len(frames),
        "latency_ms": total_ms,
    }

    return result
