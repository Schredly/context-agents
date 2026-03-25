"""SN Genome Orchestrator — multi-agent pipeline with merge support for multiple update sets.

Single file:  XML Parser → Genome Extraction → Deep Analysis
Multi file:   XML Parser → Genome Extraction → Genome Merger → Deep Analysis
"""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)


async def run_sn_extraction_pipeline(
    file_paths: list[str],
    llm_config: dict,
    max_tokens: int = 16384,
    user_notes: str = "",
    product_area: str = "",
    module: str = "",
    on_progress=None,
) -> dict:
    t0 = time.time()

    if on_progress is None:
        async def on_progress(agent, status, data):
            pass

    # ── Stage 1: XML Parser ──
    from services.sn_agents.xml_parser import parse_update_sets

    parse_result = await parse_update_sets(
        file_paths=file_paths,
        on_progress=on_progress,
    )

    if parse_result.get("status") != "ok":
        return {"status": "error", "error": parse_result.get("error", "XML parsing failed")}

    combined_xml = parse_result["combined_xml"]
    update_sets = parse_result["update_sets"]

    if not combined_xml.strip():
        return {"status": "error", "error": "No content found in the uploaded XML files"}

    # ── Stage 2: Genome Extraction (LLM) ──
    # For multiple files, we still send all XML together for the first extraction
    # since the LLM can see relationships across update sets
    from services.sn_agents.genome_extraction import extract_sn_genome

    extract_result = await extract_sn_genome(
        combined_xml=combined_xml,
        update_sets=update_sets,
        product_area=product_area,
        module=module,
        user_notes=user_notes,
        llm_config=llm_config,
        max_tokens=max_tokens,
        on_progress=on_progress,
    )

    if extract_result.get("status") != "ok":
        return {"status": "error", "error": extract_result.get("error", "Genome extraction failed")}

    first_pass_genome = extract_result["genome"]
    first_pass_yaml = extract_result["genome_yaml"]

    # ── Stage 2b (optional): Genome Merger ──
    # If multiple files and XML is large, the first extraction may have missed things.
    # Run merger to ensure completeness when we have multiple update sets.
    if len(file_paths) > 1:
        from services.sn_agents.genome_merger import merge_genomes

        # Extract per-file genomes for merge context
        # We already have the combined extraction; the merger will unify and deduplicate
        # by re-analyzing with the merge-specific prompt
        merge_result = await merge_genomes(
            partial_genomes=[first_pass_genome],
            partial_yamls=[first_pass_yaml],
            llm_config=llm_config,
            max_tokens=max_tokens,
            on_progress=on_progress,
        )

        if merge_result.get("status") == "ok":
            first_pass_genome = merge_result["genome"]
            first_pass_yaml = merge_result["genome_yaml"]
        else:
            logger.warning("[sn_orchestrator] Merge failed, continuing with first-pass: %s", merge_result.get("error"))

    # ── Stage 3: Deep Analysis (LLM) ──
    from services.sn_agents.deep_analysis import run_deep_analysis

    deep_result = await run_deep_analysis(
        combined_xml=combined_xml,
        first_pass_genome=first_pass_genome,
        first_pass_yaml=first_pass_yaml,
        llm_config=llm_config,
        max_tokens=max_tokens,
        on_progress=on_progress,
    )

    if deep_result.get("status") != "ok":
        logger.warning("[sn_orchestrator] Deep analysis failed, using prior genome: %s", deep_result.get("error"))
        final_genome = first_pass_genome
        final_yaml = first_pass_yaml
    else:
        final_genome = deep_result["genome"]
        final_yaml = deep_result["genome_yaml"]

    # ── Stage 4: Platform Transformer (LLM) ──
    from services.sn_agents.platform_transformer import transform_to_portable

    portable_result = await transform_to_portable(
        genome=final_genome,
        genome_yaml=final_yaml,
        llm_config=llm_config,
        max_tokens=max_tokens,
        on_progress=on_progress,
    )

    portable_genome = None
    portable_yaml = ""
    if portable_result.get("status") == "ok":
        portable_genome = portable_result["portable_genome"]
        portable_yaml = portable_result["portable_yaml"]
        # Attach portable genome as a section on the main genome
        final_genome["portable_genome"] = portable_genome
    else:
        logger.warning("[sn_orchestrator] Platform transform failed: %s", portable_result.get("error"))

    # ── Stage 5: Genome Validator (LLM) ──
    from services.sn_agents.genome_validator import validate_genome

    validation_result = await validate_genome(
        genome=final_genome,
        genome_yaml=final_yaml,
        llm_config=llm_config,
        max_tokens=max_tokens,
        on_progress=on_progress,
    )

    validation = None
    if validation_result.get("status") == "ok":
        validation = validation_result["validation"]
        final_genome["validation"] = validation
    else:
        logger.warning("[sn_orchestrator] Validation failed: %s", validation_result.get("error"))

    total_latency_ms = int((time.time() - t0) * 1000)

    return {
        "status": "ok",
        "genome": final_genome,
        "genome_yaml": final_yaml,
        "portable_genome": portable_genome,
        "portable_yaml": portable_yaml,
        "validation": validation,
        "update_sets": update_sets,
        "file_count": parse_result["file_count"],
        "total_records": parse_result["total_records"],
        "latency_ms": total_latency_ms,
    }
