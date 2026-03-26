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
    fields:
      - name:
        type:        # string | integer | decimal | boolean | reference | datetime | date | choice
        required:    # true/false
        choices: [] # only for choice fields — list the actual option values found in XML
    relationships:
      - target_table:
        type:        # has_many | belongs_to | many_to_many
        via_field:

catalog:
  items:
    - name:
      description:
      variables:
        - name:
          label:     # human-readable label from the XML
          type:      # see CATALOG VARIABLE TYPES below — use the label, not the number
          required:
          order:
          choices: [] # for choice/select fields — list the actual options

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
      key_fields:
        - name:
          type:
          notes:

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
   - sys_db_object → tables (extract ALL fields from sys_dictionary records for that table)
   - sys_app_module → UI/navigation
   - sys_script / sys_business_rule → business rules
   - item_option_new → catalog variables (apply CATALOG VARIABLE TYPE FILTER below)
   - question_choice → choice sets (attach to the parent variable)
   - sys_choice → global choice lists
3. Infer relationships between components
4. Summarize logic (do NOT copy raw scripts unless necessary)
5. Normalize names into readable business meaning
6. Group related components into logical workflows

---

### CRITICAL: COMPLETE DATA MODEL

Every table referenced anywhere in the genome MUST appear in data_model.tables.

Specifically:
- If a business rule's `table` field names a table not yet in data_model → ADD IT with inferred fields
- If a UI module's `table` field names a table not yet in data_model → ADD IT with inferred fields
- If a script references a table via GlideRecord → ADD IT if not already present

When inferring fields for a table that has no sys_dictionary records in the XML:
- Use every clue available: filter expressions, field names in scripts, choice list names, column references
- For example, `filter: status=checked_out` implies a `status` field with at least `checked_out` as a choice value
- Always include: `sys_id`, `created_on`, `created_by`, `updated_on`, `updated_by` as standard fields
- Mark inferred fields with `notes: "inferred"` so downstream tools know

---

### CATALOG VARIABLE TYPE FILTER

item_option_new records have a numeric `type` field. ONLY include variables with these types:

| Type | Label        | Include? |
|------|--------------|----------|
| 1    | text         | YES      |
| 2    | yes_no       | YES      |
| 3    | multi_select | YES      |
| 4    | numeric      | YES      |
| 5    | checkbox     | YES      |
| 6    | reference    | YES      |
| 7    | datetime     | YES      |
| 8    | date         | YES      |
| 9    | time         | YES      |
| 10   | select       | YES      |
| 14   | label        | NO — layout only |
| 16   | wide_text    | YES      |
| 18   | lookup_select| YES      |
| 20   | container_end| NO — layout only |
| 21   | multi_line   | YES      |
| 22   | masked       | YES      |
| 23   | email        | YES      |
| 24   | split        | NO — layout only |
| 25   | container    | NO — layout only |
| 26   | macro        | NO — layout only |
| 27   | ui_page      | NO — layout only |
| 28   | split_end    | NO — layout only |

If a catalog item has ONLY layout-type variables after filtering, mark the item's variables list as empty
and note: "variables: [] # all variables were layout containers — check for associated sc_cat_item records"

---

### IMPORTANT

- DO NOT return raw XML
- DO NOT explain your answer
- DO NOT include commentary
- ONLY return YAML

---

### OUTPUT QUALITY

This should read like a clean, platform-neutral application model that could be rebuilt on another platform.

Ask yourself before returning:
1. Does every table referenced in business_logic or ui have an entry in data_model?
2. Does every entity have typed fields, not just field name strings?
3. Does every catalog item have only real input variables (no layout containers)?
4. Are choice fields populated with their actual option values?

If any answer is NO, fix it before returning."""


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

    # XML is already bounded by XMLHydrationLoop (MAX_TOTAL_CHARS).
    # No truncation needed — the loop ensures we're within token budget.
    xml_content = combined_xml

    file_summary = ", ".join(f"{us['name']} ({us['records']} records)" for us in update_sets)

    user_message = f"""Analyze these ServiceNow update set XML files and extract the application genome.

Update Sets: {file_summary}
Product Area: {product_area}
Module: {module}
{f'Additional context: {user_notes}' if user_notes else ''}

--- UPDATE SET XML ---
{xml_content}
--- END XML ---

Extract a complete application genome in YAML format.

Requirements:
- Capture every entity with TYPED fields (not just field name strings)
- Include every table referenced in business rules or UI modules in data_model, even if not explicitly defined in the XML — infer fields from context
- Filter catalog variables: exclude layout container types (20, 24, 25, 26, 27, 28) — only keep real input fields
- Populate choice field values from question_choice and sys_choice records in the XML
- Cross-check: every table in business_logic[].table and ui.modules[].table must appear in data_model

Return ONLY the YAML."""

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
