"""Central tool executor — dispatches tool calls to integration-specific implementations."""

from __future__ import annotations

import logging

from models import TOOL_CATALOG_BY_ID
from services import servicenow_tools, google_drive_tools

logger = logging.getLogger(__name__)

# Map: (integration_type, action) -> handler function
_HANDLERS: dict[str, callable] = {
    "servicenow.search_incidents": servicenow_tools.search_incidents,
    "servicenow.get_incident_details": servicenow_tools.get_incident_details,
    "servicenow.search_kb": servicenow_tools.search_kb,
    "servicenow.add_work_note": servicenow_tools.add_work_note,
    "google-drive.search_documents": google_drive_tools.search_documents,
    "google-drive.read_file": google_drive_tools.read_file,
    "google-drive.create_file": google_drive_tools.create_file,
}


async def execute_tool(
    tenant_id: str,
    tool_id: str,
    input_payload: dict,
    app,
) -> dict:
    """Execute a tool by its catalog ID.

    Returns the tool response dict.  For unimplemented tools returns
    {"status": "not_implemented", "tool_id": tool_id}.
    """
    # Validate tool exists in catalog
    if tool_id not in TOOL_CATALOG_BY_ID:
        logger.warning("Unknown tool_id: %s", tool_id)
        return {"status": "not_implemented", "tool_id": tool_id}

    handler = _HANDLERS.get(tool_id)
    if handler is None:
        return {"status": "not_implemented", "tool_id": tool_id}

    try:
        result = await handler(tenant_id, input_payload, app)
        return result
    except RuntimeError as e:
        # Config not found — return error rather than crash
        logger.error("Tool %s config error: %s", tool_id, e)
        return {"status": "error", "tool_id": tool_id, "error": str(e)}
    except Exception as e:
        logger.exception("Tool %s unexpected error", tool_id)
        return {"status": "error", "tool_id": tool_id, "error": str(e)}
