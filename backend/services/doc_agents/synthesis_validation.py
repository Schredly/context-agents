"""Synthesis & Validation Agent — validate and enrich the extracted genome."""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)


async def synthesize_and_validate(
    genome: dict,
    sections: list[dict],
    on_progress=None,
) -> dict:
    """Validate extracted genome, compute confidence, and add metadata.

    Returns:
        {
            "status": "ok",
            "genome": {...},
            "validation_notes": [str],
            "latency_ms": int,
        }
    """
    t0 = time.time()
    if on_progress:
        await on_progress("synthesis", "running", {})

    validation_notes: list[str] = []
    gd = genome.get("genome_document", {})

    objects = gd.get("objects", [])
    fields = gd.get("fields", [])
    workflows = gd.get("workflows", [])
    relationships = gd.get("relationships", [])

    # Validate objects have required fields
    for obj in objects:
        if not obj.get("name"):
            validation_notes.append(f"Object missing name: {obj}")

    # Validate fields reference valid objects
    object_names = {o.get("name", "").lower() for o in objects}
    for field in fields:
        parent = (field.get("object") or "").lower()
        if parent and parent not in object_names:
            validation_notes.append(f"Field '{field.get('name')}' references unknown object '{field.get('object')}'")

    # Validate relationships reference valid objects
    for rel in relationships:
        from_obj = (rel.get("from_object") or "").lower()
        to_obj = (rel.get("to_object") or "").lower()
        if from_obj and from_obj not in object_names:
            validation_notes.append(f"Relationship references unknown from_object '{rel.get('from_object')}'")
        if to_obj and to_obj not in object_names:
            validation_notes.append(f"Relationship references unknown to_object '{rel.get('to_object')}'")

    # Compute confidence score
    has_objects = len(objects) > 0
    has_fields = len(fields) > 0
    has_workflows = len(workflows) > 0
    has_relationships = len(relationships) > 0
    has_name = bool(genome.get("application_name"))
    has_summary = bool(genome.get("summary"))

    score_parts = [
        0.25 if has_objects else 0,
        0.20 if has_fields else 0,
        0.20 if has_workflows else 0,
        0.15 if has_relationships else 0,
        0.10 if has_name else 0,
        0.10 if has_summary else 0,
    ]
    confidence = sum(score_parts)

    # Bonus for richness
    if len(objects) >= 5:
        confidence = min(1.0, confidence + 0.05)
    if len(fields) >= 10:
        confidence = min(1.0, confidence + 0.05)

    genome["confidence"] = round(confidence, 2)
    genome["validation_notes"] = validation_notes

    latency_ms = int((time.time() - t0) * 1000)

    if on_progress:
        await on_progress("synthesis", "done", {
            "confidence": genome["confidence"],
            "validation_issues": len(validation_notes),
            "latency_ms": latency_ms,
        })

    return {
        "status": "ok",
        "genome": genome,
        "validation_notes": validation_notes,
        "latency_ms": latency_ms,
    }
