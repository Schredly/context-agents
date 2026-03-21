"""Agent 4: Application Structure — synthesize data model, workflows, relationships."""

import json
import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

APP_STRUCTURE_SYSTEM = """\
You are an application architecture analyst. You receive:
1. Detailed UI analysis of multiple screens from an application
2. Audio transcript from a video walkthrough of the application

Your job is to synthesize this information into a complete application genome —
the structural DNA of the application.

Extract:
1. **objects** — all data entities/tables/objects identified (with descriptions and key fields)
2. **fields** — all data fields with their types, validation rules, and which object they belong to
3. **workflows** — all processes, state machines, approval flows with their steps
4. **relationships** — connections between objects (with cardinality: 1:1, 1:N, N:M)
5. **navigation** — the application's navigation structure (menus, tabs, pages)
6. **roles_permissions** — any roles, permissions, or access controls observed
7. **integrations** — any external systems or APIs referenced

Return a JSON object:
{
  "application_name": "string",
  "vendor": "string",
  "source_platform": "string",
  "category": "string",
  "objects": [
    {
      "name": "incident",
      "description": "Tracks IT service disruptions",
      "key_fields": ["number", "short_description", "priority", "state", "assigned_to"]
    }
  ],
  "fields": [
    {
      "name": "priority",
      "type": "choice",
      "object": "incident",
      "options": ["1-Critical", "2-High", "3-Medium", "4-Low"],
      "required": true
    }
  ],
  "workflows": [
    {
      "name": "Incident Resolution",
      "steps": ["New", "In Progress", "On Hold", "Resolved", "Closed"],
      "triggers": ["assignment", "priority change"],
      "description": "Standard incident lifecycle"
    }
  ],
  "relationships": [
    {
      "from": "incident",
      "to": "change_request",
      "type": "1:N",
      "description": "An incident can spawn multiple change requests"
    }
  ],
  "navigation": [
    {"label": "Dashboard", "type": "menu_item", "children": []}
  ],
  "roles_permissions": ["admin", "agent", "requester"],
  "integrations": ["email", "LDAP"],
  "confidence": 0.85,
  "reasoning": ["step 1...", "step 2...", ...]
}

Be thorough. Cross-reference UI observations with spoken descriptions.
If something is mentioned in audio but not visible in UI, still include it with lower confidence.
Return ONLY valid JSON — no markdown, no code fences.
"""


@dataclass
class AppStructureResult:
    application_name: str = ""
    vendor: str = ""
    source_platform: str = ""
    category: str = ""
    objects: list = field(default_factory=list)
    fields: list = field(default_factory=list)
    workflows: list = field(default_factory=list)
    relationships: list = field(default_factory=list)
    navigation: list = field(default_factory=list)
    roles_permissions: list = field(default_factory=list)
    integrations: list = field(default_factory=list)
    confidence: float = 0.0
    reasoning: list = field(default_factory=list)
    raw: dict = field(default_factory=dict)


async def analyze_structure(
    ui_analyses: list,  # list of ScreenAnalysis
    transcript_text: str,
    transcript_correlations: dict,  # {frame_index: [text segments]}
    *,
    llm_config: dict,
    max_tokens: int = 16384,
) -> AppStructureResult:
    """Synthesize UI analysis + audio transcript into application structure."""
    from services.claude_client import call_llm

    ui_context = "## UI Analysis Results\n\n"
    for analysis in ui_analyses:
        ui_context += f"### Screen {analysis.screen_index}: {analysis.screen_description}\n"
        ui_context += f"- Components: {json.dumps(analysis.components)}\n"
        ui_context += f"- Data elements: {json.dumps(analysis.data_elements)}\n"
        ui_context += f"- Interactive elements: {json.dumps(analysis.interactive_elements)}\n"
        ui_context += f"- Text labels: {json.dumps(analysis.text_labels)}\n"
        ui_context += f"- Layout: {json.dumps(analysis.layout)}\n\n"

    audio_context = ""
    if transcript_text:
        audio_context = f"## Audio Transcript\n\n{transcript_text}\n\n"
        if transcript_correlations:
            audio_context += "## Transcript-to-Screen Correlations\n\n"
            for frame_idx, texts in sorted(transcript_correlations.items()):
                audio_context += f"Screen {frame_idx}: {' '.join(texts)}\n"

    user_message = (
        f"{ui_context}\n{audio_context}\n\n"
        "Based on the UI analysis and audio transcript above, "
        "extract the complete application structure genome."
    )

    try:
        raw_response, meta = await call_llm(
            provider=llm_config["provider"],
            api_key=llm_config["api_key"],
            model=llm_config["model"],
            user_message=user_message,
            system_prompt=APP_STRUCTURE_SYSTEM,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        logger.error("[app_structure] LLM call failed: %s", exc)
        return AppStructureResult()

    parsed = _extract_json(raw_response)
    if not parsed:
        logger.warning("[app_structure] Failed to parse LLM response")
        return AppStructureResult()

    result = AppStructureResult(
        application_name=parsed.get("application_name", ""),
        vendor=parsed.get("vendor", ""),
        source_platform=parsed.get("source_platform", ""),
        category=parsed.get("category", ""),
        objects=parsed.get("objects", []),
        fields=parsed.get("fields", []),
        workflows=parsed.get("workflows", []),
        relationships=parsed.get("relationships", []),
        navigation=parsed.get("navigation", []),
        roles_permissions=parsed.get("roles_permissions", []),
        integrations=parsed.get("integrations", []),
        confidence=parsed.get("confidence", 0.0),
        reasoning=parsed.get("reasoning", []),
        raw=parsed,
    )

    logger.info(
        "[app_structure] Extracted: %d objects, %d fields, %d workflows, %d relationships",
        len(result.objects), len(result.fields), len(result.workflows), len(result.relationships),
    )
    return result


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
