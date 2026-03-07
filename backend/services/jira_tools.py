"""Jira tool implementations for the action execution engine."""

from __future__ import annotations

import logging
import time

import httpx

logger = logging.getLogger(__name__)

JIRA_TIMEOUT = 15


async def _get_jira_config(tenant_id: str, app) -> dict:
    """Retrieve Jira config for a tenant from the integration store."""
    store = app.state.integration_store
    integration = await store.get_by_type(tenant_id, "jira")
    if integration is None or not integration.config:
        raise RuntimeError(f"Jira not configured for tenant {tenant_id}")
    cfg = integration.config
    if not cfg.get("instance_url") or not cfg.get("username") or not cfg.get("api_token"):
        raise RuntimeError("Jira integration is missing required fields (instance_url, username, api_token)")
    return {
        "instance_url": cfg["instance_url"].rstrip("/"),
        "username": cfg["username"],
        "api_token": cfg["api_token"],
    }


async def create_issue(tenant_id: str, payload: dict, app) -> dict:
    """Create a Jira issue.

    payload keys: summary (str), description (str), project_key (str, optional),
                  issue_type (str, optional, default "Task")
    """
    try:
        cfg = await _get_jira_config(tenant_id, app)
    except RuntimeError as e:
        return {"status": "error", "error": str(e)}

    summary = payload.get("summary", "")
    description = payload.get("description", "")
    project_key = payload.get("project_key", "")
    issue_type = payload.get("issue_type", "Task")

    if not summary:
        return {"status": "error", "error": "Summary is required"}

    # If no project_key provided, try to get the first project
    if not project_key:
        try:
            async with httpx.AsyncClient(timeout=JIRA_TIMEOUT) as client:
                res = await client.get(
                    f"{cfg['instance_url']}/rest/api/3/project",
                    auth=(cfg["username"], cfg["api_token"]),
                    headers={"Accept": "application/json"},
                )
            if res.is_success:
                projects = res.json()
                if projects:
                    project_key = projects[0]["key"]
        except Exception:
            pass

    if not project_key:
        return {"status": "error", "error": "No project_key provided and could not auto-detect a Jira project"}

    # Build the issue payload using ADF for description
    body = {
        "fields": {
            "project": {"key": project_key},
            "summary": summary[:255],
            "issuetype": {"name": issue_type},
            "description": {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": description[:30000] or "No description provided."}],
                    }
                ],
            },
        }
    }

    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=JIRA_TIMEOUT) as client:
            res = await client.post(
                f"{cfg['instance_url']}/rest/api/3/issue",
                auth=(cfg["username"], cfg["api_token"]),
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                json=body,
            )
        latency_ms = int((time.monotonic() - t0) * 1000)

        if not res.is_success:
            detail = res.text[:500]
            try:
                err_body = res.json()
                errors = err_body.get("errors", {})
                error_msgs = err_body.get("errorMessages", [])
                detail = "; ".join(error_msgs) or "; ".join(f"{k}: {v}" for k, v in errors.items()) or detail
            except Exception:
                pass
            logger.error("Jira create_issue failed (%s): %s", res.status_code, detail)
            return {"status": "error", "error": detail, "latency_ms": latency_ms}

        data = res.json()
        issue_key = data.get("key", "")
        issue_url = f"{cfg['instance_url']}/browse/{issue_key}" if issue_key else ""

        return {
            "status": "ok",
            "key": issue_key,
            "id": data.get("id", ""),
            "url": issue_url,
            "number": issue_key,
            "latency_ms": latency_ms,
        }
    except Exception as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.error("Jira create_issue exception: %s", e)
        return {"status": "error", "error": str(e), "latency_ms": latency_ms}
