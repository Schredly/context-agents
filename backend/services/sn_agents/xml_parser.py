"""XML Parser Agent — extract text content from ServiceNow update set XML files."""

from __future__ import annotations

import logging
import os
import time
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)


async def parse_update_sets(
    file_paths: list[str],
    on_progress=None,
) -> dict:
    """Parse one or more ServiceNow update set XML files.

    Returns:
        {
            "status": "ok",
            "combined_xml": str,       # all XML content concatenated
            "update_sets": [{"filename": str, "name": str, "records": int}],
            "total_records": int,
            "file_count": int,
            "latency_ms": int,
        }
    """
    t0 = time.time()
    if on_progress:
        await on_progress("xml_parser", "running", {})

    combined_parts: list[str] = []
    update_sets: list[dict] = []
    total_records = 0

    for fpath in file_paths:
        filename = os.path.basename(fpath)
        try:
            with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

            combined_parts.append(content)

            # Try to parse and extract metadata
            us_name = filename
            record_count = 0
            try:
                root = ET.fromstring(content)
                # ServiceNow update sets typically have <unload> root with <sys_update_xml> children
                name_el = root.find(".//name")
                if name_el is not None and name_el.text:
                    us_name = name_el.text

                # Count sys_update_xml records
                for tag in ["sys_update_xml", "sys_remote_update_set"]:
                    records = root.findall(f".//{tag}")
                    record_count += len(records)

                # If no specific records found, count all direct children
                if record_count == 0:
                    record_count = len(list(root))
            except ET.ParseError:
                logger.warning("[sn_xml_parser] Could not parse XML structure for %s, using raw content", filename)
                record_count = content.count("<sys_update_xml")

            total_records += record_count
            update_sets.append({
                "filename": filename,
                "name": us_name,
                "records": record_count,
            })

        except Exception as exc:
            logger.error("[sn_xml_parser] Failed to read %s: %s", fpath, exc)
            update_sets.append({
                "filename": filename,
                "name": filename,
                "records": 0,
                "error": str(exc),
            })

    combined_xml = "\n\n".join(combined_parts)
    latency_ms = int((time.time() - t0) * 1000)

    if on_progress:
        await on_progress("xml_parser", "done", {
            "files": len(file_paths),
            "update_sets": len(update_sets),
            "records": total_records,
            "latency_ms": latency_ms,
        })

    return {
        "status": "ok",
        "combined_xml": combined_xml,
        "update_sets": update_sets,
        "total_records": total_records,
        "file_count": len(file_paths),
        "latency_ms": latency_ms,
    }
