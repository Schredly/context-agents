"""Genome Merger Agent — merge multiple partial genomes into one unified Application Genome."""

from __future__ import annotations

import logging
import time

import yaml

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are merging multiple partial ServiceNow genomes into a single unified Application Genome.

---

### INPUT

You will receive multiple genome YAML objects derived from separate update sets.

---

### GOAL

Merge into ONE coherent application model.

---

### RULES

1. Deduplicate:
   - tables
   - modules
   - variables
   - logic rules

2. Merge:
   - workflows across files
   - business logic affecting same entities

3. Resolve conflicts:
   - prefer more complete definitions
   - combine partial definitions when possible

4. Normalize naming:
   - ensure consistent naming across entire genome

---

### OUTPUT

Return ONE unified genome in the same YAML structure:

application:
  name:
  scope:
  description:

entities:
  - name:
    type:
    table:
    fields: []
    relationships: []

catalog:
  items:
    - name:
      variables:
        - name:
          type:
          required:
          order:

workflows:
  - name:
    trigger:
    conditions:
    actions:

business_logic:
  rules:
    - name:
      table:
      trigger:
      logic_summary:
      external_dependencies:

ui:
  modules:
    - name:
      table:
      type:
      filter:

navigation:
  menu:
    - name:
      modules: []

data_model:
  tables:
    - name:
      purpose:
      key_fields: []

integrations:
  - name:
    type:
    direction:
    description:

logic_patterns:
  - name:
    description:
    trigger:
    action:
    reusable_pattern:

processes:
  - name:
    steps:
      - step:
        actor:
        action:
        system_behavior:

events:
  - name:
    trigger:
    downstream_effects:

---

### IMPORTANT

- Do NOT lose information
- Do NOT duplicate entities
- Ensure relationships remain intact

---

Think like:
"Reconstructing the full application from fragmented exports"

---

Return ONLY YAML."""


async def merge_genomes(
    partial_genomes: list[dict],
    partial_yamls: list[str],
    llm_config: dict,
    max_tokens: int = 16384,
    on_progress=None,
) -> dict:
    """Merge multiple partial genomes into one unified genome.

    Args:
        partial_genomes: list of genome dicts from individual extractions
        partial_yamls: list of YAML strings from individual extractions
        llm_config: LLM provider config
        max_tokens: max tokens for LLM call
        on_progress: callback for progress reporting

    Returns:
        {
            "status": "ok",
            "genome": dict,
            "genome_yaml": str,
            "meta": dict,
            "latency_ms": int,
        }
    """
    t0 = time.time()
    if on_progress:
        await on_progress("genome_merger", "running", {"genomes_to_merge": len(partial_genomes)})

    from services.claude_client import call_llm

    # Build user message with all partial genomes
    genome_sections = []
    for i, yml in enumerate(partial_yamls):
        genome_sections.append(f"--- GENOME {i + 1} ---\n{yml[:25000]}\n--- END GENOME {i + 1} ---")

    combined = "\n\n".join(genome_sections)

    user_message = f"""Merge these {len(partial_genomes)} partial ServiceNow genomes into ONE unified Application Genome.

{combined}

Deduplicate tables, modules, variables, and rules. Merge workflows and business logic affecting the same entities. Prefer more complete definitions. Return ONLY the unified YAML genome."""

    try:
        raw_text, meta = await call_llm(
            provider=llm_config["provider"],
            api_key=llm_config["api_key"],
            model=llm_config["model"],
            user_message=user_message,
            system_prompt=SYSTEM_PROMPT,
            max_tokens=max_tokens,
        )

        genome_yaml = _clean_yaml(raw_text)
        genome = _parse_yaml(genome_yaml)

        if not genome:
            logger.warning("[genome_merger] Could not parse merged YAML, falling back to simple merge")
            genome = _simple_merge(partial_genomes)
            genome_yaml = yaml.dump(genome, default_flow_style=False, sort_keys=False)

        latency_ms = int((time.time() - t0) * 1000)

        # Count elements in merged genome
        counts = {
            "entities": len(genome.get("entities", [])),
            "catalog_items": len(genome.get("catalog", {}).get("items", [])),
            "workflows": len(genome.get("workflows", [])),
            "rules": len(genome.get("business_logic", {}).get("rules", [])),
            "tables": len(genome.get("data_model", {}).get("tables", [])),
            "logic_patterns": len(genome.get("logic_patterns", [])),
            "processes": len(genome.get("processes", [])),
        }

        if on_progress:
            await on_progress("genome_merger", "done", {
                **counts,
                "latency_ms": latency_ms,
            })

        return {
            "status": "ok",
            "genome": genome,
            "genome_yaml": genome_yaml,
            "meta": meta,
            "latency_ms": latency_ms,
        }

    except Exception as exc:
        logger.error("[genome_merger] LLM call failed: %s", exc)
        if on_progress:
            await on_progress("genome_merger", "error", {"error": str(exc)})
        return {"status": "error", "error": str(exc)}


def _simple_merge(genomes: list[dict]) -> dict:
    """Fallback: naive merge by concatenating lists and taking first application block."""
    merged: dict = {}
    for g in genomes:
        if not merged.get("application") and g.get("application"):
            merged["application"] = g["application"]

        for key in ["entities", "workflows", "integrations", "logic_patterns", "processes", "events"]:
            existing = merged.get(key, [])
            new_items = g.get(key, [])
            if isinstance(new_items, list):
                existing.extend(new_items)
                merged[key] = existing

        # Merge nested structures
        if g.get("catalog", {}).get("items"):
            catalog = merged.setdefault("catalog", {"items": []})
            catalog["items"].extend(g["catalog"]["items"])

        if g.get("business_logic", {}).get("rules"):
            bl = merged.setdefault("business_logic", {"rules": []})
            bl["rules"].extend(g["business_logic"]["rules"])

        if g.get("data_model", {}).get("tables"):
            dm = merged.setdefault("data_model", {"tables": []})
            dm["tables"].extend(g["data_model"]["tables"])

        if g.get("ui", {}).get("modules"):
            ui = merged.setdefault("ui", {"modules": []})
            ui["modules"].extend(g["ui"]["modules"])

        if g.get("navigation", {}).get("menu"):
            nav = merged.setdefault("navigation", {"menu": []})
            nav["menu"].extend(g["navigation"]["menu"])

    return merged


def _clean_yaml(text: str) -> str:
    import re
    text = re.sub(r"```ya?ml\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    return text.strip()


def _parse_yaml(text: str) -> dict | None:
    try:
        result = yaml.safe_load(text)
        if isinstance(result, dict):
            return result
    except yaml.YAMLError:
        pass
    return None
