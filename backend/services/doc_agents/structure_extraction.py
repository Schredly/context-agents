"""Structure Extraction Agent — use LLM to extract genome structure from document text."""

from __future__ import annotations

import json
import logging
import time

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an application genome extraction specialist. You analyze product documentation
and extract a structured genome describing the application's data model, fields, workflows, and relationships.

Return a JSON object with this exact structure:
{
  "application_name": "string — name of the application/product",
  "vendor": "string — software vendor",
  "category": "string — application category",
  "summary": "string — 2-3 sentence summary of the application",
  "source_platform": "Documentation",
  "confidence": 0.0-1.0,
  "genome_document": {
    "objects": [{"name": "string", "label": "string", "description": "string", "type": "string"}],
    "fields": [{"name": "string", "label": "string", "type": "string", "object": "string", "required": true/false, "description": "string"}],
    "workflows": [{"name": "string", "description": "string", "trigger": "string", "steps": ["string"]}],
    "relationships": [{"from_object": "string", "to_object": "string", "type": "string", "description": "string"}]
  }
}

Extract as many objects, fields, workflows, and relationships as the documentation describes.
Be thorough — capture every entity, table, form, data object, configuration, and process flow mentioned.
For fields, identify the parent object they belong to.
For workflows, capture approval chains, automation rules, state transitions, and business processes."""


async def extract_structure(
    full_text: str,
    sections: list[dict],
    vendor: str,
    product_area: str,
    module: str,
    user_notes: str,
    llm_config: dict,
    max_tokens: int = 16384,
    on_progress=None,
) -> dict:
    """Use LLM to extract genome structure from parsed document text.

    Returns:
        {
            "status": "ok",
            "genome": {...},
            "latency_ms": int,
        }
    """
    t0 = time.time()
    if on_progress:
        await on_progress("structure_extraction", "running", {})

    from services.claude_client import call_llm

    # Build user prompt with document content
    doc_content = full_text[:80000]  # Limit to ~80k chars to stay within token limits

    user_message = f"""Analyze this product documentation and extract the application genome.

Vendor: {vendor}
Product Area: {product_area}
Module: {module}
{f'Additional context: {user_notes}' if user_notes else ''}

--- DOCUMENT CONTENT ---
{doc_content}
--- END DOCUMENT ---

Extract a complete genome JSON from this documentation. Be thorough — capture every object, field,
workflow, and relationship mentioned. Return ONLY the JSON object, no markdown fences."""

    try:
        raw_text, meta = await call_llm(
            provider=llm_config["provider"],
            api_key=llm_config["api_key"],
            model=llm_config["model"],
            user_message=user_message,
            system_prompt=SYSTEM_PROMPT,
            max_tokens=max_tokens,
        )

        # Parse JSON from response
        genome = _extract_json(raw_text)
        if not genome:
            # Try to salvage partial JSON
            genome = {
                "application_name": "",
                "vendor": vendor,
                "summary": raw_text[:500],
                "source_platform": "Documentation",
                "confidence": 0.3,
                "genome_document": {"objects": [], "fields": [], "workflows": [], "relationships": []},
            }

        # Ensure required fields
        genome.setdefault("vendor", vendor)
        genome.setdefault("source_platform", "Documentation")
        genome.setdefault("genome_document", {})
        gd = genome["genome_document"]
        gd.setdefault("objects", [])
        gd.setdefault("fields", [])
        gd.setdefault("workflows", [])
        gd.setdefault("relationships", [])

        latency_ms = int((time.time() - t0) * 1000)

        if on_progress:
            await on_progress("structure_extraction", "done", {
                "objects": len(gd["objects"]),
                "fields": len(gd["fields"]),
                "workflows": len(gd["workflows"]),
                "relationships": len(gd["relationships"]),
                "latency_ms": latency_ms,
            })

        return {
            "status": "ok",
            "genome": genome,
            "meta": meta,
            "latency_ms": latency_ms,
        }

    except Exception as exc:
        logger.error("[structure_extraction] LLM call failed: %s", exc)
        if on_progress:
            await on_progress("structure_extraction", "error", {"error": str(exc)})
        return {"status": "error", "error": str(exc)}


def _extract_json(text: str) -> dict | None:
    """Try to extract a JSON object from LLM response text."""
    import re
    # Strip markdown code fences
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object boundaries
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    return None
    return None
