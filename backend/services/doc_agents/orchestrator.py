"""Doc Genome Orchestrator — 3-agent pipeline: parse → extract structure → synthesize."""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)


async def run_doc_extraction_pipeline(
    file_path: str,
    llm_config: dict,
    max_tokens: int = 16384,
    user_notes: str = "",
    vendor: str = "",
    product_area: str = "",
    module: str = "",
    on_progress=None,
) -> dict:
    """Run the full doc genome extraction pipeline.

    3 stages:
      1. Document Parser — extract text and sections from the file
      2. Structure Extraction — LLM extracts genome (objects, fields, workflows, relationships)
      3. Synthesis & Validation — validate, compute confidence

    Returns a dict with genome, sections, page_count, word_count, latency_ms, etc.
    """
    t0 = time.time()
    noop = (lambda *a, **k: None)

    if on_progress is None:
        async def on_progress(agent, status, data):
            pass

    # ── Stage 1: Document Parser ──
    from services.doc_agents.document_parser import parse_document

    parse_result = await parse_document(
        file_path=file_path,
        on_progress=on_progress,
    )

    if parse_result.get("status") != "ok":
        return {"status": "error", "error": parse_result.get("error", "Document parsing failed")}

    full_text = parse_result["full_text"]
    sections = parse_result["sections"]
    page_count = parse_result["page_count"]
    word_count = parse_result["word_count"]

    if not full_text.strip():
        return {"status": "error", "error": "Document appears to be empty — no text could be extracted"}

    # ── Stage 2: Structure Extraction (LLM) ──
    from services.doc_agents.structure_extraction import extract_structure

    structure_result = await extract_structure(
        full_text=full_text,
        sections=sections,
        vendor=vendor,
        product_area=product_area,
        module=module,
        user_notes=user_notes,
        llm_config=llm_config,
        max_tokens=max_tokens,
        on_progress=on_progress,
    )

    if structure_result.get("status") != "ok":
        return {"status": "error", "error": structure_result.get("error", "Structure extraction failed")}

    genome = structure_result["genome"]

    # ── Stage 3: Synthesis & Validation ──
    from services.doc_agents.synthesis_validation import synthesize_and_validate

    synth_result = await synthesize_and_validate(
        genome=genome,
        sections=sections,
        on_progress=on_progress,
    )

    if synth_result.get("status") != "ok":
        return {"status": "error", "error": synth_result.get("error", "Synthesis failed")}

    genome = synth_result["genome"]

    total_latency_ms = int((time.time() - t0) * 1000)

    return {
        "status": "ok",
        "genome": genome,
        "doc_sections": sections,
        "page_count": page_count,
        "word_count": word_count,
        "latency_ms": total_latency_ms,
        "validation_notes": synth_result.get("validation_notes", []),
    }
