"""Deep Analysis Agent — second-pass extraction of behavioral logic, processes, and events."""

from __future__ import annotations

import logging
import time

import yaml

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are performing a second-pass deep analysis of a ServiceNow-derived Application Genome.

Your goal is to extract deeper behavioral logic and normalize it into reusable transformation patterns.

---

### INPUT

You will receive:

1. The original ServiceNow update set XML
2. A previously generated genome

---

### GOAL

Enhance the genome with:

- explicit workflows
- inferred business processes
- reusable logic patterns

---

### ADD THIS SECTION TO THE GENOME

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

### EXTRACTION FOCUS

Identify patterns like:

- inventory management
- approval flows
- request lifecycle
- status transitions
- data mutations (increment/decrement/update)

---

### EXAMPLE (ABSTRACTION)

Instead of:
"onCheckoutCreated(current, previous)"

Output:

- name: decrement_inventory_on_checkout
  trigger: checkout_created
  action: reduce inventory count
  reusable_pattern: inventory_decrement

---

### IMPORTANT

- Convert ALL logic into business-readable actions
- Remove ServiceNow-specific terminology where possible
- Make patterns reusable across platforms

---

Return ONLY the updated YAML genome.

Do not explain."""


async def run_deep_analysis(
    combined_xml: str,
    first_pass_genome: dict,
    first_pass_yaml: str,
    llm_config: dict,
    max_tokens: int = 16384,
    on_progress=None,
) -> dict:
    """Run second-pass deep analysis on the genome.

    Takes the original XML + first-pass genome and extracts:
    - logic_patterns (reusable behavioral patterns)
    - processes (step-by-step business processes)
    - events (triggers and downstream effects)

    Returns:
        {
            "status": "ok",
            "genome": dict,         # merged genome with new sections
            "genome_yaml": str,     # full updated YAML
            "meta": dict,
            "latency_ms": int,
        }
    """
    t0 = time.time()
    if on_progress:
        await on_progress("deep_analysis", "running", {})

    from services.claude_client import call_llm

    # Build user message with both XML and first-pass genome
    # Limit XML to leave room for genome
    xml_content = combined_xml[:50000]

    user_message = f"""Perform a second-pass deep analysis on this ServiceNow application genome.

--- ORIGINAL UPDATE SET XML ---
{xml_content}
--- END XML ---

--- FIRST-PASS GENOME ---
{first_pass_yaml}
--- END GENOME ---

Enhance this genome by adding logic_patterns, processes, and events sections. Return the COMPLETE updated YAML genome with all original sections plus the new ones."""

    try:
        raw_text, meta = await call_llm(
            provider=llm_config["provider"],
            api_key=llm_config["api_key"],
            model=llm_config["model"],
            user_message=user_message,
            system_prompt=SYSTEM_PROMPT,
            max_tokens=max_tokens,
        )

        # Parse YAML
        genome_yaml = _clean_yaml(raw_text)
        genome = _parse_yaml(genome_yaml)

        if not genome:
            # If YAML parsing fails, try to extract just the new sections and merge
            genome = dict(first_pass_genome)
            genome_yaml = first_pass_yaml
            logger.warning("[deep_analysis] Could not parse full YAML, using first-pass genome")

        # Ensure the new sections exist (even if empty)
        genome.setdefault("logic_patterns", [])
        genome.setdefault("processes", [])
        genome.setdefault("events", [])

        latency_ms = int((time.time() - t0) * 1000)

        counts = {
            "logic_patterns": len(genome.get("logic_patterns", [])),
            "processes": len(genome.get("processes", [])),
            "events": len(genome.get("events", [])),
        }

        if on_progress:
            await on_progress("deep_analysis", "done", {
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
        logger.error("[deep_analysis] LLM call failed: %s", exc)
        if on_progress:
            await on_progress("deep_analysis", "error", {"error": str(exc)})
        return {"status": "error", "error": str(exc)}


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
