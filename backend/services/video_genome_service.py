"""Video Genome Service — extract frames from video, build vision prompt, analyze with LLM."""

from __future__ import annotations

import base64
import logging
import os
import subprocess
import tempfile

logger = logging.getLogger(__name__)


def extract_frames(video_path: str, interval_seconds: int = 3, max_frames: int = 20) -> list[bytes]:
    """Extract frames from a video at regular intervals using ffmpeg. Returns list of JPEG bytes."""
    with tempfile.TemporaryDirectory() as tmpdir:
        out_pattern = os.path.join(tmpdir, "frame_%04d.jpg")
        cmd = [
            "ffmpeg", "-i", video_path,
            "-vf", f"fps=1/{interval_seconds}",
            "-frames:v", str(max_frames),
            "-q:v", "2",
            out_pattern,
            "-y", "-loglevel", "error",
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        except FileNotFoundError:
            logger.error("ffmpeg not found. Install ffmpeg to use Video Genome.")
            return []
        except subprocess.CalledProcessError as e:
            logger.error("ffmpeg failed: %s", e.stderr.decode()[:300])
            return []

        frames = []
        for fname in sorted(os.listdir(tmpdir)):
            if fname.endswith(".jpg"):
                with open(os.path.join(tmpdir, fname), "rb") as f:
                    frames.append(f.read())
        return frames


def extract_audio_text(video_path: str) -> str:
    """Extract and transcribe audio from video. Returns transcript or empty string."""
    # For MVP, use ffmpeg to check if audio exists, but return empty.
    # Audio transcription can be added later with Whisper API.
    try:
        result = subprocess.run(
            ["ffmpeg", "-i", video_path, "-f", "null", "-"],
            capture_output=True, timeout=30,
        )
        # Just log that audio exists
        stderr = result.stderr.decode()
        has_audio = "Audio:" in stderr
        if has_audio:
            logger.info("[video_genome] Video has audio track (transcription not yet implemented)")
    except Exception:
        pass
    return ""


VIDEO_GENOME_SYSTEM = """\
You are an application genome extraction agent for the OverYonder platform.

You are analyzing screenshots (frames) from a video recording of someone demonstrating
a piece of software. Your job is to identify the application's structure and produce
a genome document.

From the video frames, identify:
1. **Objects** — tables, entities, data objects visible in the UI (e.g., "incident", "catalog_item", "user")
2. **Fields** — form fields, columns, data attributes you can see (e.g., "priority", "assigned_to", "status")
3. **Workflows** — processes, approval flows, state transitions demonstrated (e.g., "ticket submission", "escalation")
4. **Relationships** — connections between objects (e.g., "incident → user", "catalog_item → category")
5. **UI Components** — forms, lists, dashboards, reports visible
6. **Application Name** — identify what application/module is being demonstrated

Return ONLY a valid JSON object with this structure:
{
  "application_name": "string",
  "vendor": "string (e.g. ServiceNow, Salesforce, custom)",
  "source_platform": "string",
  "category": "string",
  "genome_document": {
    "objects": ["list of identified objects/tables"],
    "fields": ["list of identified fields"],
    "workflows": ["list of identified workflows/processes"],
    "relationships": ["list of identified relationships"]
  },
  "reasoning": ["step 1...", "step 2...", ...],
  "confidence": 0.0 to 1.0,
  "summary": "one paragraph describing what was observed"
}

Be thorough — examine every frame carefully for UI elements, navigation, forms, and data.
Return ONLY valid JSON — no markdown, no code fences.
"""


def build_vision_content_blocks(frames: list[bytes], audio_text: str = "", user_notes: str = "") -> list[dict]:
    """Build Anthropic-compatible content blocks with images + text."""
    blocks: list[dict] = []

    # Add text context first
    text_parts = []
    if user_notes:
        text_parts.append(f"User notes about this software demo:\n{user_notes}")
    if audio_text:
        text_parts.append(f"Transcribed audio from the demo:\n{audio_text}")
    text_parts.append(
        f"The following {len(frames)} frame(s) are screenshots extracted from a video "
        f"of someone demonstrating a piece of software. Analyze them to extract the application genome."
    )
    blocks.append({"type": "text", "text": "\n\n".join(text_parts)})

    # Add image blocks
    for frame_bytes in frames:
        b64 = base64.b64encode(frame_bytes).decode("utf-8")
        blocks.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": b64,
            },
        })

    # Final instruction
    blocks.append({
        "type": "text",
        "text": "Now analyze all the frames above and extract the application genome. Return ONLY valid JSON.",
    })

    return blocks


async def analyze_video_for_genome(
    video_path: str,
    llm_cfg: dict,
    max_tokens: int = 16384,
    user_notes: str = "",
) -> tuple[str, dict]:
    """Full pipeline: extract frames → build vision prompt → call LLM → return raw response + meta."""
    from services.claude_client import call_llm

    frames = extract_frames(video_path)
    if not frames:
        raise RuntimeError("No frames extracted from video. Is ffmpeg installed?")

    audio_text = extract_audio_text(video_path)
    content_blocks = build_vision_content_blocks(frames, audio_text, user_notes)

    logger.info("[video_genome] Sending %d frames to LLM for analysis", len(frames))

    raw_response, meta = await call_llm(
        provider=llm_cfg["provider"],
        api_key=llm_cfg["api_key"],
        model=llm_cfg["model"],
        user_message="",  # not used when content_blocks is provided
        system_prompt=VIDEO_GENOME_SYSTEM,
        max_tokens=max_tokens,
        content_blocks=content_blocks,
    )

    return raw_response, meta
