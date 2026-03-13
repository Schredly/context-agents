"""Execute an action by resolving parameters from run context and dispatching to integrations."""

from __future__ import annotations

import logging

from models import Action, AgentUIRun
from services import servicenow_tools, google_drive_tools, jira_tools, slack_tools, pdf_tools, replit_tools, snow_to_replit, snow_to_github

logger = logging.getLogger(__name__)

# Map: (integration_id, operation) -> handler function
# Each handler takes (tenant_id, resolved_params, app) -> dict
_OPERATION_HANDLERS: dict[str, callable] = {
    "servicenow:incident.create": servicenow_tools.create_incident,
    "servicenow:kb_knowledge.create": servicenow_tools.create_knowledge_article,
    "google-drive:knowledge_doc.create": google_drive_tools.create_knowledge_doc,
    "jira:issue.create": jira_tools.create_issue,
    "slack:message.post": slack_tools.post_message,
    "internal:pdf.generate": pdf_tools.generate_pdf,
    "replit:application.build": replit_tools.build_application_action,
    "servicenow:catalog_to_replit": snow_to_replit.convert_catalog_to_replit,
    "servicenow:catalog_by_title_to_replit": snow_to_replit.convert_catalog_by_title_to_replit,
    "servicenow:catalog_to_github": snow_to_github.convert_catalog_to_github,
}


def _resolve_parameters(
    action: Action,
    run: AgentUIRun | None,
    user_input: dict,
) -> dict:
    """Resolve action parameters into a flat dict of name -> value."""
    resolved = {}
    for param in action.parameters:
        source = param.source.lower().replace(" ", "_")

        if source == "static":
            resolved[param.name] = param.value or ""
        elif source == "user_prompt":
            resolved[param.name] = (run.prompt if run else "") or user_input.get(param.name, "")
        elif source == "agent_result":
            resolved[param.name] = (run.result if run else "") or user_input.get(param.name, "")
        elif source == "user_input":
            resolved[param.name] = user_input.get(param.name, param.value or "")
        elif source == "agent_metadata":
            # Future: pull from run metadata
            resolved[param.name] = param.value or ""
        else:
            resolved[param.name] = param.value or ""

    return resolved


async def execute_action(
    action: Action,
    run: AgentUIRun | None,
    user_input: dict,
    app,
) -> dict:
    """Execute an action: resolve params, dispatch to integration handler, return result."""
    tenant_id = action.tenant_id

    # Resolve parameters
    resolved = _resolve_parameters(action, run, user_input)
    logger.info("Executing action %s (%s:%s) with params: %s",
                action.id, action.integration_id, action.operation, list(resolved.keys()))

    # Find handler
    handler_key = f"{action.integration_id}:{action.operation}"
    handler = _OPERATION_HANDLERS.get(handler_key)

    if handler is None:
        return {
            "status": "not_implemented",
            "action_id": action.id,
            "action_name": action.name,
            "message": f"Operation {action.integration_id}/{action.operation} is not yet connected. Configure the integration to enable this action.",
        }

    try:
        result = await handler(tenant_id, resolved, app)
        return {
            "status": result.get("status", "ok"),
            "action_id": action.id,
            "action_name": action.name,
            **result,
        }
    except Exception as e:
        logger.exception("Action %s execution failed", action.id)
        error_msg = str(e) or f"{type(e).__name__}: {repr(e)}"
        return {
            "status": "error",
            "action_id": action.id,
            "action_name": action.name,
            "error": error_msg,
        }
