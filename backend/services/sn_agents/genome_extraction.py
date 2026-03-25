"""SN Genome Extraction Agent — use LLM to extract structured genome from ServiceNow update set XML."""

from __future__ import annotations

import logging
import time

import yaml

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert ServiceNow architect and an AI system designed to extract structured application intelligence ("genomes") from ServiceNow update sets.

Your task is to analyze the provided ServiceNow update set XML and convert it into a structured "Application Genome".

---

### GENOME STRUCTURE

Return ONLY valid YAML in this structure:

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
      trigger: (before/after insert/update/delete)
      logic_summary:
      external_dependencies:

ui:
  modules:
    - name:
      table:
      type: (list/form/module)
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

---

### EXTRACTION RULES

1. Parse ALL sys_update_xml payloads
2. Identify:
   - sys_app → application
   - sys_app_module → UI/navigation
   - sys_script → business rules
   - item_option_new → catalog variables
   - question_choice → choice sets
3. Infer relationships between components
4. Summarize logic (do NOT copy raw scripts unless necessary)
5. Normalize names into readable business meaning
6. Group related components into logical workflows

---

### IMPORTANT

- DO NOT return raw XML
- DO NOT explain your answer
- DO NOT include commentary
- ONLY return YAML

---

### OUTPUT QUALITY

This should read like a clean, platform-neutral application model that could be rebuilt on another platform.

Think:
"Could an engineer rebuild this app from this output?"

If not, improve the structure."""


async def extract_sn_genome(
    combined_xml: str,
    update_sets: list[dict],
    product_area: str,
    module: str,
    user_notes: str,
    llm_config: dict,
    max_tokens: int = 16384,
    on_progress=None,
) -> dict:
    """Use LLM to extract genome from ServiceNow update set XML.

    Returns:
        {
            "status": "ok",
            "genome_yaml": str,
            "genome": dict,
            "meta": dict,
            "latency_ms": int,
        }
    """
    t0 = time.time()
    if on_progress:
        await on_progress("genome_extraction", "running", {})

    from services.claude_client import call_llm

    # Build user message with XML content
    # Limit to ~80k chars to stay within token limits
    xml_content = combined_xml[:80000]

    file_summary = ", ".join(f"{us['name']} ({us['records']} records)" for us in update_sets)

    user_message = f"""Analyze these ServiceNow update set XML files and extract the application genome.

Update Sets: {file_summary}
Product Area: {product_area}
Module: {module}
{f'Additional context: {user_notes}' if user_notes else ''}

--- UPDATE SET XML ---
{xml_content}
--- END XML ---

Extract a complete application genome in YAML format. Be thorough — capture every entity, catalog item, workflow, business rule, UI module, and integration. Return ONLY the YAML."""

    try:
        raw_text, meta = await call_llm(
            provider=llm_config["provider"],
            api_key=llm_config["api_key"],
            model=llm_config["model"],
            user_message=user_message,
            system_prompt=SYSTEM_PROMPT,
            max_tokens=max_tokens,
        )

        # Parse YAML from response
        genome_yaml = _clean_yaml(raw_text)
        genome = _parse_yaml(genome_yaml)

        if not genome:
            genome = {"application": {"name": "Unknown", "description": raw_text[:500]}}

        latency_ms = int((time.time() - t0) * 1000)

        # Count extracted elements
        counts = _count_elements(genome)

        if on_progress:
            await on_progress("genome_extraction", "done", {
                **counts,
                "latency_ms": latency_ms,
            })

        return {
            "status": "ok",
            "genome_yaml": genome_yaml,
            "genome": genome,
            "meta": meta,
            "latency_ms": latency_ms,
        }

    except Exception as exc:
        logger.error("[sn_genome_extraction] LLM call failed: %s", exc)
        if on_progress:
            await on_progress("genome_extraction", "error", {"error": str(exc)})
        return {"status": "error", "error": str(exc)}


def _clean_yaml(text: str) -> str:
    """Strip markdown fences and leading/trailing whitespace."""
    import re
    text = re.sub(r"```ya?ml\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    return text.strip()


def _parse_yaml(text: str) -> dict | None:
    """Try to parse YAML from LLM response."""
    try:
        result = yaml.safe_load(text)
        if isinstance(result, dict):
            return result
    except yaml.YAMLError:
        pass
    return None


def _count_elements(genome: dict) -> dict:
    """Count extracted genome elements for progress reporting."""
    entities = len(genome.get("entities", []))
    catalog_items = len(genome.get("catalog", {}).get("items", []))
    workflows = len(genome.get("workflows", []))
    rules = len(genome.get("business_logic", {}).get("rules", []))
    tables = len(genome.get("data_model", {}).get("tables", []))
    integrations = len(genome.get("integrations", []))
    return {
        "entities": entities,
        "catalog_items": catalog_items,
        "workflows": workflows,
        "rules": rules,
        "tables": tables,
        "integrations": integrations,
    }
