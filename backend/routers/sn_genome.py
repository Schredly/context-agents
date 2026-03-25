"""SN Genome API — upload ServiceNow update set XMLs, extract genome via LLM, commit to GitHub."""

from __future__ import annotations

import json
import logging
import os
import uuid

import yaml

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sn-genome", tags=["sn-genome"])

TENANT = "acme"
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploaded_docs")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Upload (multi-file)
# ---------------------------------------------------------------------------

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB per file


@router.post("/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    """Upload one or more ServiceNow update set XML files."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    results = []
    for file in files:
        if not file.filename:
            continue

        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in (".xml",):
            results.append({"filename": file.filename, "status": "error", "error": f"Unsupported format: {ext}. Only .xml allowed."})
            continue

        doc_id = f"sn_{uuid.uuid4().hex[:12]}"
        safe_name = f"{doc_id}{ext}"
        save_path = os.path.join(UPLOAD_DIR, safe_name)

        total_bytes = 0
        too_large = False
        try:
            with open(save_path, "wb") as f:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    total_bytes += len(chunk)
                    if total_bytes > MAX_FILE_SIZE:
                        too_large = True
                        break
                    f.write(chunk)

            if too_large:
                os.remove(save_path)
                results.append({"filename": file.filename, "status": "error", "error": "File exceeds 100 MB"})
            else:
                size_mb = total_bytes / (1024 * 1024)
                results.append({
                    "status": "ok",
                    "doc_id": doc_id,
                    "filename": file.filename,
                    "size_mb": round(size_mb, 2),
                })
        except Exception as exc:
            if os.path.exists(save_path):
                os.remove(save_path)
            results.append({"filename": file.filename, "status": "error", "error": str(exc)})

    ok_count = sum(1 for r in results if r.get("status") == "ok")
    logger.info("[sn_genome] Uploaded %d/%d files", ok_count, len(files))

    return {"status": "ok", "files": results, "uploaded": ok_count}


def _find_file(doc_id: str) -> str | None:
    for fname in os.listdir(UPLOAD_DIR):
        if fname.startswith(doc_id):
            return os.path.join(UPLOAD_DIR, fname)
    return None


# ---------------------------------------------------------------------------
# Extract genome from update set XMLs
# ---------------------------------------------------------------------------

class ExtractRequest(BaseModel):
    doc_ids: list[str]
    user_notes: str = ""
    product_area: str = ""
    module: str = ""


def _sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.post("/extract")
async def extract_genome(body: ExtractRequest, request: Request):
    """Extract SN genome from uploaded update set XMLs. Returns SSE stream."""
    # Resolve file paths
    file_paths = []
    filenames = []
    total_size = 0.0
    for doc_id in body.doc_ids:
        fpath = _find_file(doc_id)
        if not fpath:
            raise HTTPException(status_code=404, detail=f"File not found: {doc_id}")
        file_paths.append(fpath)
        filenames.append(os.path.basename(fpath))
        total_size += os.path.getsize(fpath) / (1024 * 1024)

    # Get LLM config
    try:
        from services.snow_to_replit import _get_llm_config
        llm_cfg = await _get_llm_config(TENANT, request.app)
    except Exception as exc:
        return {"status": "error", "error": f"LLM not configured: {exc}"}

    defaults = request.app.state.runtime_defaults.get(TENANT)
    max_tokens = defaults.max_tokens_per_run if defaults else 16384

    # Create extraction record
    from models import SNGenomeExtraction
    extraction_id = f"sng_{uuid.uuid4().hex[:12]}"
    extraction = SNGenomeExtraction(
        id=extraction_id,
        doc_ids=body.doc_ids,
        doc_filenames=filenames,
        total_size_mb=round(total_size, 2),
        product_area=body.product_area,
        module=body.module,
        file_count=len(file_paths),
        status="processing",
    )
    await request.app.state.sn_genome_store.create(extraction)

    app = request.app

    async def generate():
        try:
            from services.sn_agents.orchestrator import run_sn_extraction_pipeline
            import asyncio

            progress_queue: asyncio.Queue = asyncio.Queue()

            async def _run():
                async def _progress(agent, status, data):
                    await progress_queue.put({"agent": agent, "status": status, **data})

                return await run_sn_extraction_pipeline(
                    file_paths=file_paths,
                    llm_config=llm_cfg,
                    max_tokens=max_tokens,
                    user_notes=body.user_notes,
                    product_area=body.product_area,
                    module=body.module,
                    on_progress=_progress,
                )

            task = asyncio.create_task(_run())

            while not task.done():
                try:
                    event = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    yield _sse_event(event)

                    agent_name = event.get("agent", "")
                    agent_status = event.get("status", "")
                    if agent_name:
                        current = await app.state.sn_genome_store.get(extraction_id)
                        if current:
                            progress = dict(current.agent_progress)
                            progress[agent_name] = agent_status
                            await app.state.sn_genome_store.update(
                                extraction_id, agent_progress=progress
                            )
                except asyncio.TimeoutError:
                    continue

            while not progress_queue.empty():
                event = progress_queue.get_nowait()
                yield _sse_event(event)

            result = task.result()

            if result.get("status") == "error":
                await app.state.sn_genome_store.update(
                    extraction_id,
                    status="error",
                    error=result.get("error", "Unknown error"),
                )
                yield _sse_event({"status": "error", "error": result.get("error")})
                return

            genome = result.get("genome", {})
            app_name = genome.get("application", {}).get("name", "")

            await app.state.sn_genome_store.update(
                extraction_id,
                status="completed",
                application_name=app_name,
                genome=genome,
                genome_yaml=result.get("genome_yaml", ""),
                latency_ms=result.get("latency_ms", 0),
            )

            yield _sse_event({
                "status": "completed",
                "extraction_id": extraction_id,
                "genome": genome,
                "genome_yaml": result.get("genome_yaml", ""),
                "update_sets": result.get("update_sets", []),
                "file_count": result.get("file_count", 0),
                "total_records": result.get("total_records", 0),
                "latency_ms": result.get("latency_ms", 0),
            })

        except Exception as exc:
            logger.error("[sn_genome] Pipeline failed: %s", exc)
            await app.state.sn_genome_store.update(
                extraction_id, status="error", error=str(exc),
            )
            yield _sse_event({"status": "error", "error": str(exc)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# List / Get / Delete
# ---------------------------------------------------------------------------

@router.get("/extractions")
async def list_extractions(request: Request, tenant_id: str = Query(TENANT)):
    items = await request.app.state.sn_genome_store.list_for_tenant(tenant_id)
    return [
        {
            "id": e.id,
            "doc_ids": e.doc_ids,
            "doc_filenames": e.doc_filenames,
            "total_size_mb": e.total_size_mb,
            "application_name": e.application_name,
            "vendor": e.vendor,
            "product_area": e.product_area,
            "module": e.module,
            "status": e.status,
            "file_count": e.file_count,
            "latency_ms": e.latency_ms,
            "created_at": e.created_at.isoformat(),
            "committed": e.committed,
            "genome": e.genome,
        }
        for e in items
    ]


@router.get("/extractions/{extraction_id}")
async def get_extraction(extraction_id: str, request: Request):
    e = await request.app.state.sn_genome_store.get(extraction_id)
    if e is None:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return {
        "id": e.id,
        "doc_ids": e.doc_ids,
        "doc_filenames": e.doc_filenames,
        "total_size_mb": e.total_size_mb,
        "application_name": e.application_name,
        "vendor": e.vendor,
        "product_area": e.product_area,
        "module": e.module,
        "status": e.status,
        "agent_progress": e.agent_progress,
        "genome": e.genome,
        "genome_yaml": e.genome_yaml,
        "error": e.error,
        "file_count": e.file_count,
        "latency_ms": e.latency_ms,
        "created_at": e.created_at.isoformat(),
        "committed": e.committed,
        "commit_result": e.commit_result,
    }


@router.delete("/extractions/{extraction_id}")
async def delete_extraction(extraction_id: str, request: Request):
    deleted = await request.app.state.sn_genome_store.delete(extraction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Commit to GitHub
# ---------------------------------------------------------------------------

class CommitRequest(BaseModel):
    extraction_id: str
    genome: dict
    genome_yaml: str = ""
    application_name: str = ""
    product_area: str = ""
    module: str = ""


@router.post("/commit")
async def commit_to_github(body: CommitRequest, request: Request):
    """Commit SN genome to GitHub — pushes genome.yaml + structure files."""
    from services.snow_to_github import (
        _load_github_targets,
        _parse_repo_ref,
        _ensure_repo,
        _commit_files_to_repo,
        _scrub_secrets,
    )

    genome = body.genome
    app_info = genome.get("application", {})
    app_name = body.application_name or app_info.get("name", "") or "unknown_app"
    vendor = "ServiceNow"

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

    def _slug(s: str) -> str:
        return s.lower().replace(" ", "_").replace("/", "_").replace("-", "_")

    path_parts = [f"genomes/tenants/{TENANT}/vendors/servicenow"]
    if body.product_area:
        path_parts.append(_slug(body.product_area))
    if body.module:
        path_parts.append(_slug(body.module))
    elif app_name:
        path_parts.append(_slug(app_name))
    base = "/".join(path_parts)

    files: dict[str, str] = {}

    # genome.yaml — the full YAML output
    if body.genome_yaml:
        files[f"{base}/genome.yaml"] = body.genome_yaml
    else:
        files[f"{base}/genome.yaml"] = yaml.dump(genome, default_flow_style=False, sort_keys=False)

    # Individual structure files as JSON for easy consumption
    if genome.get("entities"):
        files[f"{base}/structure/entities.json"] = json.dumps(genome["entities"], indent=2)
    if genome.get("catalog"):
        files[f"{base}/structure/catalog.json"] = json.dumps(genome["catalog"], indent=2)
    if genome.get("workflows"):
        files[f"{base}/structure/workflows.json"] = json.dumps(genome["workflows"], indent=2)
    if genome.get("business_logic"):
        files[f"{base}/structure/business_logic.json"] = json.dumps(genome["business_logic"], indent=2)
    if genome.get("data_model"):
        files[f"{base}/structure/data_model.json"] = json.dumps(genome["data_model"], indent=2)
    if genome.get("ui"):
        files[f"{base}/structure/ui.json"] = json.dumps(genome["ui"], indent=2)
    if genome.get("navigation"):
        files[f"{base}/structure/navigation.json"] = json.dumps(genome["navigation"], indent=2)
    if genome.get("integrations"):
        files[f"{base}/structure/integrations.json"] = json.dumps(genome["integrations"], indent=2)
    if genome.get("logic_patterns"):
        files[f"{base}/structure/logic_patterns.json"] = json.dumps(genome["logic_patterns"], indent=2)
    if genome.get("processes"):
        files[f"{base}/structure/processes.json"] = json.dumps(genome["processes"], indent=2)
    if genome.get("events"):
        files[f"{base}/structure/events.json"] = json.dumps(genome["events"], indent=2)
    if genome.get("portable_genome"):
        files[f"{base}/portable/portable_genome.json"] = json.dumps(genome["portable_genome"], indent=2)
    if genome.get("validation"):
        files[f"{base}/validation/report.json"] = json.dumps(genome["validation"], indent=2)

    files = {path: _scrub_secrets(content) for path, content in files.items()}

    if not files:
        return {"status": "error", "error": "No files to commit"}

    repo = await _ensure_repo(owner, repo_name, headers, description=f"Genome: {app_name}")
    if not repo["ok"]:
        return {"status": "error", "error": repo["error"]}

    import services.snow_to_github as _gh
    original_msg = _gh.COMMIT_MESSAGE
    _gh.COMMIT_MESSAGE = (
        f"Capture genome (ServiceNow update set)\n\n"
        f"Tenant: {TENANT}\n"
        f"Vendor: ServiceNow\n"
        f"Application: {app_name}\n"
        f"Source: Update Set XML"
    )
    result = await _commit_files_to_repo(owner, repo_name, files, headers)
    _gh.COMMIT_MESSAGE = original_msg

    if not result["pushed"]:
        return {"status": "error", "error": "Failed to commit files to GitHub"}

    commit_result = {
        "status": "ok",
        "repo_url": repo["repo_url"],
        "commit_hash": result["commit_hash"],
        "files_pushed": result["pushed"],
        "file_count": len(result["pushed"]),
    }

    # Update extraction record
    await request.app.state.sn_genome_store.update(
        body.extraction_id, committed=True, commit_result=commit_result,
    )

    return commit_result
