"""Video Genome API — upload video, extract genome via multi-agent pipeline, commit to GitHub."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/video-genome", tags=["video-genome"])

TENANT = "acme"
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploaded_videos")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Re-use the _extract_json helper from genome_studio
from routers.genome_studio import _extract_json


async def _track_usage(skill: str, model: str, meta: dict, app, latency_ms: int = 0) -> None:
    from models import LLMUsageEvent, calculate_llm_cost
    input_tokens = meta.get("input_tokens") or 0
    output_tokens = meta.get("output_tokens") or 0
    cost = calculate_llm_cost(model, input_tokens, output_tokens)
    await app.state.llm_usage_store.create(LLMUsageEvent(
        id=f"llmu_{uuid.uuid4().hex[:12]}",
        tenant_id=TENANT,
        run_id="",
        use_case="Video Genome",
        skill=skill,
        model=meta.get("model", model),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        cost=cost,
        latency_ms=latency_ms,
    ))


def _find_video_file(video_id: str) -> str | None:
    """Locate the uploaded video file by video_id prefix."""
    for fname in os.listdir(UPLOAD_DIR):
        if fname.startswith(video_id):
            return os.path.join(UPLOAD_DIR, fname)
    return None


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

MAX_VIDEO_SIZE = 500 * 1024 * 1024  # 500 MB


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file. Streams to disk to handle large files."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".mp4", ".mov", ".webm", ".avi", ".mkv"):
        raise HTTPException(status_code=400, detail=f"Unsupported video format: {ext}")

    video_id = f"vid_{uuid.uuid4().hex[:12]}"
    safe_name = f"{video_id}{ext}"
    save_path = os.path.join(UPLOAD_DIR, safe_name)

    total_bytes = 0
    try:
        with open(save_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_VIDEO_SIZE:
                    f.close()
                    os.remove(save_path)
                    raise HTTPException(status_code=413, detail="Video exceeds 500 MB limit")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[video_genome] Upload failed: %s", exc)
        if os.path.exists(save_path):
            os.remove(save_path)
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")

    size_mb = total_bytes / (1024 * 1024)
    logger.info("[video_genome] Uploaded %s (%.1f MB) → %s", file.filename, size_mb, safe_name)

    return {
        "status": "ok",
        "video_id": video_id,
        "filename": file.filename,
        "size_mb": round(size_mb, 2),
        "path": safe_name,
    }


# ---------------------------------------------------------------------------
# Extract genome from video (multi-agent pipeline)
# ---------------------------------------------------------------------------

class ExtractRequest(BaseModel):
    video_id: str
    user_notes: str = ""


def _sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.post("/extract")
async def extract_genome(body: ExtractRequest, request: Request):
    """Extract application genome from uploaded video using multi-agent pipeline.

    Returns SSE stream with per-agent progress updates.
    """
    video_file = _find_video_file(body.video_id)
    if not video_file:
        raise HTTPException(status_code=404, detail="Video not found")

    # Get LLM config
    try:
        from services.snow_to_replit import _get_llm_config
        llm_cfg = await _get_llm_config(TENANT, request.app)
    except Exception as exc:
        return {"status": "error", "error": f"LLM not configured: {exc}"}

    defaults = request.app.state.runtime_defaults.get(TENANT)
    max_tokens = defaults.max_tokens_per_run if defaults else 16384

    # Get video filename for the extraction record
    video_filename = os.path.basename(video_file)
    video_size_mb = os.path.getsize(video_file) / (1024 * 1024)

    # Create extraction record
    from models import VideoGenomeExtraction
    extraction_id = f"vge_{uuid.uuid4().hex[:12]}"
    extraction = VideoGenomeExtraction(
        id=extraction_id,
        video_id=body.video_id,
        video_filename=video_filename,
        video_size_mb=round(video_size_mb, 2),
        status="processing",
    )
    await request.app.state.video_genome_store.create(extraction)

    app = request.app

    async def generate():
        try:
            from services.video_agents.orchestrator import run_video_extraction_pipeline

            async def on_progress(agent: str, status: str, data: dict):
                yield_data = {"agent": agent, "status": status, **data}
                # We can't yield from here directly, so we'll use a queue
                progress_queue.put_nowait(yield_data)

            progress_queue: asyncio.Queue = asyncio.Queue()

            # Run pipeline in a task so we can drain progress events
            async def _run():
                async def _progress(agent, status, data):
                    await progress_queue.put({"agent": agent, "status": status, **data})

                return await run_video_extraction_pipeline(
                    video_path=video_file,
                    llm_config=llm_cfg,
                    max_tokens=max_tokens,
                    user_notes=body.user_notes,
                    on_progress=_progress,
                )

            task = asyncio.create_task(_run())

            # Drain progress events while pipeline runs
            while not task.done():
                try:
                    event = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    yield _sse_event(event)

                    # Update extraction record with agent progress
                    agent_name = event.get("agent", "")
                    agent_status = event.get("status", "")
                    if agent_name:
                        current = await app.state.video_genome_store.get(extraction_id)
                        if current:
                            progress = dict(current.agent_progress)
                            progress[agent_name] = agent_status
                            await app.state.video_genome_store.update(
                                extraction_id, agent_progress=progress
                            )
                except asyncio.TimeoutError:
                    continue

            # Drain remaining events
            while not progress_queue.empty():
                event = progress_queue.get_nowait()
                yield _sse_event(event)

            result = task.result()

            if result.get("status") == "error":
                await app.state.video_genome_store.update(
                    extraction_id,
                    status="error",
                    error=result.get("error", "Unknown error"),
                )
                yield _sse_event({"status": "error", "error": result.get("error")})
                return

            # Update extraction record with results
            genome = result.get("genome", {})
            await app.state.video_genome_store.update(
                extraction_id,
                status="completed",
                application_name=genome.get("application_name", ""),
                vendor=genome.get("vendor", ""),
                genome=genome,
                ui_analysis=result.get("ui_analysis"),
                audio_transcript=result.get("audio_transcript"),
                design_tokens=result.get("design_tokens"),
                frame_count=result.get("frame_count", 0),
                unique_screens=result.get("unique_screens", 0),
                has_audio=result.get("audio_transcript", {}).get("has_audio", False),
                latency_ms=result.get("latency_ms", 0),
            )

            # Emit final completed event with full genome
            yield _sse_event({
                "status": "completed",
                "extraction_id": extraction_id,
                "genome": genome,
                "design_tokens": result.get("design_tokens"),
                "ui_analysis": result.get("ui_analysis"),
                "audio_transcript": result.get("audio_transcript"),
                "frame_count": result.get("frame_count", 0),
                "unique_screens": result.get("unique_screens", 0),
                "latency_ms": result.get("latency_ms", 0),
            })

        except Exception as exc:
            logger.error("[video_genome] Pipeline failed: %s", exc)
            await app.state.video_genome_store.update(
                extraction_id,
                status="error",
                error=str(exc),
            )
            yield _sse_event({"status": "error", "error": str(exc)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# List / Get / Delete extractions
# ---------------------------------------------------------------------------

@router.get("/extractions")
async def list_extractions(
    request: Request,
    tenant_id: str = Query(TENANT),
):
    """List all video genome extractions."""
    items = await request.app.state.video_genome_store.list_for_tenant(tenant_id)
    return [
        {
            "id": e.id,
            "video_id": e.video_id,
            "video_filename": e.video_filename,
            "video_size_mb": e.video_size_mb,
            "application_name": e.application_name,
            "vendor": e.vendor,
            "status": e.status,
            "frame_count": e.frame_count,
            "unique_screens": e.unique_screens,
            "has_audio": e.has_audio,
            "total_tokens": e.total_tokens,
            "total_cost": e.total_cost,
            "latency_ms": e.latency_ms,
            "created_at": e.created_at.isoformat(),
            "committed": e.committed,
            "genome": e.genome,
            "design_tokens": e.design_tokens,
        }
        for e in items
    ]


@router.get("/extractions/{extraction_id}")
async def get_extraction(extraction_id: str, request: Request):
    """Get a single extraction detail."""
    e = await request.app.state.video_genome_store.get(extraction_id)
    if e is None:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return {
        "id": e.id,
        "video_id": e.video_id,
        "video_filename": e.video_filename,
        "video_size_mb": e.video_size_mb,
        "application_name": e.application_name,
        "vendor": e.vendor,
        "status": e.status,
        "agent_progress": e.agent_progress,
        "genome": e.genome,
        "ui_analysis": e.ui_analysis,
        "audio_transcript": e.audio_transcript,
        "design_tokens": e.design_tokens,
        "error": e.error,
        "frame_count": e.frame_count,
        "unique_screens": e.unique_screens,
        "has_audio": e.has_audio,
        "total_tokens": e.total_tokens,
        "total_cost": e.total_cost,
        "latency_ms": e.latency_ms,
        "created_at": e.created_at.isoformat(),
        "committed": e.committed,
        "commit_result": e.commit_result,
    }


@router.delete("/extractions/{extraction_id}")
async def delete_extraction(extraction_id: str, request: Request):
    """Delete a video genome extraction."""
    deleted = await request.app.state.video_genome_store.delete(extraction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Commit extracted genome to GitHub
# ---------------------------------------------------------------------------

class CommitRequest(BaseModel):
    video_id: str
    genome: dict
    application_name: str = ""


@router.post("/commit")
async def commit_genome_to_github(body: CommitRequest, request: Request):
    """Commit the extracted genome to the configured GitHub repository."""
    genome = body.genome
    app_name = body.application_name or genome.get("application_name", "") or "unknown_app"
    vendor = genome.get("vendor", "") or "unknown"
    genome_doc = genome.get("genome_document", {})

    try:
        from services.oy_genome_github_service import commit_genome
        result = await commit_genome(
            tenant_id=TENANT,
            vendor=vendor,
            application=app_name,
            depth="video",
            normalized_genome=genome,
            genome_document=genome_doc,
            genome_graph=None,
            raw_vendor_payload={"source": "video", "video_id": body.video_id},
            app=request.app,
        )
    except Exception as exc:
        return {"status": "error", "error": f"GitHub commit failed: {exc}"}

    # Update extraction record if we can find it
    extractions = await request.app.state.video_genome_store.list_for_tenant(TENANT)
    for e in extractions:
        if e.video_id == body.video_id:
            await request.app.state.video_genome_store.update(
                e.id, committed=True, commit_result=result,
            )
            break

    return result
