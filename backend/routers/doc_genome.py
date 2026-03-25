"""Doc Genome API — upload documentation, extract genome via LLM pipeline, commit to GitHub."""

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

router = APIRouter(prefix="/api/doc-genome", tags=["doc-genome"])

TENANT = "acme"
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploaded_docs")
os.makedirs(UPLOAD_DIR, exist_ok=True)


async def _track_usage(skill: str, model: str, meta: dict, app, latency_ms: int = 0) -> None:
    from models import LLMUsageEvent, calculate_llm_cost
    input_tokens = meta.get("input_tokens") or 0
    output_tokens = meta.get("output_tokens") or 0
    cost = calculate_llm_cost(model, input_tokens, output_tokens)
    await app.state.llm_usage_store.create(LLMUsageEvent(
        id=f"llmu_{uuid.uuid4().hex[:12]}",
        tenant_id=TENANT,
        run_id="",
        use_case="Doc Genome",
        skill=skill,
        model=meta.get("model", model),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        cost=cost,
        latency_ms=latency_ms,
    ))


def _find_doc_file(doc_id: str) -> str | None:
    """Locate the uploaded doc file by doc_id prefix."""
    for fname in os.listdir(UPLOAD_DIR):
        if fname.startswith(doc_id):
            return os.path.join(UPLOAD_DIR, fname)
    return None


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

MAX_DOC_SIZE = 100 * 1024 * 1024  # 100 MB

ALLOWED_EXTENSIONS = (".pdf", ".docx", ".doc", ".txt", ".md", ".markdown")


@router.post("/upload")
async def upload_doc(file: UploadFile = File(...)):
    """Upload a documentation file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    doc_id = f"doc_{uuid.uuid4().hex[:12]}"
    safe_name = f"{doc_id}{ext}"
    save_path = os.path.join(UPLOAD_DIR, safe_name)

    total_bytes = 0
    try:
        with open(save_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_DOC_SIZE:
                    f.close()
                    os.remove(save_path)
                    raise HTTPException(status_code=413, detail="Document exceeds 100 MB limit")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[doc_genome] Upload failed: %s", exc)
        if os.path.exists(save_path):
            os.remove(save_path)
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")

    size_mb = total_bytes / (1024 * 1024)
    logger.info("[doc_genome] Uploaded %s (%.1f MB) → %s", file.filename, size_mb, safe_name)

    return {
        "status": "ok",
        "doc_id": doc_id,
        "filename": file.filename,
        "size_mb": round(size_mb, 2),
        "path": safe_name,
    }


# ---------------------------------------------------------------------------
# Extract genome from document (3-agent pipeline)
# ---------------------------------------------------------------------------

class ExtractRequest(BaseModel):
    doc_id: str
    user_notes: str = ""
    vendor: str = ""
    product_area: str = ""
    module: str = ""


def _sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.post("/extract")
async def extract_genome(body: ExtractRequest, request: Request):
    """Extract application genome from uploaded document using multi-agent pipeline.

    Returns SSE stream with per-agent progress updates.
    """
    doc_file = _find_doc_file(body.doc_id)
    if not doc_file:
        raise HTTPException(status_code=404, detail="Document not found")

    # Get LLM config
    try:
        from services.snow_to_replit import _get_llm_config
        llm_cfg = await _get_llm_config(TENANT, request.app)
    except Exception as exc:
        return {"status": "error", "error": f"LLM not configured: {exc}"}

    defaults = request.app.state.runtime_defaults.get(TENANT)
    max_tokens = defaults.max_tokens_per_run if defaults else 16384

    doc_filename = os.path.basename(doc_file)
    doc_size_mb = os.path.getsize(doc_file) / (1024 * 1024)
    doc_ext = os.path.splitext(doc_file)[1].lower().lstrip(".")

    # Create extraction record
    from models import DocGenomeExtraction
    extraction_id = f"dge_{uuid.uuid4().hex[:12]}"
    extraction = DocGenomeExtraction(
        id=extraction_id,
        doc_id=body.doc_id,
        doc_filename=doc_filename,
        doc_size_mb=round(doc_size_mb, 2),
        doc_type=doc_ext,
        vendor=body.vendor,
        product_area=body.product_area,
        module=body.module,
        status="processing",
    )
    await request.app.state.doc_genome_store.create(extraction)

    app = request.app

    async def generate():
        try:
            from services.doc_agents.orchestrator import run_doc_extraction_pipeline

            progress_queue: asyncio.Queue = asyncio.Queue()

            async def _run():
                async def _progress(agent, status, data):
                    await progress_queue.put({"agent": agent, "status": status, **data})

                return await run_doc_extraction_pipeline(
                    file_path=doc_file,
                    llm_config=llm_cfg,
                    max_tokens=max_tokens,
                    user_notes=body.user_notes,
                    vendor=body.vendor,
                    product_area=body.product_area,
                    module=body.module,
                    on_progress=_progress,
                )

            task = asyncio.create_task(_run())

            # Drain progress events while pipeline runs
            while not task.done():
                try:
                    event = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    yield _sse_event(event)

                    agent_name = event.get("agent", "")
                    agent_status = event.get("status", "")
                    if agent_name:
                        current = await app.state.doc_genome_store.get(extraction_id)
                        if current:
                            progress = dict(current.agent_progress)
                            progress[agent_name] = agent_status
                            await app.state.doc_genome_store.update(
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
                await app.state.doc_genome_store.update(
                    extraction_id,
                    status="error",
                    error=result.get("error", "Unknown error"),
                )
                yield _sse_event({"status": "error", "error": result.get("error")})
                return

            genome = result.get("genome", {})
            await app.state.doc_genome_store.update(
                extraction_id,
                status="completed",
                application_name=genome.get("application_name", ""),
                vendor=body.vendor or genome.get("vendor", ""),
                genome=genome,
                doc_sections=result.get("doc_sections"),
                page_count=result.get("page_count", 0),
                word_count=result.get("word_count", 0),
                latency_ms=result.get("latency_ms", 0),
            )

            yield _sse_event({
                "status": "completed",
                "extraction_id": extraction_id,
                "genome": genome,
                "doc_sections": result.get("doc_sections"),
                "page_count": result.get("page_count", 0),
                "word_count": result.get("word_count", 0),
                "latency_ms": result.get("latency_ms", 0),
            })

        except Exception as exc:
            logger.error("[doc_genome] Pipeline failed: %s", exc)
            await app.state.doc_genome_store.update(
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
    """List all doc genome extractions."""
    items = await request.app.state.doc_genome_store.list_for_tenant(tenant_id)
    return [
        {
            "id": e.id,
            "doc_id": e.doc_id,
            "doc_filename": e.doc_filename,
            "doc_size_mb": e.doc_size_mb,
            "doc_type": e.doc_type,
            "application_name": e.application_name,
            "vendor": e.vendor,
            "product_area": e.product_area,
            "module": e.module,
            "status": e.status,
            "page_count": e.page_count,
            "word_count": e.word_count,
            "total_tokens": e.total_tokens,
            "total_cost": e.total_cost,
            "latency_ms": e.latency_ms,
            "created_at": e.created_at.isoformat(),
            "committed": e.committed,
            "genome": e.genome,
        }
        for e in items
    ]


@router.get("/extractions/{extraction_id}")
async def get_extraction(extraction_id: str, request: Request):
    """Get a single extraction detail."""
    e = await request.app.state.doc_genome_store.get(extraction_id)
    if e is None:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return {
        "id": e.id,
        "doc_id": e.doc_id,
        "doc_filename": e.doc_filename,
        "doc_size_mb": e.doc_size_mb,
        "doc_type": e.doc_type,
        "application_name": e.application_name,
        "vendor": e.vendor,
        "product_area": e.product_area,
        "module": e.module,
        "status": e.status,
        "agent_progress": e.agent_progress,
        "genome": e.genome,
        "doc_sections": e.doc_sections,
        "error": e.error,
        "page_count": e.page_count,
        "word_count": e.word_count,
        "total_tokens": e.total_tokens,
        "total_cost": e.total_cost,
        "latency_ms": e.latency_ms,
        "created_at": e.created_at.isoformat(),
        "committed": e.committed,
        "commit_result": e.commit_result,
    }


@router.delete("/extractions/{extraction_id}")
async def delete_extraction(extraction_id: str, request: Request):
    """Delete a doc genome extraction."""
    deleted = await request.app.state.doc_genome_store.delete(extraction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Commit extracted genome to GitHub
# ---------------------------------------------------------------------------

class CommitRequest(BaseModel):
    doc_id: str
    genome: dict
    application_name: str = ""
    vendor: str = ""
    product_area: str = ""
    module: str = ""


@router.post("/commit")
async def commit_genome_to_github(body: CommitRequest, request: Request):
    """Commit the extracted genome to the configured GitHub repository."""
    import yaml
    from services.snow_to_github import (
        _load_github_targets,
        _parse_repo_ref,
        _ensure_repo,
        _commit_files_to_repo,
        _scrub_secrets,
    )

    genome = body.genome
    app_name = body.application_name or genome.get("application_name", "") or "unknown_app"
    vendor = body.vendor or genome.get("vendor", "") or "unknown"
    gd = genome.get("genome_document", {})

    # Resolve GitHub target
    targets = await _load_github_targets(TENANT, request.app)
    if not targets:
        return {"status": "error", "error": "No GitHub integration configured"}
    target = targets[0]
    if not target.token:
        return {"status": "error", "error": "GitHub integration has no access token"}

    owner, repo_name = _parse_repo_ref(target.default_repo, target.org)
    if not owner:
        return {"status": "error", "error": "GitHub integration missing org/owner"}

    headers = {
        "Authorization": f"Bearer {target.token}",
        "Accept": "application/vnd.github+json",
    }

    # Build file tree
    def _slug(s: str) -> str:
        return s.lower().replace(" ", "_").replace("/", "_")

    path_parts = [f"genomes/tenants/{TENANT}/vendors/{_slug(vendor)}"]
    if body.product_area:
        path_parts.append(_slug(body.product_area))
    if body.module:
        path_parts.append(_slug(body.module))
    elif app_name:
        path_parts.append(_slug(app_name))
    base = "/".join(path_parts)

    files: dict[str, str] = {}

    # genome.yaml — full normalized genome
    files[f"{base}/genome.yaml"] = yaml.dump(genome, default_flow_style=False, sort_keys=False)

    # summary.md
    if genome.get("summary"):
        files[f"{base}/summary.md"] = f"# {app_name}\n\n{genome['summary']}\n"

    # structure/ — objects, fields, workflows, relationships as JSON
    if gd.get("objects"):
        files[f"{base}/structure/objects.json"] = json.dumps(gd["objects"], indent=2)
    if gd.get("fields"):
        files[f"{base}/structure/fields.json"] = json.dumps(gd["fields"], indent=2)
    if gd.get("workflows"):
        files[f"{base}/structure/workflows.json"] = json.dumps(gd["workflows"], indent=2)
    if gd.get("relationships"):
        files[f"{base}/structure/relationships.json"] = json.dumps(gd["relationships"], indent=2)

    # data/ — source metadata
    files[f"{base}/data/source.json"] = json.dumps({"source": "documentation", "doc_id": body.doc_id}, indent=2)

    # Scrub secrets
    files = {path: _scrub_secrets(content) for path, content in files.items()}

    if not files:
        return {"status": "error", "error": "No files to commit"}

    # Ensure repo exists
    repo = await _ensure_repo(owner, repo_name, headers, description=f"Genome: {app_name}")
    if not repo["ok"]:
        return {"status": "error", "error": repo["error"]}

    # Commit
    import services.snow_to_github as _gh
    original_msg = _gh.COMMIT_MESSAGE
    _gh.COMMIT_MESSAGE = (
        f"Capture genome (documentation)\n\n"
        f"Tenant: {TENANT}\n"
        f"Vendor: {vendor}\n"
        f"Application: {app_name}\n"
        f"Source: Documentation"
    )
    result = await _commit_files_to_repo(owner, repo_name, files, headers)
    _gh.COMMIT_MESSAGE = original_msg

    if not result["pushed"]:
        return {"status": "error", "error": "Failed to commit files to GitHub", "errors": result.get("errors", [])}

    commit_result = {
        "status": "ok",
        "repo_url": repo["repo_url"],
        "commit_hash": result["commit_hash"],
        "files_pushed": result["pushed"],
        "file_count": len(result["pushed"]),
    }

    try:
        # dummy — keeps same return signature
        result = commit_result
    except Exception as exc:
        return {"status": "error", "error": f"GitHub commit failed: {exc}"}

    # Update extraction record
    extractions = await request.app.state.doc_genome_store.list_for_tenant(TENANT)
    for e in extractions:
        if e.doc_id == body.doc_id:
            await request.app.state.doc_genome_store.update(
                e.id, committed=True, commit_result=result,
            )
            break

    return result
