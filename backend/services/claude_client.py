from __future__ import annotations

import json
import logging
import os
import time

import httpx

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"
CLAUDE_TIMEOUT = 30

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a resolution assistant for an IT service management system. \
Your job is to synthesize a resolution recommendation for a support ticket \
using only the evidence provided.

Rules:
- Never invent policies, procedures, or steps that are not supported by the provided sources.
- If the evidence is insufficient, say so clearly in the summary and include "questions to clarify" as recommended steps.
- Steps must be actionable and concise.
- Sources must only reference the document links provided — never fabricate URLs.
- Confidence must reflect the strength of evidence: lower when docs are missing or sparse.

Respond with ONLY valid JSON (no markdown, no code fences) matching this exact schema:
{
  "summary": "<string: one paragraph summarizing the recommendation>",
  "recommended_steps": ["<string: actionable step>", ...],
  "sources": [{"title": "<string>", "url": "<string>"}, ...],
  "confidence": <number between 0 and 1>
}\
"""


def _build_user_message(
    title: str,
    description: str,
    classification: list[dict[str, str]],
    sources: list[dict[str, str]],
    tenant_notes: str,
) -> str:
    parts = [f"**Ticket title:** {title}", f"**Description:** {description}"]

    if classification:
        path = " > ".join(f"{p['name']}: {p['value']}" for p in classification)
        parts.append(f"**Classification path:** {path}")

    if sources:
        doc_lines = []
        for s in sources:
            link = s.get("webViewLink") or s.get("url", "")
            doc_lines.append(f"- {s.get('name', s.get('title', 'Untitled'))}: {link}")
        parts.append("**Retrieved documents:**\n" + "\n".join(doc_lines))
    else:
        parts.append("**Retrieved documents:** None found.")

    if tenant_notes:
        parts.append(f"**Tenant policy notes:** {tenant_notes}")

    return "\n\n".join(parts)


class ClaudeClientError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.injected: bool = False


async def synthesize_resolution(
    title: str,
    description: str,
    classification: list[dict[str, str]],
    sources: list[dict[str, str]],
    tenant_notes: str = "",
) -> dict:
    """Call Claude to synthesize a resolution. Returns {summary, recommended_steps, sources, confidence}.

    Raises ClaudeClientError on failure (caller should fall back to placeholder).
    """
    # --- Failure injection ---
    if os.environ.get("FAIL_CLAUDE_SYNTHESIS", "").lower() == "true":
        logger.warning(
            "[INJECTED FAILURE] Claude synthesis: model=%s", CLAUDE_MODEL,
        )
        exc = ClaudeClientError("[INJECTED] Claude synthesis failure")
        exc.injected = True
        raise exc

    api_key = os.environ.get("CLAUDE_API_KEY", "")
    if not api_key:
        raise ClaudeClientError("CLAUDE_API_KEY not set")

    user_message = _build_user_message(
        title, description, classification, sources, tenant_notes
    )

    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": 1024,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_message}],
    }

    start = time.monotonic()
    async with httpx.AsyncClient(timeout=CLAUDE_TIMEOUT) as client:
        res = await client.post(
            CLAUDE_API_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
        )
    latency_ms = int((time.monotonic() - start) * 1000)

    if not res.is_success:
        detail = ""
        try:
            detail = res.json().get("error", {}).get("message", "")
        except Exception:
            pass
        logger.error(
            "Claude API failed: model=%s http_status=%d error=%s",
            CLAUDE_MODEL, res.status_code, detail or res.text[:200],
        )
        raise ClaudeClientError(
            f"Claude API returned {res.status_code}: {detail or res.text[:200]}"
        )

    body = res.json()

    # Extract text content from the response
    text = ""
    for block in body.get("content", []):
        if block.get("type") == "text":
            text += block["text"]

    if not text.strip():
        raise ClaudeClientError("Claude returned empty response")

    # Parse JSON — strip markdown fences if Claude added them despite instructions
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Remove opening fence (```json or ```)
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1 :]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ClaudeClientError(f"Failed to parse Claude JSON: {exc}")

    # Validate required keys
    for key in ("summary", "recommended_steps", "sources", "confidence"):
        if key not in result:
            raise ClaudeClientError(f"Missing key in Claude response: {key}")

    # Clamp confidence
    conf = result["confidence"]
    if not isinstance(conf, (int, float)):
        conf = 0.3
    result["confidence"] = max(0.0, min(1.0, float(conf)))

    # Attach metadata for the caller
    result["_meta"] = {
        "model": body.get("model", CLAUDE_MODEL),
        "latency_ms": latency_ms,
        "input_tokens": body.get("usage", {}).get("input_tokens"),
        "output_tokens": body.get("usage", {}).get("output_tokens"),
    }

    return result
