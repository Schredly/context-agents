from __future__ import annotations

import json
import logging
import os
import time

import httpx

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"
CLAUDE_TIMEOUT = 120

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

KB_SYSTEM_PROMPT = """\
You are a resolution assistant for an IT service management system. \
Your job is to synthesize a resolution recommendation ONLY from the provided \
knowledge base documents. Do NOT add external knowledge or invent information.

Rules:
- Answer ONLY from the provided documents. Do not add external knowledge.
- If the documents are insufficient, say so clearly and lower confidence.
- Steps must be actionable and concise.
- Sources must only reference the document links provided — never fabricate URLs.
- Confidence must reflect how well the documents address the ticket.

Respond with ONLY valid JSON (no markdown, no code fences) matching this exact schema:
{
  "summary": "<string: one paragraph summarizing the recommendation>",
  "recommended_steps": ["<string: actionable step>", ...],
  "sources": [{"title": "<string>", "url": "<string>"}, ...],
  "confidence": <number between 0 and 1>
}\
"""

LLM_ONLY_SYSTEM_PROMPT = """\
You are a resolution assistant for an IT service management system. \
Your job is to synthesize a resolution recommendation for a support ticket \
using your own knowledge and reasoning. No knowledge base documents are available.

Rules:
- Use your knowledge to provide the best possible resolution.
- Steps must be actionable and concise.
- Do not reference any documents or URLs since none are provided.
- Sources array should be empty.
- Confidence should reflect your certainty in the recommendation (typically moderate without docs).

Respond with ONLY valid JSON (no markdown, no code fences) matching this exact schema:
{
  "summary": "<string: one paragraph summarizing the recommendation>",
  "recommended_steps": ["<string: actionable step>", ...],
  "sources": [],
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


OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"


def _clean_key(key: str) -> str:
    """Strip whitespace, invisible Unicode characters, and extract the actual API key
    if the user pasted surrounding text (e.g. 'OpenAI API Key: sk-proj-abc123')."""
    import re
    import unicodedata
    # Remove invisible / control characters
    cleaned = "".join(ch for ch in key.strip() if unicodedata.category(ch)[0] != "C")
    # Try to extract an OpenAI key (sk-... pattern, at least 20 chars of alphanumeric/dash/underscore)
    m = re.search(r"(sk-[A-Za-z0-9_-]{20,})", cleaned)
    if m:
        return m.group(1)
    # Try to extract an Anthropic key (sk-ant-... pattern)
    m = re.search(r"(sk-ant-[A-Za-z0-9_-]{20,})", cleaned)
    if m:
        return m.group(1)
    return cleaned


async def test_api_key(provider: str, api_key: str, model: str) -> None:
    """Validate an API key by making a minimal API call. Raises ClaudeClientError on failure."""
    api_key = _clean_key(api_key)
    if provider == "anthropic":
        payload = {
            "model": model,
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "Hi"}],
        }
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                CLAUDE_API_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=payload,
            )
        if not res.is_success:
            detail = ""
            try:
                detail = res.json().get("error", {}).get("message", "")
            except Exception:
                pass
            raise ClaudeClientError(
                f"Anthropic API returned {res.status_code}: {detail or res.text[:200]}"
            )
    elif provider == "openai":
        payload: dict = {
            "model": model,
            "max_completion_tokens": 128,
            "messages": [
                {"role": "user", "content": "Hi"},
            ],
        }
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(
                OPENAI_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if not res.is_success:
            detail = ""
            try:
                detail = res.json().get("error", {}).get("message", "")
            except Exception:
                pass
            raise ClaudeClientError(
                f"OpenAI API returned {res.status_code}: {detail or res.text[:200]}"
            )
    else:
        raise ClaudeClientError(f"Unsupported provider: {provider}")


async def _call_anthropic(api_key: str, model: str, user_message: str, *, system_prompt: str = SYSTEM_PROMPT, content_blocks: list[dict] | None = None) -> tuple[str, dict]:
    """Call the Anthropic Messages API. Returns (response_text, raw_body)."""
    payload = {
        "model": model,
        "max_tokens": 16384,
        "system": system_prompt,
        "messages": [{"role": "user", "content": content_blocks if content_blocks else user_message}],
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
            "Anthropic API failed: model=%s http_status=%d error=%s",
            model, res.status_code, detail or res.text[:200],
        )
        raise ClaudeClientError(
            f"Anthropic API returned {res.status_code}: {detail or res.text[:200]}"
        )

    body = res.json()
    text = ""
    for block in body.get("content", []):
        if block.get("type") == "text":
            text += block["text"]

    meta = {
        "model": body.get("model", model),
        "latency_ms": latency_ms,
        "input_tokens": body.get("usage", {}).get("input_tokens"),
        "output_tokens": body.get("usage", {}).get("output_tokens"),
    }
    return text, meta


_OPENAI_REASONING_MODELS = {"o3", "o3-mini", "o3-pro", "o4-mini"}


def _is_reasoning_model(model: str) -> bool:
    """Check if a model is an OpenAI reasoning model (o-series)."""
    base = model.split("-")[0]
    # Match "o3", "o4" etc. Also check the full model with date stripped
    if base in ("o1", "o3", "o4"):
        return True
    return model in _OPENAI_REASONING_MODELS


async def _call_openai(api_key: str, model: str, user_message: str, *, system_prompt: str = SYSTEM_PROMPT, max_tokens: int = 16384, content_blocks: list[dict] | None = None) -> tuple[str, dict]:
    """Call the OpenAI Chat Completions API. Returns (response_text, raw_meta)."""
    # Reasoning models (o-series) use "developer" role instead of "system"
    # and need higher token limits for chain-of-thought overhead
    sys_role = "developer" if _is_reasoning_model(model) else "system"
    token_limit = max_tokens

    # Map content_blocks for OpenAI
    if content_blocks:
        openai_content = []
        for block in content_blocks:
            if block.get("type") == "image":
                src = block["source"]
                openai_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{src['media_type']};base64,{src['data']}"}
                })
            elif block.get("type") == "text":
                openai_content.append({"type": "text", "text": block["text"]})
        user_content = openai_content
    else:
        user_content = user_message

    payload: dict = {
        "model": model,
        "max_completion_tokens": token_limit,
        "messages": [
            {"role": sys_role, "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    }

    import asyncio as _asyncio

    start = time.monotonic()
    res = None
    for attempt in range(3):
        async with httpx.AsyncClient(timeout=CLAUDE_TIMEOUT) as client:
            res = await client.post(
                OPENAI_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if res.status_code == 429:
            wait = min(2 ** attempt * 3, 10)
            logger.warning("OpenAI rate limited (429), retrying in %ds (attempt %d/3)", wait, attempt + 1)
            await _asyncio.sleep(wait)
            continue
        break
    latency_ms = int((time.monotonic() - start) * 1000)

    if res is None or not res.is_success:
        detail = ""
        try:
            detail = res.json().get("error", {}).get("message", "") if res else "No response"
        except Exception:
            pass
        logger.error(
            "OpenAI API failed: model=%s http_status=%d error=%s",
            model, res.status_code if res else 0, detail or (res.text[:200] if res else "timeout"),
        )
        raise ClaudeClientError(
            f"OpenAI API returned {res.status_code if res else 'timeout'}: {detail or (res.text[:200] if res else '')}"
        )

    body = res.json()
    text = ""
    choices = body.get("choices", [])
    if choices:
        text = choices[0].get("message", {}).get("content", "")

    usage = body.get("usage", {})
    meta = {
        "model": body.get("model", model),
        "latency_ms": latency_ms,
        "input_tokens": usage.get("prompt_tokens"),
        "output_tokens": usage.get("completion_tokens"),
    }
    return text, meta


async def call_llm(provider: str, api_key: str, model: str,
                   user_message: str, system_prompt: str, max_tokens: int = 16384,
                   content_blocks: list[dict] | None = None) -> tuple[str, dict]:
    """Generic LLM call — dispatches to the right provider."""
    api_key = _clean_key(api_key)
    if provider == "openai":
        return await _call_openai(api_key, model, user_message, system_prompt=system_prompt, max_tokens=max_tokens, content_blocks=content_blocks)
    return await _call_anthropic(api_key, model, user_message, system_prompt=system_prompt, content_blocks=content_blocks)


async def synthesize_resolution(
    title: str,
    description: str,
    classification: list[dict[str, str]],
    sources: list[dict[str, str]],
    tenant_notes: str = "",
    *,
    provider: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
    include_sources: bool = True,
) -> dict:
    """Call an LLM to synthesize a resolution. Returns {summary, recommended_steps, sources, confidence}.

    Raises ClaudeClientError on failure (caller should fall back to placeholder).
    """
    # --- Failure injection ---
    if os.environ.get("FAIL_CLAUDE_SYNTHESIS", "").lower() == "true":
        logger.warning(
            "[INJECTED FAILURE] Claude synthesis: model=%s", model or CLAUDE_MODEL,
        )
        exc = ClaudeClientError("[INJECTED] Claude synthesis failure")
        exc.injected = True
        raise exc

    # Resolve provider / key / model with fallbacks
    effective_provider = provider or "anthropic"
    effective_key = _clean_key(api_key or os.environ.get("CLAUDE_API_KEY", ""))
    effective_model = model or CLAUDE_MODEL

    if not effective_key:
        raise ClaudeClientError("No API key configured (set via Settings or CLAUDE_API_KEY env var)")

    effective_sources = sources if include_sources else []
    system_prompt = LLM_ONLY_SYSTEM_PROMPT if not include_sources else SYSTEM_PROMPT

    user_message = _build_user_message(
        title, description, classification, effective_sources, tenant_notes
    )

    # Dispatch to the right provider
    if effective_provider == "anthropic":
        text, meta = await _call_anthropic(effective_key, effective_model, user_message, system_prompt=system_prompt)
    elif effective_provider == "openai":
        text, meta = await _call_openai(effective_key, effective_model, user_message, system_prompt=system_prompt)
    else:
        raise ClaudeClientError(f"Unsupported LLM provider: {effective_provider}")

    if not text.strip():
        raise ClaudeClientError("LLM returned empty response")

    # Parse JSON — strip markdown fences if the model added them despite instructions
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
        raise ClaudeClientError(f"Failed to parse LLM JSON: {exc}")

    # Validate required keys
    for key in ("summary", "recommended_steps", "sources", "confidence"):
        if key not in result:
            raise ClaudeClientError(f"Missing key in LLM response: {key}")

    # Clamp confidence
    conf = result["confidence"]
    if not isinstance(conf, (int, float)):
        conf = 0.3
    result["confidence"] = max(0.0, min(1.0, float(conf)))

    # Attach metadata for the caller
    result["_meta"] = meta

    return result


async def synthesize_from_docs(
    title: str,
    description: str,
    classification: list[dict[str, str]],
    sources: list[dict[str, str]],
    tenant_notes: str = "",
    *,
    provider: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
) -> dict:
    """Synthesize a resolution from KB documents only. Same return shape as synthesize_resolution."""
    # Resolve provider / key / model with fallbacks
    effective_provider = provider or "anthropic"
    effective_key = _clean_key(api_key or os.environ.get("CLAUDE_API_KEY", ""))
    effective_model = model or CLAUDE_MODEL

    if not effective_key:
        raise ClaudeClientError("No API key configured (set via Settings or CLAUDE_API_KEY env var)")

    user_message = _build_user_message(
        title, description, classification, sources, tenant_notes
    )

    if effective_provider == "anthropic":
        text, meta = await _call_anthropic(effective_key, effective_model, user_message, system_prompt=KB_SYSTEM_PROMPT)
    elif effective_provider == "openai":
        text, meta = await _call_openai(effective_key, effective_model, user_message, system_prompt=KB_SYSTEM_PROMPT)
    else:
        raise ClaudeClientError(f"Unsupported LLM provider: {effective_provider}")

    if not text.strip():
        raise ClaudeClientError("LLM returned empty response")

    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1 :]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ClaudeClientError(f"Failed to parse LLM JSON: {exc}")

    for key in ("summary", "recommended_steps", "sources", "confidence"):
        if key not in result:
            raise ClaudeClientError(f"Missing key in LLM response: {key}")

    conf = result["confidence"]
    if not isinstance(conf, (int, float)):
        conf = 0.3
    result["confidence"] = max(0.0, min(1.0, float(conf)))
    result["_meta"] = meta

    return result
