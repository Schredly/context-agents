"""Video Genome API — upload video, extract genome via vision LLM, commit to GitHub."""

from __future__ import annotations

import json
import logging
import os
import time
import uuid

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel

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


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file. Returns video_id for subsequent operations."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".mp4", ".mov", ".webm", ".avi", ".mkv"):
        raise HTTPException(status_code=400, detail=f"Unsupported video format: {ext}")

    video_id = f"vid_{uuid.uuid4().hex[:12]}"
    safe_name = f"{video_id}{ext}"
    save_path = os.path.join(UPLOAD_DIR, safe_name)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    size_mb = len(content) / (1024 * 1024)
    logger.info("[video_genome] Uploaded %s (%.1f MB) → %s", file.filename, size_mb, safe_name)

    return {
        "status": "ok",
        "video_id": video_id,
        "filename": file.filename,
        "size_mb": round(size_mb, 2),
        "path": safe_name,
    }


# ---------------------------------------------------------------------------
# Extract genome from video
# ---------------------------------------------------------------------------

class ExtractRequest(BaseModel):
    video_id: str
    user_notes: str = ""


@router.post("/extract")
async def extract_genome(body: ExtractRequest, request: Request):
    """Extract application genome from uploaded video using vision LLM."""
    # Find the video file
    video_file = None
    for fname in os.listdir(UPLOAD_DIR):
        if fname.startswith(body.video_id):
            video_file = os.path.join(UPLOAD_DIR, fname)
            break
    if not video_file or not os.path.isfile(video_file):
        raise HTTPException(status_code=404, detail="Video not found")

    # Get LLM config
    try:
        from services.snow_to_replit import _get_llm_config
        llm_cfg = await _get_llm_config(TENANT, request.app)
    except Exception as exc:
        return {"status": "error", "error": f"LLM not configured: {exc}"}

    defaults = request.app.state.runtime_defaults.get(TENANT)
    max_tokens = defaults.max_tokens_per_run if defaults else 16384

    t0 = time.monotonic()
    try:
        from services.video_genome_service import analyze_video_for_genome
        raw_response, meta = await analyze_video_for_genome(
            video_path=video_file,
            llm_cfg=llm_cfg,
            max_tokens=max_tokens,
            user_notes=body.user_notes,
        )
    except RuntimeError as exc:
        return {"status": "error", "error": str(exc)}
    except Exception as exc:
        return {"status": "error", "error": f"LLM call failed: {exc}"}

    latency_ms = int((time.monotonic() - t0) * 1000)
    await _track_usage("video-genome-extract", llm_cfg["model"], meta, request.app, latency_ms)

    # Parse JSON
    parsed = _extract_json(raw_response)
    if parsed is None:
        return {
            "status": "error",
            "error": "LLM returned invalid JSON. Try again.",
            "raw_response": raw_response[:1000],
        }

    return {
        "status": "ok",
        "video_id": body.video_id,
        "genome": parsed,
        "latency_ms": latency_ms,
        "input_tokens": meta.get("input_tokens", 0),
        "output_tokens": meta.get("output_tokens", 0),
    }


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
    app_name = body.application_name or genome.get("application_name", "unknown_app")
    vendor = genome.get("vendor", "unknown")
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

    return result
