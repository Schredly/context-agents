"""Slack tool implementations for the action execution engine."""

from __future__ import annotations

import logging
import time

import httpx

logger = logging.getLogger(__name__)

SLACK_TIMEOUT = 10


async def _get_slack_config(tenant_id: str, app) -> dict:
    """Retrieve Slack config for a tenant from the integration store."""
    store = app.state.integration_store
    integration = await store.get_by_type(tenant_id, "slack")
    if integration is None or not integration.config:
        raise RuntimeError(f"Slack not configured for tenant {tenant_id}")
    cfg = integration.config
    if not cfg.get("webhook_url"):
        raise RuntimeError("Slack integration is missing the webhook URL")
    return {"webhook_url": cfg["webhook_url"]}


async def post_message(tenant_id: str, payload: dict, app) -> dict:
    """Post a message to Slack via an Incoming Webhook.

    payload keys: text (str), channel (str, optional — only for display)
    """
    try:
        cfg = await _get_slack_config(tenant_id, app)
    except RuntimeError as e:
        return {"status": "error", "error": str(e)}

    text = payload.get("text", "")
    channel = payload.get("channel", "")

    if not text:
        return {"status": "error", "error": "Message text is required"}

    body: dict = {"text": text}

    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=SLACK_TIMEOUT) as client:
            res = await client.post(cfg["webhook_url"], json=body)
        latency_ms = int((time.monotonic() - t0) * 1000)

        if not res.is_success:
            logger.error("Slack post_message failed (%s): %s", res.status_code, res.text[:200])
            return {"status": "error", "error": f"Slack returned HTTP {res.status_code}: {res.text[:200]}", "latency_ms": latency_ms}

        return {
            "status": "ok",
            "channel": channel or "(webhook default)",
            "latency_ms": latency_ms,
        }
    except Exception as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.error("Slack post_message exception: %s", e)
        return {"status": "error", "error": str(e), "latency_ms": latency_ms}
