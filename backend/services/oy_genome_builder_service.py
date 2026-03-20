"""OYGenomeBuilderService — vendor-agnostic genome builder.

Converts normalized extraction output into a canonical genome model.
This service has NO vendor-specific logic — it operates purely on
normalized input with a standard shape.

Input (normalized extraction):
    {
        "tables": [...],
        "scripts": [...],
        "business_rules": [...],
        "flows": [...],
        "ui_pages": [...],
        "fields": [...],
        "relationships": [...],
        ...
    }

Output (canonical genome):
    {
        "application": str,
        "vendor_source": str,
        "tenant": str,
        "objects": {
            "tables": [...],
            "workflows": [...],
            "scripts": [...]
        }
    }
"""

from __future__ import annotations

import logging
from datetime import date

logger = logging.getLogger(__name__)


def build_genome(
    normalized_payload: dict,
    application: str,
    vendor_source: str,
    tenant: str,
) -> dict:
    """Convert a normalized extraction payload into a canonical genome model.

    Args:
        normalized_payload: Vendor-agnostic extraction data with standard keys
            (tables, scripts, business_rules, flows, ui_pages, fields, relationships, items, etc.)
        application: Application name (e.g. "Technical Catalog")
        vendor_source: Source vendor identifier (e.g. "servicenow")
        tenant: Tenant identifier (e.g. "acme")

    Returns:
        Canonical genome dict suitable for serialization as genome.yaml.
    """
    tables = _extract_list(normalized_payload, "tables")
    workflows = _extract_list(normalized_payload, "flows", "workflows", "business_processes")
    scripts = _extract_list(normalized_payload, "scripts", "business_rules", "automations")

    # Also pull from items if present (catalog-style extractions)
    items = normalized_payload.get("items", [])
    if items and isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            name = item.get("name") or item.get("title") or ""
            if name:
                tables.append(_normalize_entry(name, item))

            # Extract variables as field-level objects
            for var in item.get("variables", []):
                if isinstance(var, dict) and var.get("name"):
                    scripts.append(_normalize_entry(var["name"], var))

            # Item workflows
            wf = item.get("workflow")
            if wf:
                workflows.append(_normalize_entry(f"{name} workflow", {"source": name, "workflow": wf}))

    # Deduplicate by name
    tables = _dedupe_by_name(tables)
    workflows = _dedupe_by_name(workflows)
    scripts = _dedupe_by_name(scripts)

    genome = {
        "application": application,
        "vendor_source": vendor_source,
        "tenant": tenant,
        "captured_date": date.today().isoformat(),
        "objects": {
            "tables": tables,
            "workflows": workflows,
            "scripts": scripts,
        },
        "summary": {
            "table_count": len(tables),
            "workflow_count": len(workflows),
            "script_count": len(scripts),
            "total_objects": len(tables) + len(workflows) + len(scripts),
        },
    }

    logger.info(
        "[oy_genome_builder] Built genome for %s: %d tables, %d workflows, %d scripts",
        application, len(tables), len(workflows), len(scripts),
    )

    return genome


def _extract_list(payload: dict, *keys: str) -> list[dict]:
    """Pull items from multiple possible keys, normalizing each entry."""
    results: list[dict] = []
    for key in keys:
        raw = payload.get(key, [])
        if not isinstance(raw, list):
            continue
        for item in raw:
            if isinstance(item, str):
                results.append({"name": item})
            elif isinstance(item, dict):
                results.append(_normalize_entry(
                    item.get("name") or item.get("label") or item.get("title") or str(item),
                    item,
                ))
    return results


def _normalize_entry(name: str, source: dict) -> dict:
    """Create a normalized genome object entry from a source dict.

    Pulls standard fields and drops vendor-specific metadata like sys_id.
    """
    entry: dict = {"name": name.strip()}

    # Optional standard fields — include only if present
    for field in ("type", "category", "description", "active", "scope"):
        val = source.get(field)
        if val is not None and val != "":
            entry[field] = val

    return entry


def _dedupe_by_name(items: list[dict]) -> list[dict]:
    """Remove duplicate entries by name, preserving order."""
    seen: set[str] = set()
    result: list[dict] = []
    for item in items:
        name = item.get("name", "")
        if name and name not in seen:
            seen.add(name)
            result.append(item)
    return result
