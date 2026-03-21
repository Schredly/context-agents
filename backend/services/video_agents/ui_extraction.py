"""Agent 2: UI Extraction — per-screen analysis of layout, colors, components, HTML/CSS."""

import base64
import json
import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

UI_EXTRACTION_SYSTEM = """\
You are a UI reverse-engineering agent. You analyze screenshots of software applications
and extract detailed UI structure.

For EACH screenshot, identify and return:

1. **components** — hierarchical list of UI components (sidebar, header, nav, form, table,
   modal, button, input, dropdown, tabs, cards, etc.) with approximate position
2. **color_palette** — every distinct color visible, as hex codes, with what it's used for
   (e.g. {"hex": "#1a73e8", "usage": "primary button background"})
3. **typography** — observed font sizes (sm/md/lg/xl), weights (normal/bold),
   and where they're used
4. **layout** — overall page structure (sidebar+main, top-nav+content, etc.),
   approximate grid/column structure
5. **html_skeleton** — a simplified HTML structure representing the page layout.
   Use semantic HTML (nav, header, main, aside, form, table, etc.).
   Include inline CSS for key styles (colors, layout, spacing).
   This should be enough to recreate the visual structure.
6. **text_labels** — all visible text labels, headings, button text, menu items
7. **data_elements** — any visible data (table columns, form field labels,
   dropdown options, list items)
8. **interactive_elements** — buttons, links, inputs, toggles, checkboxes with their labels

Return a JSON object:
{
  "screens": [
    {
      "screen_index": 0,
      "screen_description": "Main dashboard with sidebar navigation",
      "components": [...],
      "color_palette": [{"hex": "#xxx", "usage": "..."}],
      "typography": [{"size": "lg", "weight": "bold", "usage": "page title"}],
      "layout": {"type": "sidebar-main", "columns": 2, "description": "..."},
      "html_skeleton": "<div style='display:flex'>...",
      "text_labels": ["Dashboard", "Settings", ...],
      "data_elements": ["Priority", "Status", "Assigned To", ...],
      "interactive_elements": [{"type": "button", "label": "Create New", "style": "primary"}]
    }
  ]
}

Be extremely thorough — extract EVERY visible color, EVERY text label, EVERY component.
Return ONLY valid JSON — no markdown, no code fences.
"""


@dataclass
class ScreenAnalysis:
    screen_index: int = 0
    screen_description: str = ""
    components: list = field(default_factory=list)
    color_palette: list = field(default_factory=list)
    typography: list = field(default_factory=list)
    layout: dict = field(default_factory=dict)
    html_skeleton: str = ""
    text_labels: list = field(default_factory=list)
    data_elements: list = field(default_factory=list)
    interactive_elements: list = field(default_factory=list)


async def analyze_screens(
    frames: list,  # list of FrameInfo
    *,
    llm_config: dict,
    max_tokens: int = 16384,
    batch_size: int = 8,
) -> list[ScreenAnalysis]:
    """Send unique frames to vision LLM for detailed UI analysis.

    Batches frames to stay within token limits.
    """
    from services.claude_client import call_llm

    if not frames:
        return []

    results: list[ScreenAnalysis] = []

    for batch_start in range(0, len(frames), batch_size):
        batch = frames[batch_start:batch_start + batch_size]

        content_blocks = []
        content_blocks.append({
            "type": "text",
            "text": f"Analyze the following {len(batch)} application screenshots. "
                    f"Extract detailed UI structure for each one.",
        })

        for frame in batch:
            b64 = base64.b64encode(frame.image_bytes).decode()
            content_blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": b64,
                },
            })
            content_blocks.append({
                "type": "text",
                "text": f"[Screen {frame.index} at {frame.timestamp_sec:.1f}s — Scene {frame.scene_id}]",
            })

        content_blocks.append({
            "type": "text",
            "text": "Now return the detailed JSON analysis for ALL screens above.",
        })

        try:
            raw_response, meta = await call_llm(
                provider=llm_config["provider"],
                api_key=llm_config["api_key"],
                model=llm_config["model"],
                user_message="",
                system_prompt=UI_EXTRACTION_SYSTEM,
                max_tokens=max_tokens,
                content_blocks=content_blocks,
            )

            parsed = _extract_json(raw_response)
            if parsed and "screens" in parsed:
                for screen_data in parsed["screens"]:
                    results.append(ScreenAnalysis(
                        screen_index=screen_data.get("screen_index", len(results)),
                        screen_description=screen_data.get("screen_description", ""),
                        components=screen_data.get("components", []),
                        color_palette=screen_data.get("color_palette", []),
                        typography=screen_data.get("typography", []),
                        layout=screen_data.get("layout", {}),
                        html_skeleton=screen_data.get("html_skeleton", ""),
                        text_labels=screen_data.get("text_labels", []),
                        data_elements=screen_data.get("data_elements", []),
                        interactive_elements=screen_data.get("interactive_elements", []),
                    ))

            logger.info(
                "[ui_extraction] Batch %d-%d: extracted %d screen analyses",
                batch_start, batch_start + len(batch), len(results),
            )

        except Exception as exc:
            logger.error("[ui_extraction] Batch failed: %s", exc)

    return results


def _extract_json(raw: str) -> dict | None:
    """Extract JSON from LLM response."""
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
