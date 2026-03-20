"""Genome Capture Pipeline — orchestrates the three-service extraction flow.

Pipeline:
    ServiceNow
       ↓
    OYExtractorRegistryService    → Application Objects
       ↓
    OYGenomeBuilderService        → Genome YAML
       ↓
    OYGenomeGitHubService         → GitHub Commit

Pass 1 (scan):   Extract + Build genome
Pass 2 (expand): Commit to GitHub
"""

from __future__ import annotations

import logging

from services.oy_extractor_registry_service import extract as extractor_extract
from services.oy_genome_builder_service import build_genome as builder_build
from services.genome_builder import build_genome_from_extraction
from services.oy_genome_github_service import commit_genome as github_commit
from adapters.servicenow_catalog_adapter import create_servicenow_extraction

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pass 1 — Scan: Extract → Build
# ---------------------------------------------------------------------------


async def genome_scan(
    tenant_id: str,
    integration_id: str,
    target_type: str,
    target_name: str,
    depth: str,
    app,
    scope: str = "",
    application: str = "",
) -> dict:
    """Pass 1: Deploy extractor → Extract → Build genome.

    ServiceNow → OYExtractorRegistryService → OYGenomeBuilderService
    """

    # Step 1: OYExtractorRegistryService — deploy + extract
    extraction = await extractor_extract(
        tenant_id=tenant_id,
        integration_id=integration_id,
        target_type=target_type,
        target_name=target_name,
        depth=depth,
        app=app,
        scope=scope,
        application=application,
    )

    if extraction["status"] != "ok":
        return extraction

    objects = extraction["objects"]
    raw_vendor_payload = extraction["raw_vendor_payload"]
    latency_ms = extraction["latency_ms"]
    payload_size = extraction["payload_size"]

    # Step 2: Feed into existing extraction pipeline (GenomeDocument + GenomeGraph)
    integration = await app.state.integration_store.get(integration_id)
    vendor = integration.integration_type if integration else "unknown"

    extraction_id = None
    try:
        extraction_id = await create_servicenow_extraction(
            tenant_id, target_name,
            raw_vendor_payload if isinstance(raw_vendor_payload, dict) else {},
            app,
        )
    except Exception as exc:
        logger.warning("[genome_capture] Extraction pipeline failed (non-blocking): %s", exc)

    # Build GenomeDocument + GenomeGraph from normalized objects
    genome_result = None
    try:
        normalized = _normalize_for_genome_builder(objects)
        genome_result = build_genome_from_extraction(normalized, vendor)
    except Exception as exc:
        logger.warning("[genome_capture] GenomeDocument build failed: %s", exc)

    # Step 3: OYGenomeBuilderService — build canonical genome
    normalized_genome = None
    try:
        normalized_genome = builder_build(
            normalized_payload=objects,
            application=target_name,
            vendor_source=vendor,
            tenant=tenant_id,
        )
        logger.info("[genome_capture] Canonical genome: %s", normalized_genome.get("summary"))
    except Exception as exc:
        logger.warning("[genome_capture] OYGenomeBuilderService failed (non-blocking): %s", exc)

    # Build summary from raw payload
    summary = _build_summary(raw_vendor_payload)

    return {
        "status": "ok",
        "extraction_id": extraction_id,
        "latency_ms": latency_ms,
        "payload_size": payload_size,
        "summary": summary,
        "genome_document": genome_result["genome_document"].model_dump() if genome_result else None,
        "genome_graph": genome_result["genome_graph"].model_dump() if genome_result and genome_result.get("genome_graph") else None,
        "raw_vendor_payload": raw_vendor_payload,
        "normalized_genome": normalized_genome,
    }


# ---------------------------------------------------------------------------
# Pass 2 — Expand: Commit to GitHub
# ---------------------------------------------------------------------------


async def genome_expand_and_commit(
    tenant_id: str,
    integration_id: str,
    target_name: str,
    target_type: str,
    depth: str,
    raw_extraction: dict,
    genome_document: dict | None,
    genome_graph: dict | None,
    normalized_genome: dict | None = None,
    app=None,
) -> dict:
    """Pass 2: Commit genome artifacts to GitHub via OYGenomeGitHubService."""
    integration = await app.state.integration_store.get(integration_id)
    vendor = integration.integration_type if integration else "unknown"

    return await github_commit(
        tenant_id=tenant_id,
        vendor=vendor,
        application=target_name,
        depth=depth,
        normalized_genome=normalized_genome,
        genome_document=genome_document,
        genome_graph=genome_graph,
        raw_vendor_payload=raw_extraction,
        app=app,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_for_genome_builder(objects: dict) -> dict:
    """Convert flattened application objects into the format expected by
    the existing genome_builder (GenomeDocument pipeline)."""
    items = objects.get("items", [])
    tables = []
    fields = []
    workflows = []
    relationships = []

    for item in items:
        name = item.get("name", "")
        if name:
            tables.append(name)

        category = item.get("category", "")
        if category and category not in tables:
            tables.append(category)
            relationships.append(f"{category} \u2192 {name}")

        for var in item.get("variables", []):
            var_name = var.get("name", "")
            if var_name and var_name not in fields:
                fields.append(var_name)

        if item.get("variables"):
            relationships.append(f"{name} \u2192 variables")

        wf = item.get("workflow", "")
        if wf:
            workflows.append(f"{name} workflow")
        workflows.append(f"{name} request")

    # Also pull from top-level keys if present (non-catalog extractions)
    for t in objects.get("tables", []):
        name = t if isinstance(t, str) else t.get("name", "")
        if name and name not in tables:
            tables.append(name)

    for f in objects.get("fields", []):
        name = f if isinstance(f, str) else f.get("name", "")
        if name and name not in fields:
            fields.append(name)

    for w in objects.get("flows", objects.get("workflows", [])):
        name = w if isinstance(w, str) else w.get("name", "")
        if name and name not in workflows:
            workflows.append(name)

    return {
        "tables": tables,
        "fields": fields,
        "workflows": workflows,
        "relationships": relationships,
    }


def _build_summary(raw: dict) -> dict:
    """Extract summary counts from raw vendor payload."""
    if not isinstance(raw, dict):
        return {}

    # Self-deploy extractor format
    s = raw.get("summary", {})
    if s:
        return {
            "items": int(s.get("item_count", 0)),
            "variables": int(s.get("variable_count", 0)),
            "choices": int(s.get("choice_count", 0)),
        }

    # Catalog By Title format
    items = raw.get("items", [])
    if items:
        var_count = sum(
            len(item.get("variables", item.get("item", {}).get("variables", [])) if isinstance(item, dict) else [])
            for item in items
        )
        return {
            "items": len(items),
            "variables": var_count,
            "choices": 0,
        }

    return {}
