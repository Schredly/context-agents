"""Agent 5: Synthesis & Validation — merge all agent outputs into final genome bundle."""

import json
import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

SYNTHESIS_SYSTEM = """\
You are a genome synthesis and validation agent. You receive the outputs from multiple
analysis agents and must merge them into a final, validated application genome.

You receive:
1. Application structure (objects, fields, workflows, relationships)
2. UI design tokens (colors, typography, layout patterns)
3. Screen-by-screen HTML skeletons

Your job:
1. VALIDATE — check for inconsistencies, duplicates, or conflicts between agent outputs
2. MERGE — combine into a single authoritative genome document
3. ENRICH — add any inferences from cross-referencing the data
4. SCORE — assign confidence scores per section

Return a JSON object:
{
  "application_name": "string",
  "vendor": "string",
  "source_platform": "string",
  "category": "string",
  "summary": "One paragraph describing the application",
  "confidence": 0.0 to 1.0,
  "genome_document": {
    "objects": ["flat list of object names for backward compatibility"],
    "fields": ["flat list of field names"],
    "workflows": ["flat list of workflow names"],
    "relationships": ["flat list like 'incident -> change_request'"]
  },
  "structured_objects": [
    {"name": "...", "description": "...", "key_fields": [...]}
  ],
  "structured_fields": [
    {"name": "...", "type": "...", "object": "...", "required": false}
  ],
  "structured_workflows": [
    {"name": "...", "steps": [...], "description": "..."}
  ],
  "structured_relationships": [
    {"from": "...", "to": "...", "type": "1:N", "description": "..."}
  ],
  "design_tokens": {
    "colors": [{"hex": "#xxx", "usage": "primary", "css_var": "--color-primary"}],
    "typography": [{"size": "...", "weight": "...", "usage": "..."}],
    "spacing": "observations about spacing patterns",
    "layout_patterns": ["sidebar-main", "card-grid", ...]
  },
  "navigation_map": [...],
  "screen_count": 0,
  "validation_notes": ["any inconsistencies or gaps found"],
  "reasoning": ["step 1...", "step 2...", ...]
}

The genome_document field (flat lists) ensures backward compatibility with the existing system.
The structured_* fields provide the richer detail.
Return ONLY valid JSON — no markdown, no code fences.
"""


@dataclass
class SynthesisResult:
    genome: dict = field(default_factory=dict)
    design_tokens: dict = field(default_factory=dict)
    validation_notes: list = field(default_factory=list)
    confidence: float = 0.0
    reasoning: list = field(default_factory=list)


async def synthesize_and_validate(
    app_structure,     # AppStructureResult
    ui_analyses: list,  # list of ScreenAnalysis
    transcript_text: str,
    *,
    llm_config: dict,
    max_tokens: int = 16384,
) -> SynthesisResult:
    """Merge all agent outputs into a final validated genome."""
    from services.claude_client import call_llm

    structure_json = json.dumps({
        "application_name": app_structure.application_name,
        "vendor": app_structure.vendor,
        "source_platform": app_structure.source_platform,
        "category": app_structure.category,
        "objects": app_structure.objects,
        "fields": app_structure.fields,
        "workflows": app_structure.workflows,
        "relationships": app_structure.relationships,
        "navigation": app_structure.navigation,
        "roles_permissions": app_structure.roles_permissions,
    }, indent=2)

    all_colors = []
    all_typography = []
    all_layouts = []
    for ua in ui_analyses:
        all_colors.extend(ua.color_palette)
        all_typography.extend(ua.typography)
        if ua.layout:
            all_layouts.append(ua.layout)

    design_input = json.dumps({
        "colors": all_colors,
        "typography": all_typography,
        "layouts": all_layouts,
        "html_skeletons_count": sum(1 for ua in ui_analyses if ua.html_skeleton),
    }, indent=2)

    user_message = (
        f"## Application Structure\n```json\n{structure_json}\n```\n\n"
        f"## UI Design Tokens\n```json\n{design_input}\n```\n\n"
        f"## Audio Context\n{transcript_text[:3000] if transcript_text else 'No audio available'}\n\n"
        f"Screen count: {len(ui_analyses)}\n\n"
        "Synthesize, validate, and merge these into a final genome document."
    )

    try:
        raw_response, meta = await call_llm(
            provider=llm_config["provider"],
            api_key=llm_config["api_key"],
            model=llm_config["model"],
            user_message=user_message,
            system_prompt=SYNTHESIS_SYSTEM,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        logger.error("[synthesis] LLM call failed: %s", exc)
        return _fallback_merge(app_structure, ui_analyses)

    parsed = _extract_json(raw_response)
    if not parsed:
        logger.warning("[synthesis] Failed to parse LLM response, using fallback")
        return _fallback_merge(app_structure, ui_analyses)

    result = SynthesisResult(
        genome=parsed,
        design_tokens=parsed.get("design_tokens", {}),
        validation_notes=parsed.get("validation_notes", []),
        confidence=parsed.get("confidence", 0.0),
        reasoning=parsed.get("reasoning", []),
    )

    logger.info("[synthesis] Final genome: confidence=%.2f, %d validation notes",
                result.confidence, len(result.validation_notes))
    return result


def _fallback_merge(app_structure, ui_analyses) -> SynthesisResult:
    """Non-LLM fallback: mechanically merge agent outputs."""
    objects = [o["name"] if isinstance(o, dict) else str(o) for o in app_structure.objects]
    fields = [f["name"] if isinstance(f, dict) else str(f) for f in app_structure.fields]
    workflows = [w["name"] if isinstance(w, dict) else str(w) for w in app_structure.workflows]
    relationships = []
    for r in app_structure.relationships:
        if isinstance(r, dict):
            relationships.append(f"{r.get('from', '?')} -> {r.get('to', '?')}")
        else:
            relationships.append(str(r))

    all_colors = []
    for ua in ui_analyses:
        all_colors.extend(ua.color_palette)

    return SynthesisResult(
        genome={
            "application_name": app_structure.application_name,
            "vendor": app_structure.vendor,
            "source_platform": app_structure.source_platform,
            "category": app_structure.category,
            "genome_document": {
                "objects": objects,
                "fields": fields,
                "workflows": workflows,
                "relationships": relationships,
            },
            "structured_objects": app_structure.objects,
            "structured_fields": app_structure.fields,
            "structured_workflows": app_structure.workflows,
            "structured_relationships": app_structure.relationships,
            "design_tokens": {"colors": all_colors},
            "confidence": app_structure.confidence,
            "summary": f"Application genome for {app_structure.application_name}",
        },
        design_tokens={"colors": all_colors},
        confidence=app_structure.confidence,
    )


def _extract_json(raw: str) -> dict | None:
    text = raw.strip()
    fence_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", text)
    if fence_match:
        text = fence_match.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last > first:
        try:
            return json.loads(text[first:last + 1])
        except json.JSONDecodeError:
            pass
    return None
