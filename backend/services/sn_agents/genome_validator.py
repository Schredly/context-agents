"""Genome Validator Agent — validate genome for completeness and rebuildability."""

from __future__ import annotations

import logging
import time

import yaml

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are validating a generated Application Genome for completeness and rebuildability.

---

### INPUT

A genome YAML

---

### GOAL

Identify gaps, risks, and missing components.

---

### OUTPUT

validation:

  completeness_score: (0-100)

  missing_components:
    - type:
      description:

  risks:
    - description:
      impact:

  recommendations:
    - action:

---

### CHECK FOR

- Missing workflows
- Missing relationships
- Incomplete business logic
- UI without backing data
- Data without UI or logic

---

### THINK

"Could this be rebuilt 1:1?"

---

Return ONLY YAML.

Do not explain."""


async def validate_genome(
    genome: dict,
    genome_yaml: str,
    llm_config: dict,
    max_tokens: int = 16384,
    on_progress=None,
) -> dict:
    """Validate genome for completeness and rebuildability.

    Returns:
        {
            "status": "ok",
            "validation": dict,
            "validation_yaml": str,
            "meta": dict,
            "latency_ms": int,
        }
    """
    t0 = time.time()
    if on_progress:
        await on_progress("genome_validator", "running", {})

    from services.claude_client import call_llm

    user_message = f"""Validate this Application Genome for completeness and rebuildability.

--- APPLICATION GENOME ---
{genome_yaml[:60000]}
--- END GENOME ---

Check for missing workflows, missing relationships, incomplete business logic, UI without backing data, and data without UI or logic. Return ONLY the validation YAML."""

    try:
        raw_text, meta = await call_llm(
            provider=llm_config["provider"],
            api_key=llm_config["api_key"],
            model=llm_config["model"],
            user_message=user_message,
            system_prompt=SYSTEM_PROMPT,
            max_tokens=max_tokens,
        )

        validation_yaml = _clean_yaml(raw_text)
        validation = _parse_yaml(validation_yaml)

        if not validation:
            logger.warning("[genome_validator] Could not parse validation YAML")
            if on_progress:
                await on_progress("genome_validator", "error", {"error": "Failed to parse validation YAML"})
            return {"status": "error", "error": "Failed to parse validation YAML"}

        # Extract validation key if nested
        if "validation" in validation and isinstance(validation["validation"], dict):
            inner = validation["validation"]
        else:
            inner = validation

        latency_ms = int((time.time() - t0) * 1000)

        score = inner.get("completeness_score", 0)
        missing = len(inner.get("missing_components", []))
        risks = len(inner.get("risks", []))
        recs = len(inner.get("recommendations", []))

        if on_progress:
            await on_progress("genome_validator", "done", {
                "completeness_score": score,
                "missing_components": missing,
                "risks": risks,
                "recommendations": recs,
                "latency_ms": latency_ms,
            })

        return {
            "status": "ok",
            "validation": inner,
            "validation_yaml": validation_yaml,
            "meta": meta,
            "latency_ms": latency_ms,
        }

    except Exception as exc:
        logger.error("[genome_validator] LLM call failed: %s", exc)
        if on_progress:
            await on_progress("genome_validator", "error", {"error": str(exc)})
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
