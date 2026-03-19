"""Genome Studio API — real genome transformation system.

Transform flow:
  1. Load genome from GitHub
  2. LLM generates a FILESYSTEM PLAN (not raw text)
  3. Save to a NEW BRANCH with structured folders

Rules:
  - Never overwrite original files
  - Never commit to main
  - Always create a new branch
  - Always return a filesystem plan
"""

from __future__ import annotations

import json
import logging
import time
import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from providers.github_provider import (
    create_branch,
    create_or_update_file,
    get_file,
    list_tree,
)

import re

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/genome", tags=["genome-studio"])


def _extract_json(raw: str) -> dict | None:
    """Best-effort extraction of the first JSON object from an LLM response.

    Handles: bare JSON, ```json fences, ``` fences, or JSON embedded in prose.
    """
    text = raw.strip()

    # 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
    fence_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", text)
    if fence_match:
        text = fence_match.group(1).strip()

    # 2. Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 3. Find the first { ... } block (greedy from first { to last })
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        candidate = text[first_brace:last_brace + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    return None

TENANT = "acme"


async def _track_usage(skill: str, model: str, meta: dict, app, latency_ms: int = 0) -> None:
    """Record LLM usage to the cost ledger."""
    from models import LLMUsageEvent, calculate_llm_cost
    input_tokens = meta.get("input_tokens") or 0
    output_tokens = meta.get("output_tokens") or 0
    cost = calculate_llm_cost(model, input_tokens, output_tokens)
    await app.state.llm_usage_store.create(LLMUsageEvent(
        id=f"llmu_{uuid.uuid4().hex[:12]}",
        tenant_id=TENANT,
        run_id="",
        use_case="Genome Studio",
        skill=skill,
        model=meta.get("model", model),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        cost=cost,
        latency_ms=latency_ms,
    ))


# ---------------------------------------------------------------------------
# List genomes
# ---------------------------------------------------------------------------

@router.get("/list")
async def genome_list(request: Request, path: str = "genomes"):
    tree = await list_tree(TENANT, path, request.app, depth=8)
    return {"status": "ok", "files": tree}


# ---------------------------------------------------------------------------
# Load genome file
# ---------------------------------------------------------------------------

@router.get("/load")
async def genome_load(path: str, request: Request):
    if not path:
        raise HTTPException(status_code=400, detail="path is required")
    result = await get_file(TENANT, path, request.app)
    if result is None:
        raise HTTPException(status_code=404, detail="File not found")
    return {"status": "ok", **result}


# ---------------------------------------------------------------------------
# Chat — conversational Q&A about genomes (no filesystem plan)
# ---------------------------------------------------------------------------

_CHAT_SYSTEM = """\
You are Genome Studio, an AI assistant for the OverYonder platform.

You help users understand, analyze, and plan transformations for application genomes.

You have access to the user's loaded genome content and the repository file tree.

When answering:
1. Show your reasoning step by step
2. Be specific about what you see in the data
3. If the user asks you to transform or create files, tell them to use a transformation prompt instead

ALWAYS return a JSON object with:
{
  "reasoning": ["step 1...", "step 2...", ...],
  "answer": "your detailed answer here"
}

Return ONLY valid JSON — no markdown, no code fences.
"""


class ChatRequest(BaseModel):
    prompt: str = ""
    content: str = ""
    file_tree: str = ""


@router.post("/chat")
async def genome_chat(body: ChatRequest, request: Request):
    """Conversational Q&A — auto-reads the repo tree and key YAML files for context."""
    if not body.prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    try:
        from services.snow_to_replit import _get_llm_config
        from services.claude_client import call_llm
        llm_cfg = await _get_llm_config(TENANT, request.app)
    except Exception as exc:
        return {"status": "error", "error": f"LLM not configured: {exc}"}

    # Auto-load the full file tree
    tree = await list_tree(TENANT, "genomes", request.app, depth=8)
    tree_str = _format_tree(tree)

    # Auto-read YAML files for context (limit to stay within TPM budget)
    yaml_contents: list[str] = []
    yaml_paths = _collect_file_paths(tree, extensions=(".yaml", ".yml"))
    total_chars = 0
    for path in yaml_paths[:3]:
        if total_chars > 10_000:
            break
        file_data = await get_file(TENANT, path, request.app)
        if file_data and file_data.get("content"):
            content = file_data["content"][:5000]  # Cap each file at 5KB
            yaml_contents.append(f"--- FILE: {path} ---\n{content}")
            total_chars += len(content)

    # Build context for LLM
    user_message = f"Repository file tree:\n{tree_str}\n\n"
    if yaml_contents:
        user_message += "Key YAML file contents:\n\n" + "\n\n".join(yaml_contents) + "\n\n"
    if body.content:
        user_message += f"Currently selected file content:\n\n{body.content}\n\n"
    user_message += f"User question: {body.prompt}"

    # Read tenant token limit
    defaults = request.app.state.runtime_defaults.get(TENANT)
    max_tokens = defaults.max_tokens_per_run if defaults else 16384

    t0 = time.monotonic()
    try:
        raw_response, meta = await call_llm(
            provider=llm_cfg["provider"],
            api_key=llm_cfg["api_key"],
            model=llm_cfg["model"],
            user_message=user_message,
            system_prompt=_CHAT_SYSTEM,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        return {"status": "error", "error": f"LLM call failed: {exc}"}

    latency_ms = int((time.monotonic() - t0) * 1000)
    await _track_usage("genome-chat", llm_cfg["model"], meta, request.app, latency_ms)

    parsed = _extract_json(raw_response)
    if parsed and "answer" in parsed:
        return {
            "status": "ok",
            "type": "chat",
            "reasoning": parsed.get("reasoning", []),
            "answer": parsed.get("answer", ""),
            "files_read": len(yaml_contents),
        }
    return {
        "status": "ok",
        "type": "chat",
        "reasoning": [],
        "answer": raw_response.strip(),
        "files_read": len(yaml_contents),
    }


def _format_tree(nodes: list, indent: int = 0) -> str:
    """Format a file tree into a readable string."""
    lines = []
    for n in nodes:
        prefix = "  " * indent
        if n.get("type") == "dir":
            lines.append(f"{prefix}{n['name']}/")
            for child in n.get("children", []):
                lines.extend(_format_tree([child], indent + 1).splitlines())
        else:
            lines.append(f"{prefix}{n['name']}")
    return "\n".join(lines)


def _collect_file_paths(nodes: list, extensions: tuple = (".yaml", ".yml")) -> list[str]:
    """Recursively collect file paths matching given extensions."""
    paths = []
    for n in nodes:
        if n.get("type") == "dir":
            paths.extend(_collect_file_paths(n.get("children", []), extensions))
        elif any(n.get("name", "").endswith(ext) for ext in extensions):
            paths.append(n["path"])
    return paths


# ---------------------------------------------------------------------------
# Transform genome via LLM → filesystem plan
# ---------------------------------------------------------------------------

_TRANSFORM_SYSTEM = """\
You are a genome transformation agent for the OverYonder platform.

You NEVER return raw text only.
You ALWAYS return a JSON object with these keys:

1. reasoning — array of strings showing your thought process step by step
2. explanation — what you did and why
3. filesystem_plan — the exact files and folders to create
4. diff — a summary of what changed
5. preview — a short preview of the result

reasoning should include steps like:
  - "Analyzing current genome structure..."
  - "Identifying prompts to extract..."
  - "Planning folder structure..."
  - "Converting YAML to JSON format..."

filesystem_plan must contain:
  - branch_name: string (format: "genome-mod-<timestamp>")
  - base_path: string (the genome's directory in the repo)
  - folders: string[] (folders to create under "Genome Transformations/")
  - files: array of { path: string, content: string }

IMPORTANT: All new files and folders MUST be created under a top-level
folder called "Genome Transformations" within the base_path. Never
overwrite original genome files.

RULES:
- Always create a NEW branch (never commit to main)
- Always create a parent folder for modifications
- Never overwrite original files
- Be explicit with file paths (relative to base_path)
- Extract prompts into separate files when requested
- Convert between YAML/JSON formats when requested
- Return ONLY valid JSON — no markdown, no code fences
"""


class TransformRequest(BaseModel):
    path: str = ""
    content: str = ""
    prompt: str = ""


@router.post("/transform")
async def genome_transform(body: TransformRequest, request: Request):
    if not body.prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    # Load LLM config
    try:
        from services.snow_to_replit import _get_llm_config
        from services.claude_client import call_llm
        llm_cfg = await _get_llm_config(TENANT, request.app)
    except Exception as exc:
        return {"status": "error", "error": f"LLM not configured: {exc}"}

    # Derive base_path from the file path
    base_path = "/".join(body.path.split("/")[:-1]) if "/" in body.path else "genomes"
    timestamp = str(int(time.time()))

    # Auto-read repo content for context (limited to stay within TPM budget)
    tree = await list_tree(TENANT, "genomes", request.app, depth=8)
    tree_str = _format_tree(tree)
    yaml_paths = _collect_file_paths(tree, extensions=(".yaml", ".yml"))
    yaml_contents: list[str] = []
    total_chars = 0
    for path in yaml_paths[:3]:
        if total_chars > 10_000:
            break
        file_data = await get_file(TENANT, path, request.app)
        if file_data and file_data.get("content"):
            content = file_data["content"][:5000]
            yaml_contents.append(f"--- FILE: {path} ---\n{content}")
            total_chars += len(content)

    user_message = f"Repository file tree:\n{tree_str}\n\n"
    if yaml_contents:
        user_message += "Key YAML file contents:\n\n" + "\n\n".join(yaml_contents) + "\n\n"
    user_message += (
        f"Current genome file path: {body.path}\n"
        f"Base path: {base_path}\n"
        f"Branch name to use: genome-mod-{timestamp}\n\n"
        f"User instruction: {body.prompt}\n\n"
        f"Return ONLY a JSON object with: reasoning, explanation, filesystem_plan, diff, preview.\n"
        f"All new files must go under 'Genome Transformations/' folder within the base_path.\n"
        f"Generate REAL file content based on the actual genome data you can see above."
    )

    # Read tenant token limit
    defaults = request.app.state.runtime_defaults.get(TENANT)
    max_tokens = defaults.max_tokens_per_run if defaults else 16384

    t0 = time.monotonic()
    try:
        raw_response, meta = await call_llm(
            provider=llm_cfg["provider"],
            api_key=llm_cfg["api_key"],
            model=llm_cfg["model"],
            user_message=user_message,
            system_prompt=_TRANSFORM_SYSTEM,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        return {"status": "error", "error": f"LLM call failed: {exc}"}

    latency_ms = int((time.monotonic() - t0) * 1000)
    await _track_usage("genome-transform", llm_cfg["model"], meta, request.app, latency_ms)

    # Parse JSON from response
    plan = _extract_json(raw_response)
    if plan is None:
        logger.warning("[genome_studio] LLM returned non-JSON: %s", raw_response[:200])
        return {
            "status": "error",
            "error": "LLM returned invalid JSON. Try rephrasing your request.",
            "raw_response": raw_response[:500],
        }

    # Validate required fields
    fs_plan = plan.get("filesystem_plan", {})
    if not fs_plan.get("branch_name"):
        fs_plan["branch_name"] = f"genome-mod-{timestamp}"
    if not fs_plan.get("base_path"):
        fs_plan["base_path"] = base_path
    if not fs_plan.get("files"):
        fs_plan["files"] = []
    if not fs_plan.get("folders"):
        fs_plan["folders"] = []

    return {
        "status": "ok",
        "reasoning": plan.get("reasoning", []),
        "explanation": plan.get("explanation", ""),
        "filesystem_plan": fs_plan,
        "diff": plan.get("diff", ""),
        "preview": plan.get("preview", ""),
        "message": plan.get("explanation", "Transformation plan generated."),
    }


# ---------------------------------------------------------------------------
# Save filesystem plan to GitHub (new branch)
# ---------------------------------------------------------------------------

class SaveRequest(BaseModel):
    filesystem_plan: dict


@router.post("/save")
async def genome_save(body: SaveRequest, request: Request):
    plan = body.filesystem_plan
    branch_name = plan.get("branch_name", "")
    files = plan.get("files", [])

    if not branch_name:
        return {"status": "error", "error": "branch_name is required in filesystem_plan"}
    if not files:
        return {"status": "error", "error": "No files in filesystem_plan"}

    # Step 1: Create branch
    branch = await create_branch(TENANT, branch_name, request.app)
    if branch is None:
        return {"status": "error", "error": f"Failed to create branch: {branch_name}"}

    # Step 2: Write each file to the branch
    base_path = plan.get("base_path", "")
    committed: list[str] = []
    errors: list[str] = []

    for file_entry in files:
        file_path = file_entry.get("path", "")
        file_content = file_entry.get("content", "")
        if not file_path:
            continue

        # Resolve full path
        full_path = f"{base_path}/{file_path}" if base_path and not file_path.startswith(base_path) else file_path

        result = await create_or_update_file(
            TENANT, full_path, file_content,
            message=f"Genome Studio: create {file_path}",
            app=request.app,
            branch=branch_name,
        )
        if result:
            committed.append(full_path)
        else:
            errors.append(f"Failed to write: {full_path}")

    if not committed:
        return {"status": "error", "error": "Failed to commit any files", "errors": errors}

    logger.info("[genome_studio] Saved %d files to branch %s", len(committed), branch_name)

    return {
        "status": "ok",
        "message": f"Saved to branch: {branch_name}",
        "branch": branch_name,
        "files_committed": committed,
        "file_count": len(committed),
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Trigger integration action
# ---------------------------------------------------------------------------

class ActionRequest(BaseModel):
    action: str
    path: str = ""
    content: str = ""
    integration_id: str = ""


@router.post("/action")
async def genome_action(body: ActionRequest, request: Request):
    if body.action == "create_replit_app":
        replit_cfg = await request.app.state.replit_config_store.get_by_tenant(TENANT)
        if not replit_cfg or not replit_cfg.connect_sid:
            return {"status": "setup_required", "message": "Replit integration not configured."}
        return {"status": "ok", "message": "Replit app creation initiated from genome."}

    if body.action == "sync_catalog":
        return {"status": "ok", "message": "Catalog sync initiated with ServiceNow."}

    return {"status": "error", "error": f"Unknown action: {body.action}"}


# ---------------------------------------------------------------------------
# Run a saved Translation recipe against genome content
# ---------------------------------------------------------------------------


class RunTranslationRequest(BaseModel):
    translation_id: str
    content: str = ""
    path: str = ""


@router.post("/run-translation")
async def run_translation(body: RunTranslationRequest, request: Request):
    """Run a saved translation recipe against a loaded genome repository.

    Reads the full repo tree + key YAML files for context (same as /transform),
    then injects the translation instructions so the LLM applies the recipe.
    """
    translation = await request.app.state.translation_store.get(body.translation_id)
    if translation is None:
        raise HTTPException(status_code=404, detail="Translation not found")

    if not translation.instructions:
        return {"status": "error", "error": "Translation has no instructions configured."}

    try:
        from services.snow_to_replit import _get_llm_config
        from services.claude_client import call_llm
        llm_cfg = await _get_llm_config(TENANT, request.app)
    except Exception as exc:
        return {"status": "error", "error": f"LLM not configured: {exc}"}

    base_path = "/".join(body.path.split("/")[:-1]) if "/" in body.path else "genomes"
    timestamp = str(int(time.time()))

    # ── Read full repo context (same as /transform) ──
    tree = await list_tree(TENANT, "genomes", request.app, depth=8)
    tree_str = _format_tree(tree)
    yaml_paths = _collect_file_paths(tree, extensions=(".yaml", ".yml"))
    yaml_contents: list[str] = []
    total_chars = 0
    for path in yaml_paths[:5]:
        if total_chars > 15_000:
            break
        file_data = await get_file(TENANT, path, request.app)
        if file_data and file_data.get("content"):
            content = file_data["content"][:5000]
            yaml_contents.append(f"--- FILE: {path} ---\n{content}")
            total_chars += len(content)

    # ── Build the prompt with full repo context + translation instructions ──
    user_message = f"Repository file tree:\n{tree_str}\n\n"
    if yaml_contents:
        user_message += "Key YAML file contents:\n\n" + "\n\n".join(yaml_contents) + "\n\n"
    if body.content:
        user_message += f"Currently selected file content:\n{body.content}\n\n"

    # Output structure guidance
    output_guidance = ""
    if translation.output_structure:
        output_guidance = f"\nExpected output structure: {json.dumps(translation.output_structure)}\n"

    user_message += (
        f"=== TRANSLATION RECIPE ===\n"
        f"Name: {translation.name}\n"
        f"Source vendor: {translation.source_vendor}\n"
        f"Source type: {translation.source_type}\n"
        f"Target platform: {translation.target_platform}\n"
        f"{output_guidance}\n"
        f"INSTRUCTIONS:\n{translation.instructions}\n"
        f"=== END RECIPE ===\n\n"
        f"Current genome file path: {body.path}\n"
        f"Base path: {base_path}\n"
        f"Branch name to use: genome-mod-{timestamp}\n\n"
        f"Apply the translation recipe above to the repository content.\n"
        f"Return ONLY a JSON object with: reasoning, explanation, filesystem_plan, diff, preview.\n"
        f"All new files must go under 'Genome Transformations/' folder within the base_path.\n"
        f"Generate REAL, complete file content based on the actual genome data you can see above."
    )

    defaults = request.app.state.runtime_defaults.get(TENANT)
    max_tokens = defaults.max_tokens_per_run if defaults else 16384

    t0 = time.monotonic()
    try:
        raw_response, meta = await call_llm(
            provider=llm_cfg["provider"],
            api_key=llm_cfg["api_key"],
            model=llm_cfg["model"],
            user_message=user_message,
            system_prompt=_TRANSFORM_SYSTEM,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        return {"status": "error", "error": f"LLM call failed: {exc}"}

    latency_ms = int((time.monotonic() - t0) * 1000)
    await _track_usage("genome-run-translation", llm_cfg["model"], meta, request.app, latency_ms)

    plan = _extract_json(raw_response)
    if plan is None:
        logger.warning("[run-translation] LLM returned non-JSON: %s", raw_response[:300])
        return {
            "status": "error",
            "error": "LLM returned invalid JSON. Try again or simplify the translation instructions.",
            "raw_response": raw_response[:1000],
        }

    fs_plan = plan.get("filesystem_plan", {})
    if not fs_plan.get("branch_name"):
        fs_plan["branch_name"] = f"genome-mod-{timestamp}"
    if not fs_plan.get("base_path"):
        fs_plan["base_path"] = base_path
    if not fs_plan.get("files"):
        fs_plan["files"] = []
    if not fs_plan.get("folders"):
        fs_plan["folders"] = []

    return {
        "status": "ok",
        "reasoning": plan.get("reasoning", []),
        "explanation": plan.get("explanation", ""),
        "filesystem_plan": fs_plan,
        "diff": plan.get("diff", ""),
        "preview": plan.get("preview", ""),
        "message": plan.get("explanation", "Translation applied."),
    }


# ---------------------------------------------------------------------------
# Generate a Translation recipe from current Studio context
# ---------------------------------------------------------------------------

_RECIPE_SYSTEM = """\
You are a translation recipe generator for the OverYonder genome platform.

Given the user's transformation context — their original genome content, the
output files they produced, and any conversation context — you must generate
a REUSABLE translation recipe that can reproduce this transformation on
similar genomes.

Return ONLY a valid JSON object with these keys:
{
  "instructions": "Detailed LLM prompt instructions that would reproduce this transformation...",
  "output_structure": {
    "folders": ["list of folders the recipe creates"],
    "files": ["list of file names the recipe produces"]
  },
  "suggested_description": "One-sentence description of what this translation does"
}

The "instructions" field is the most important — it should be a complete,
self-contained prompt that another LLM can follow to reproduce the same
kind of transformation on a different genome of the same type.

Be specific: reference the source format, the target format, what files to
produce, how to structure the content, and any rules or conventions.

Return ONLY valid JSON — no markdown, no code fences.
"""


class GenerateRecipeRequest(BaseModel):
    original_content: str = ""
    output_files: list[dict] = []     # [{path, content}]
    chat_context: str = ""            # summary of what the user asked
    source_vendor: str = ""
    target_platform: str = ""


@router.post("/generate-translation-recipe")
async def generate_translation_recipe(body: GenerateRecipeRequest, request: Request):
    """Use the LLM to reverse-engineer a reusable translation recipe from the
    current Studio transformation context."""
    try:
        from services.snow_to_replit import _get_llm_config
        from services.claude_client import call_llm
        llm_cfg = await _get_llm_config(TENANT, request.app)
    except Exception as exc:
        return {"status": "error", "error": f"LLM not configured: {exc}"}

    # Build context for the recipe generator
    user_message = ""
    if body.source_vendor:
        user_message += f"Source vendor: {body.source_vendor}\n"
    if body.target_platform:
        user_message += f"Target platform: {body.target_platform}\n\n"

    if body.chat_context:
        user_message += f"User's transformation requests:\n{body.chat_context}\n\n"

    if body.original_content:
        # Cap at 8K to leave room for output files
        user_message += f"Original genome content (source):\n{body.original_content[:8000]}\n\n"

    if body.output_files:
        user_message += "Output files produced by the transformation:\n"
        for f in body.output_files[:10]:
            user_message += f"\n--- FILE: {f.get('path', 'unknown')} ---\n"
            user_message += (f.get("content", ""))[:3000]
            user_message += "\n"
        user_message += "\n"

    user_message += (
        "Based on the above context, generate a reusable translation recipe.\n"
        "The recipe should work on ANY genome from the same source vendor/type, "
        "not just this specific one."
    )

    defaults = request.app.state.runtime_defaults.get(TENANT)
    max_tokens = defaults.max_tokens_per_run if defaults else 8192

    t0 = time.monotonic()
    try:
        raw_response, meta = await call_llm(
            provider=llm_cfg["provider"],
            api_key=llm_cfg["api_key"],
            model=llm_cfg["model"],
            user_message=user_message,
            system_prompt=_RECIPE_SYSTEM,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        return {"status": "error", "error": f"LLM call failed: {exc}"}

    latency_ms = int((time.monotonic() - t0) * 1000)
    await _track_usage("genome-generate-recipe", llm_cfg["model"], meta, request.app, latency_ms)

    recipe = _extract_json(raw_response)
    if recipe is None:
        return {
            "status": "ok",
            "instructions": raw_response.strip()[:2000],
            "output_structure": {},
            "suggested_description": "",
        }

    return {
        "status": "ok",
        "instructions": recipe.get("instructions", ""),
        "output_structure": recipe.get("output_structure", {}),
        "suggested_description": recipe.get("suggested_description", ""),
    }


# ---------------------------------------------------------------------------
# Save current transformation context as a Translation record
# ---------------------------------------------------------------------------


class SaveTranslationRequest(BaseModel):
    name: str
    description: str = ""
    source_vendor: str = ""
    source_type: str = ""
    target_platform: str = ""
    instructions: str = ""
    output_structure: dict = {}


@router.post("/save-translation")
async def save_translation(body: SaveTranslationRequest, request: Request):
    """Save a transformation recipe as a reusable Translation record."""
    from models import Translation
    translation = Translation(
        id=f"trans_{uuid.uuid4().hex[:12]}",
        tenant_id=TENANT,
        name=body.name,
        description=body.description,
        source_vendor=body.source_vendor,
        source_type=body.source_type,
        target_platform=body.target_platform,
        instructions=body.instructions,
        output_structure=body.output_structure,
        status="active",
    )
    created = await request.app.state.translation_store.create(translation)
    return {"status": "ok", "translation": created}
