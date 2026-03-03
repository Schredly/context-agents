from __future__ import annotations

import logging
import os

import httpx


logger = logging.getLogger(__name__)


class ServiceNowError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.injected: bool = False


class ServiceNowProvider:
    """Stateless provider for ServiceNow REST Table API calls."""

    async def update_work_notes(
        self,
        instance_url: str,
        username: str,
        password: str,
        sys_id: str,
        work_notes: str,
        *,
        tenant_id: str = "",
    ) -> None:
        """PATCH /api/now/table/incident/{sys_id} to append work_notes."""
        # --- Failure injection ---
        if os.environ.get("FAIL_SERVICENOW_WRITEBACK", "").lower() == "true":
            logger.warning(
                "[INJECTED FAILURE] ServiceNow writeback: tenant_id=%s sys_id=%s",
                tenant_id, sys_id,
            )
            exc = ServiceNowError(503, "[INJECTED] ServiceNow writeback failure")
            exc.injected = True
            raise exc

        url = f"{instance_url.rstrip('/')}/api/now/table/incident/{sys_id}"
        logger.debug(
            "Writeback starting: tenant_id=%s sys_id=%s url=%s",
            tenant_id, sys_id, url,
        )
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.patch(
                url,
                auth=(username, password),
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json={"work_notes": work_notes},
            )
        if not res.is_success:
            detail = ""
            try:
                body = res.json()
                detail = body.get("error", {}).get("message", "")
            except Exception:
                pass
            error_msg = detail or f"ServiceNow API error ({res.status_code})"
            logger.error(
                "Writeback failed: tenant_id=%s sys_id=%s http_status=%d error=%s",
                tenant_id, sys_id, res.status_code, error_msg,
            )
            raise ServiceNowError(res.status_code, error_msg)

        logger.debug(
            "Writeback succeeded: tenant_id=%s sys_id=%s http_status=%d",
            tenant_id, sys_id, res.status_code,
        )


def format_work_notes(
    summary: str,
    steps: list[str],
    sources: list[dict[str, str]],
    confidence: float,
    run_id: str,
) -> str:
    """Format the run result into a stable, readable work notes string."""
    lines = [
        "[AI Resolution Recommendation]",
        "",
        "Summary:",
        summary,
        "",
    ]

    if steps:
        lines.append("Recommended Steps:")
        for i, step in enumerate(steps, 1):
            lines.append(f"  {i}. {step}")
        lines.append("")

    if sources:
        lines.append("Sources:")
        for src in sources:
            title = src.get("title", "Untitled")
            url = src.get("url", "")
            if url:
                lines.append(f"  - {title}: {url}")
            else:
                lines.append(f"  - {title}")
        lines.append("")

    lines.append(f"Confidence: {confidence:.2f}")
    lines.append(f"Run ID: {run_id}")

    return "\n".join(lines)
