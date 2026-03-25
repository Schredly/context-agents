"""Genome Registry — saves completed extractions to the unified All Genomes store.

Called by Doc Genome, SN Genome, and Video Genome routers after successful extraction.
This ensures every genome appears on the All Genomes page regardless of source type.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from models import ApplicationGenome, GenomeDocument


async def register_genome(
    app,
    tenant_id: str,
    source_type: str,
    vendor: str,
    application_name: str,
    genome: dict,
    source_id: str = "",
    latency_ms: int = 0,
) -> ApplicationGenome:
    """Register a completed genome extraction in the unified genome store.

    Args:
        app: FastAPI app (for accessing stores)
        tenant_id: tenant ID
        source_type: "API" | "Documentation" | "Video Capture" | "ServiceNow Update Set"
        vendor: vendor name
        application_name: extracted app name
        genome: the genome dict (varies by source type)
        source_id: the extraction ID from the source store (for cross-reference)
        latency_ms: extraction latency

    Returns:
        The created ApplicationGenome record.
    """
    # Extract counts from genome based on format
    objects, workflows, fields, relationships = _extract_counts(genome, source_type)

    genome_id = f"genome_{uuid.uuid4().hex[:12]}"

    # Build GenomeDocument from available data
    obj_names = _extract_names(genome, "objects", source_type)
    wf_names = _extract_names(genome, "workflows", source_type)
    field_names = _extract_names(genome, "fields", source_type)
    rel_names = _extract_names(genome, "relationships", source_type)

    record = ApplicationGenome(
        id=genome_id,
        tenant_id=tenant_id,
        vendor=vendor,
        application_name=application_name or "Untitled",
        source_platform=source_type,
        target_platform="",
        category=genome.get("category", ""),
        object_count=objects,
        workflow_count=workflows,
        legacy_cost=0.0,
        migrated_cost=0.0,
        operational_cost=0.0,
        captured_date=datetime.now(timezone.utc).isoformat(),
        genome_document=GenomeDocument(
            objects=obj_names,
            workflows=wf_names,
            fields=field_names,
            relationships=rel_names,
        ),
        source_signature=f"{source_type}:{source_id}",
    )

    await app.state.genome_store.create(record)
    return record


def _extract_counts(genome: dict, source_type: str) -> tuple[int, int, int, int]:
    """Extract object/workflow/field/relationship counts from genome dict."""
    if source_type == "ServiceNow Update Set":
        # SN genome uses entities, workflows, business_logic.rules, data_model.tables
        entities = len(genome.get("entities", []))
        catalog = len(genome.get("catalog", {}).get("items", []))
        workflows = len(genome.get("workflows", []))
        rules = len(genome.get("business_logic", {}).get("rules", []))
        tables = len(genome.get("data_model", {}).get("tables", []))
        return (entities + tables, workflows, catalog + rules, 0)
    else:
        # Doc/Video genome uses genome_document.objects/workflows/fields/relationships
        gd = genome.get("genome_document", {})
        objects = len(gd.get("objects", []))
        workflows = len(gd.get("workflows", []))
        fields = len(gd.get("fields", []))
        rels = len(gd.get("relationships", []))
        return (objects, workflows, fields, rels)


def _extract_names(genome: dict, key: str, source_type: str) -> list[str]:
    """Extract a list of names for a genome section."""
    if source_type == "ServiceNow Update Set":
        if key == "objects":
            items = genome.get("entities", []) + genome.get("data_model", {}).get("tables", [])
        elif key == "workflows":
            items = genome.get("workflows", [])
        elif key == "fields":
            items = genome.get("catalog", {}).get("items", []) + genome.get("business_logic", {}).get("rules", [])
        elif key == "relationships":
            items = genome.get("integrations", [])
        else:
            items = []
    else:
        gd = genome.get("genome_document", {})
        items = gd.get(key, [])

    names = []
    for item in items:
        if isinstance(item, dict):
            names.append(item.get("name", item.get("label", str(item)[:50])))
        elif isinstance(item, str):
            names.append(item)
    return names[:50]  # Cap at 50 items
