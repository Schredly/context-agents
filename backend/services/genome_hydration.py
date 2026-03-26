"""Progressive Context Hydration for Genome Transformations.

Instead of dumping the entire genome into a single LLM prompt, this service:
1. Sends a lightweight genome INDEX (file tree, no content) to the LLM
2. The LLM requests specific files it needs
3. The system fetches ONLY those files from GitHub
4. The LLM reasons over the fetched context and either requests more or produces output

This turns GitHub from a file store into a dynamic context provider.
"""

from __future__ import annotations

import json
import logging
import time
from typing import AsyncGenerator

from providers.github_provider import list_tree, get_file
from services.claude_client import call_llm_multi_turn
from services.hydration_guard import Guard

logger = logging.getLogger(__name__)

# --- Configuration ---
MAX_ROUNDS = 6          # max hydration iterations
MAX_FILES_PER_ROUND = 10  # max files the LLM can request per round
MAX_FILE_CHARS = 8000   # per-file content cap
CONTEXT_BUDGET = 120_000  # total accumulated chars before forcing output

# --- System prompt ---
HYDRATION_SYSTEM = """\
You are a genome transformation agent for the OverYonder platform.

You operate in a RETRIEVAL LOOP pattern. You receive the genome entity index first,
then explicitly request only the specific files you need before building anything.

## PROTOCOL

You MUST respond with ONLY valid JSON (no markdown fences, no prose outside JSON).
Choose ONE of two response shapes per turn:

### Shape 1 — Request more files (you need more context)
{
  "plan": [
    "Step describing what you are doing and why",
    "Another step..."
  ],
  "required_files": ["structure/entities.json", "structure/workflows.json"]
}

Rules for required_files:
- List at most 10 file paths per round
- Only request files that appear in the repository file list
- Prefer structure/*.json, genome.yaml, graph.yaml over raw data files
- Request config/ and data/ files only if critical for the transformation
- You will receive the file contents in the next turn

### Shape 2 — Signal ready (you have enough context, no more files needed)
{
  "plan": ["≤5 short step labels"],
  "ready": true,
  "files_to_produce": ["transformations/CLAUDE.md", "transformations/seed.json"]
}

Use this shape when you have fetched enough files and are ready to write output.
The system will then ask you to produce each file separately — you do NOT write
file content in this response. Just declare what files you will produce.

## CRITICAL RULE — RETRIEVAL BEFORE BUILD

You MUST NOT generate a full application specification immediately.
You MUST first:

1. Analyze the entity index (genome.index.json)
2. Identify which structure files contain the information you need
3. Request those files via required_files

Only produce output AFTER you have fetched and read at least one structure file.
If you violate this rule your response WILL BE REJECTED and you must retry.

## RETRIEVAL STRATEGY

Round 1: Analyze genome.index.json. Declare your plan and request the specific
         structure files you need (forms, workflows, tables, ui). Do NOT signal
         ready yet — you have not read any files.
Round 2: Based on what you read, fetch any remaining detail files required.
Round 3+: Fetch targeted config or data files if necessary, then signal ready.

You have a maximum of 5 retrieval rounds before you MUST signal ready.

## RULES

- NEVER request the full genome unless no index or structure files exist
- Each plan[] entry MUST be ≤12 words — short labels, not prose explanations
- Keep plan[] to 3–5 items maximum
- All new files MUST go under a 'transformations/' subfolder
- Never overwrite original genome files (genome.yaml, graph.yaml, structure/*)
- Return ONLY valid JSON — no markdown fences, no prose outside the JSON object
"""


def _build_index(tree: list[dict], prefix: str = "") -> list[dict]:
    """Flatten a GitHub tree into an index of {path, type, name} entries."""
    entries = []
    for node in tree:
        path = f"{prefix}/{node['name']}" if prefix else node["name"]
        entry = {"path": path, "name": node["name"], "type": node.get("type", "file")}
        entries.append(entry)
        if node.get("children"):
            entries.extend(_build_index(node["children"], path))
    return entries


def _format_index(entries: list[dict]) -> str:
    """Format the index as a compact tree string for the LLM."""
    lines = []
    for e in entries:
        depth = e["path"].count("/")
        indent = "  " * depth
        icon = "dir" if e["type"] in ("dir", "folder") else "file"
        lines.append(f"{indent}{icon}: {e['name']}")
    return "\n".join(lines)


def _parse_llm_response(raw: str) -> dict | None:
    """Extract JSON from LLM response, handling markdown fences."""
    import re
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    # Try parsing as-is
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try finding first { ... } block
    start = text.find("{")
    if start >= 0:
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
                        break
    return None


def _is_truncated_json(raw: str, stop_reason: str | None = None) -> bool:
    """Return True if the response was cut off before the JSON closed.

    Uses stop_reason='max_tokens' from the API as the authoritative signal when available.
    Falls back to structural heuristics (strip fences, attempt parse).
    """
    # Authoritative signal from the API
    if stop_reason == "max_tokens":
        return True

    import re as _re
    text = raw.strip()
    # Strip markdown fences before checking structure
    fence = _re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", text)
    if fence:
        # Response has a closing fence — not truncated at the JSON level
        return False
    # Strip opening fence if present without a closing one (truncated inside a fence)
    text = _re.sub(r"^```(?:json)?\s*\n?", "", text).strip()

    if not text.startswith("{"):
        return False
    try:
        json.loads(text)
        return False
    except json.JSONDecodeError:
        return True


MAX_CONTINUATION_ATTEMPTS = 2  # retries to complete a truncated JSON response


async def hydration_loop(
    *,
    llm_cfg: dict,
    base_path: str,
    app,
    extra_system: str = "",
    initial_user_context: str = "",
    max_tokens: int = 16384,
) -> AsyncGenerator[dict, None]:
    """Run the progressive hydration loop, yielding SSE-style events.

    Yields dicts like:
        {"type": "phase", "data": {"phase": "indexing", "message": "..."}}
        {"type": "file_fetched", "data": {"path": "...", "size": 123, "round": 1}}
        {"type": "llm_reasoning", "data": {"message": "...", "round": 1}}
        {"type": "result", "data": {filesystem_plan, reasoning, explanation, ...}}
        {"type": "error", "data": {"message": "..."}}
    """
    tenant = "acme"  # TODO: make configurable

    # Phase 1: Build index
    yield {"type": "phase", "data": {"phase": "indexing", "message": "Building genome index from repository..."}}

    tree = await list_tree(tenant, base_path, app, depth=8)
    index_entries = _build_index(tree)
    file_entries = [e for e in index_entries if e["type"] not in ("dir", "folder")]
    index_str = _format_index(index_entries)

    yield {"type": "phase", "data": {
        "phase": "indexed",
        "message": f"Index ready: {len(file_entries)} files found",
    }}

    # Build system prompt
    system = HYDRATION_SYSTEM
    if extra_system:
        system += f"\n\n{extra_system}"

    # --- Fetch genome.index.json if it exists ---
    index_json_content: str | None = None
    index_json_path = f"{base_path}/genome.index.json"
    if any(e["path"] == index_json_path or e["name"] == "genome.index.json" for e in index_entries):
        try:
            index_file_data = await get_file(tenant, index_json_path, app)
            if index_file_data and index_file_data.get("content"):
                index_json_content = index_file_data["content"][:MAX_FILE_CHARS]
                yield {"type": "file_fetched", "data": {
                    "path": "genome.index.json",
                    "size": len(index_json_content),
                    "round": 0,
                }}
        except Exception as _idx_err:
            logger.debug("[hydration] genome.index.json fetch failed: %s", _idx_err)

    # Build initial user message
    first_message = (
        f"## GENOME: {base_path}\n\n"
        f"Available files ({len(file_entries)} total):\n"
        f"```\n{index_str}\n```\n\n"
    )

    if index_json_content:
        first_message += (
            f"## ENTITY INDEX (genome.index.json)\n\n"
            f"```json\n{index_json_content}\n```\n\n"
        )
        first_message += (
            "The entity index above maps all forms, workflows, tables, and UI components "
            "to their file paths. Use it to identify which structure files to request.\n\n"
        )
    else:
        first_message += (
            "No genome.index.json found. Start by requesting genome.yaml or structure files.\n\n"
        )

    if initial_user_context:
        first_message += f"## TASK\n\n{initial_user_context}\n\n"

    first_message += (
        "Analyze the entity index and declare your retrieval plan. "
        "You MUST return {\"plan\": [...], \"required_files\": [...]} first — "
        "do NOT produce output until you have fetched at least one structure file."
    )

    messages: list[dict] = [{"role": "user", "content": first_message}]
    total_context_chars = len(first_message)
    total_files_fetched = 0
    total_input_tokens = 0
    total_output_tokens = 0
    guard = Guard()

    for round_num in range(1, MAX_ROUNDS + 1):
        yield {"type": "phase", "data": {
            "phase": "querying",
            "message": f"Round {round_num}: Asking LLM what it needs...",
        }}

        # Force ready signal on last round
        if round_num == MAX_ROUNDS:
            messages.append({
                "role": "user",
                "content": (
                    "This is your FINAL round. You MUST signal ready now. "
                    'Respond with {"plan": [...], "ready": true, "files_to_produce": ["transformations/CLAUDE.md", ...]}.'
                ),
            })

        t0 = time.monotonic()
        try:
            raw_response, meta = await call_llm_multi_turn(
                provider=llm_cfg["provider"],
                api_key=llm_cfg["api_key"],
                model=llm_cfg["model"],
                messages=messages,
                system_prompt=system,
                max_tokens=max_tokens,
            )
        except Exception as exc:
            yield {"type": "error", "data": {"message": f"LLM call failed: {exc}"}}
            return

        latency_ms = int((time.monotonic() - t0) * 1000)
        total_input_tokens += meta.get("input_tokens") or 0
        total_output_tokens += meta.get("output_tokens") or 0
        stop_reason = meta.get("stop_reason")

        # --- Truncation recovery: if JSON is cut off, ask the LLM to continue ---
        if _is_truncated_json(raw_response, stop_reason=stop_reason):
            continuation_tokens = max(max_tokens, 32768)
            accumulated = raw_response
            for attempt in range(1, MAX_CONTINUATION_ATTEMPTS + 1):
                yield {"type": "phase", "data": {
                    "phase": "recovering",
                    "message": f"Round {round_num}: response truncated — requesting continuation ({attempt}/{MAX_CONTINUATION_ATTEMPTS})",
                }}
                logger.warning("[hydration] Round %d: truncated JSON, continuation attempt %d", round_num, attempt)
                continuation_messages = messages + [
                    {"role": "assistant", "content": accumulated},
                    {"role": "user", "content": "Your JSON response was truncated. Continue from exactly where you left off — output ONLY the remaining JSON (no preamble, no restart)."},
                ]
                try:
                    cont_text, cont_meta = await call_llm_multi_turn(
                        provider=llm_cfg["provider"],
                        api_key=llm_cfg["api_key"],
                        model=llm_cfg["model"],
                        messages=continuation_messages,
                        system_prompt=system,
                        max_tokens=continuation_tokens,
                    )
                    total_input_tokens += cont_meta.get("input_tokens") or 0
                    total_output_tokens += cont_meta.get("output_tokens") or 0
                    accumulated = accumulated + cont_text
                    if not _is_truncated_json(accumulated, stop_reason=cont_meta.get("stop_reason")):
                        raw_response = accumulated
                        break
                except Exception as exc:
                    logger.warning("[hydration] Continuation attempt %d failed: %s", attempt, exc)
                    break
            else:
                # All continuation attempts exhausted — still truncated
                logger.error("[hydration] Round %d: JSON still truncated after %d attempts", round_num, MAX_CONTINUATION_ATTEMPTS)
                yield {"type": "error", "data": {
                    "message": "LLM response truncated and could not be recovered. Try a shorter translation task or split into multiple steps.",
                    "raw_response": raw_response[:500],
                }}
                return

        # Parse LLM response
        parsed = _parse_llm_response(raw_response)
        if parsed is None:
            logger.warning("[hydration] Round %d: LLM returned non-JSON: %s", round_num, raw_response[:300])
            yield {"type": "error", "data": {
                "message": "LLM returned invalid JSON. The response may have been truncated.",
                "raw_response": raw_response[:500],
            }}
            return

        # Add assistant response to conversation history
        messages.append({"role": "assistant", "content": raw_response})

        # --- Guard: reject premature builds ---
        guard_result = guard.validate(parsed, files_fetched_in_loop=total_files_fetched, round_num=round_num)
        if guard_result.rejected:
            logger.warning("[hydration] Round %d: guard rejected — %s", round_num, guard_result.reason)
            yield {"type": "phase", "data": {
                "phase": "reasoning",
                "message": f"Round {round_num}: rejected premature build ({guard_result.reason}) — retrying",
            }}
            messages.append({"role": "user", "content": guard_result.correction_message})
            continue

        # --- Detect response shape ---
        # New format:  {"plan": [...], "required_files": [...]}  or  {"plan": [...], "output": {...}}
        # Legacy format: {"action": "request_files", ...}  or  {"action": "produce_output", ...}
        plan = parsed.get("plan", [])
        plan_str = "; ".join(plan) if isinstance(plan, list) else str(plan)

        has_required_files = "required_files" in parsed
        has_output = "output" in parsed
        legacy_action = parsed.get("action", "")

        is_retrieval = has_required_files or legacy_action == "request_files"
        is_production = has_output or legacy_action == "produce_output"

        # If neither shape matched, infer from keys present
        if not is_retrieval and not is_production:
            if parsed.get("filesystem_plan") or parsed.get("explanation"):
                is_production = True
            else:
                is_retrieval = True

        if is_retrieval:
            # Normalize file list from either format
            requested = (
                parsed.get("required_files")
                or parsed.get("files")
                or []
            )[:MAX_FILES_PER_ROUND]

            reasoning_msg = (
                plan_str
                or (parsed.get("reasoning") or "")
                if not isinstance(parsed.get("reasoning"), list)
                else "; ".join(parsed.get("reasoning", []))
            )

            yield {"type": "llm_reasoning", "data": {
                "message": reasoning_msg or f"Round {round_num}: fetching {len(requested)} file(s)",
                "round": round_num,
                "files_requested": requested,
            }}

            yield {"type": "phase", "data": {
                "phase": "retrieving",
                "message": f"Round {round_num}: Fetching {len(requested)} file(s) from repository...",
            }}

            # Fetch requested files
            fetched_content = []
            for file_path in requested:
                # Normalize: prepend base_path if not already present
                full_path = file_path if file_path.startswith(base_path) else f"{base_path}/{file_path}"
                try:
                    file_data = await get_file(tenant, full_path, app)
                    content = (file_data.get("content", "") if file_data else "")[:MAX_FILE_CHARS]
                    fetched_content.append(f"--- FILE: {file_path} ({len(content)} chars) ---\n{content}")
                    total_context_chars += len(content)
                    total_files_fetched += 1
                    yield {"type": "file_fetched", "data": {
                        "path": file_path,
                        "size": len(content),
                        "round": round_num,
                    }}
                except Exception as exc:
                    fetched_content.append(f"--- FILE: {file_path} ---\n[Error: {exc}]")
                    yield {"type": "file_fetched", "data": {
                        "path": file_path,
                        "size": 0,
                        "round": round_num,
                        "error": str(exc),
                    }}

            next_msg = "Here are the requested files:\n\n" + "\n\n".join(fetched_content)

            if total_context_chars > CONTEXT_BUDGET:
                next_msg += (
                    f"\n\nCONTEXT BUDGET REACHED ({total_context_chars:,} chars). "
                    'You MUST signal ready now. Respond with {"plan": [...], "ready": true, "files_to_produce": [...]}.'
                )

            messages.append({"role": "user", "content": next_msg})

        # --- Shape 2: ready signal → synthesize files one by one ---
        is_ready = parsed.get("ready") is True
        # Also treat legacy output shape as ready (backward compat)
        has_output = "output" in parsed or parsed.get("filesystem_plan") or parsed.get("explanation") or legacy_action == "produce_output"

        if is_ready or (has_output and not is_retrieval):
            files_to_produce: list[str] = parsed.get("files_to_produce", [])

            # Legacy: extract files list from embedded filesystem_plan
            if not files_to_produce and has_output:
                output_block = parsed.get("output") or parsed
                fp = output_block.get("filesystem_plan") or {}
                files_to_produce = [f["path"] for f in fp.get("files", []) if isinstance(f, dict) and f.get("path")]

            if not files_to_produce:
                # Fallback: ask the LLM to declare what it will produce
                files_to_produce = ["transformations/CLAUDE.md", "transformations/seed.json"]

            reasoning_list = plan if isinstance(plan, list) else ([plan_str] if plan_str else [])
            yield {"type": "llm_reasoning", "data": {
                "message": "; ".join(reasoning_list) if reasoning_list else "Context loaded — synthesizing files",
                "round": round_num,
            }}

            # Add the ready signal to conversation history
            messages.append({"role": "assistant", "content": raw_response})

            # Synthesize each file with a separate focused call
            produced_files: list[dict] = []
            app_slug = base_path.rstrip("/").split("/")[-1]

            for file_path in files_to_produce:
                yield {"type": "phase", "data": {
                    "phase": "synthesizing",
                    "message": f"Writing {file_path}...",
                }}

                ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else "txt"
                if ext in ("md", "txt", "py", "ts", "tsx", "js", "jsx", "yaml", "yml", "sh"):
                    format_hint = f"Output raw {ext.upper()} — no JSON wrapper, no markdown fences, no explanation."
                elif ext == "json":
                    format_hint = "Output raw valid JSON only — no wrapper, no explanation, no markdown fences."
                else:
                    format_hint = "Output raw file content only."

                synthesis_messages = messages + [{
                    "role": "user",
                    "content": (
                        f"Now write the complete content of `{file_path}`.\n\n"
                        f"{format_hint}\n\n"
                        "Apply the full recipe/instructions from the system prompt. "
                        "Use everything you have retrieved. Be thorough and complete."
                    ),
                }]

                try:
                    file_content, file_meta = await call_llm_multi_turn(
                        provider=llm_cfg["provider"],
                        api_key=llm_cfg["api_key"],
                        model=llm_cfg["model"],
                        messages=synthesis_messages,
                        system_prompt=system,
                        max_tokens=max(max_tokens, 32768),
                    )
                    total_input_tokens += file_meta.get("input_tokens") or 0
                    total_output_tokens += file_meta.get("output_tokens") or 0

                    # Strip stray fences from plain-text files
                    if ext != "json":
                        import re as _re
                        file_content = _re.sub(r"^```[a-z]*\n?", "", file_content.strip())
                        file_content = _re.sub(r"\n?```$", "", file_content.strip())

                    produced_files.append({"path": file_path, "content": file_content})

                    # Add to conversation so subsequent files have prior context
                    messages = synthesis_messages + [{"role": "assistant", "content": file_content}]

                    yield {"type": "file_fetched", "data": {
                        "path": file_path,
                        "size": len(file_content),
                        "round": round_num,
                    }}
                except Exception as exc:
                    logger.error("[hydration] File synthesis failed for %s: %s", file_path, exc)
                    yield {"type": "phase", "data": {
                        "phase": "synthesizing",
                        "message": f"Warning: could not write {file_path}: {exc}",
                    }}

            if not produced_files:
                yield {"type": "error", "data": {"message": "File synthesis produced no output."}}
                return

            filesystem_plan = {
                "branch_name": f"transform-{app_slug}",
                "base_path": base_path,
                "folders": list({f["path"].split("/")[0] for f in produced_files if "/" in f["path"]}),
                "files": produced_files,
            }
            preview = produced_files[0]["content"][:300] if produced_files else ""

            yield {"type": "hydration_complete", "data": {
                "rounds": round_num,
                "files_fetched": total_files_fetched,
                "files_produced": len(produced_files),
                "total_context_chars": total_context_chars,
                "total_input_tokens": total_input_tokens,
                "total_output_tokens": total_output_tokens,
            }}

            yield {"type": "result", "data": {
                "reasoning": reasoning_list,
                "explanation": f"Produced {len(produced_files)} file(s): {', '.join(f['path'] for f in produced_files)}",
                "filesystem_plan": filesystem_plan,
                "diff": f"Created: {', '.join(f['path'] for f in produced_files)}",
                "preview": preview,
            }}
            return

    # If we exhausted all rounds without signalling ready
    yield {"type": "error", "data": {
        "message": f"Hydration loop exhausted after {MAX_ROUNDS} rounds without producing output.",
    }}
