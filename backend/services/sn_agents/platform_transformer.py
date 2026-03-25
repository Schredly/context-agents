"""Platform Transformer Agent — convert SN genome into platform-neutral portable architecture."""

from __future__ import annotations

import logging
import time

import yaml

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are transforming a ServiceNow-derived Application Genome into a platform-neutral, portable architecture model.

---

### INPUT

A completed Application Genome YAML.

---

### GOAL

Convert it into a **Platform-Neutral Genome** optimized for rebuilding on modern stacks (React, FastAPI, etc.)

---

### OUTPUT STRUCTURE

portable_genome:

  domain_model:
    entities: []

  application_services:
    - name:
      responsibilities:
      inputs:
      outputs:

  workflows:
    - name:
      steps:

  api_surface:
    - endpoint:
      method:
      purpose:

  ui_model:
    screens:
      - name:
        components:

  automation_rules:
    - name:
      trigger:
      action:

---

### TRANSFORMATION RULES

- Convert ServiceNow tables → domain entities
- Convert business rules → automation rules
- Convert modules → screens/views
- Convert catalog items → forms
- Convert workflows → service orchestration

---

### GOAL QUALITY

This output should be:

Rebuildable on:
- React frontend
- FastAPI backend
- Database (Postgres, etc.)

---

Return ONLY YAML.

Do not explain."""


async def transform_to_portable(
    genome: dict,
    genome_yaml: str,
    llm_config: dict,
    max_tokens: int = 16384,
    on_progress=None,
) -> dict:
    """Transform SN genome into platform-neutral portable architecture.

    Returns:
        {
            "status": "ok",
            "portable_genome": dict,
            "portable_yaml": str,
            "meta": dict,
            "latency_ms": int,
        }
    """
    t0 = time.time()
    if on_progress:
        await on_progress("platform_transformer", "running", {})

    from services.claude_client import call_llm

    user_message = f"""Transform this ServiceNow Application Genome into a platform-neutral, portable architecture model.

--- APPLICATION GENOME ---
{genome_yaml[:60000]}
--- END GENOME ---

Convert all ServiceNow-specific constructs into platform-neutral equivalents. Return ONLY the portable_genome YAML."""

    try:
        raw_text, meta = await call_llm(
            provider=llm_config["provider"],
            api_key=llm_config["api_key"],
            model=llm_config["model"],
            user_message=user_message,
            system_prompt=SYSTEM_PROMPT,
            max_tokens=max_tokens,
        )

        portable_yaml = _clean_yaml(raw_text)
        portable_genome = _parse_yaml(portable_yaml)

        if not portable_genome:
            logger.warning("[platform_transformer] Could not parse portable YAML")
            if on_progress:
                await on_progress("platform_transformer", "error", {"error": "Failed to parse portable genome YAML"})
            return {"status": "error", "error": "Failed to parse portable genome YAML"}

        latency_ms = int((time.time() - t0) * 1000)

        # Extract the portable_genome key if nested
        if "portable_genome" in portable_genome:
            inner = portable_genome["portable_genome"]
        else:
            inner = portable_genome

        counts = {
            "entities": len(inner.get("domain_model", {}).get("entities", [])),
            "services": len(inner.get("application_services", [])),
            "workflows": len(inner.get("workflows", [])),
            "api_endpoints": len(inner.get("api_surface", [])),
            "screens": len(inner.get("ui_model", {}).get("screens", [])),
            "automation_rules": len(inner.get("automation_rules", [])),
        }

        if on_progress:
            await on_progress("platform_transformer", "done", {
                **counts,
                "latency_ms": latency_ms,
            })

        return {
            "status": "ok",
            "portable_genome": inner,
            "portable_yaml": portable_yaml,
            "meta": meta,
            "latency_ms": latency_ms,
        }

    except Exception as exc:
        logger.error("[platform_transformer] LLM call failed: %s", exc)
        if on_progress:
            await on_progress("platform_transformer", "error", {"error": str(exc)})
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
