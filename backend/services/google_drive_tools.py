"""Google Drive tool implementations for the execution engine."""

from __future__ import annotations

import logging
import time

import httpx

from services.google_drive import GoogleDriveProvider, GoogleDriveError

logger = logging.getLogger(__name__)

DRIVE_API = "https://www.googleapis.com/drive/v3"
DRIVE_TIMEOUT = 30

_drive = GoogleDriveProvider()


async def _get_drive_config(tenant_id: str, app) -> dict:
    """Retrieve Google Drive config for a tenant from the store."""
    cfg = await app.state.drive_config_store.get_by_tenant(tenant_id)
    if cfg is None:
        raise RuntimeError(f"Google Drive not configured for tenant {tenant_id}")
    return {
        "root_folder_id": cfg.root_folder_id,
        "folder_name": cfg.folder_name,
    }


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def search_documents(tenant_id: str, payload: dict, app) -> dict:
    """Search Google Drive for documents.

    payload keys: query (str), folder_id (str, optional), access_token (str)
    """
    cfg = await _get_drive_config(tenant_id, app)
    query = payload.get("query", "")
    folder_id = payload.get("folder_id", cfg["root_folder_id"])
    access_token = payload.get("access_token", "")

    if not access_token:
        return {"status": "error", "error": "No access_token provided", "files": []}

    tokens = [t.strip() for t in query.split() if t.strip()]

    t0 = time.monotonic()
    try:
        files = await _drive.search_documents(
            access_token=access_token,
            folder_id=folder_id,
            tokens=tokens,
            limit=10,
        )
        latency_ms = int((time.monotonic() - t0) * 1000)
        return {
            "files": files,
            "count": len(files),
            "latency_ms": latency_ms,
        }
    except GoogleDriveError as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.error("Drive search_documents failed: %s", e)
        return {"status": "error", "error": str(e), "files": [], "latency_ms": latency_ms}


async def read_file(tenant_id: str, payload: dict, app) -> dict:
    """Read content of a Google Drive file.

    payload keys: file_id (str), access_token (str)
    """
    file_id = payload.get("file_id", "")
    access_token = payload.get("access_token", "")

    if not access_token:
        return {"status": "error", "error": "No access_token provided"}

    t0 = time.monotonic()
    try:
        # Try to export as plain text (works for Google Docs)
        async with httpx.AsyncClient(timeout=DRIVE_TIMEOUT) as client:
            # First try export (Google Docs)
            res = await client.get(
                f"{DRIVE_API}/files/{file_id}/export",
                params={"mimeType": "text/plain"},
                headers=_auth(access_token),
            )
            if res.status_code == 404 or res.status_code == 403:
                # Fall back to direct download (binary files)
                res = await client.get(
                    f"{DRIVE_API}/files/{file_id}",
                    params={"alt": "media"},
                    headers=_auth(access_token),
                )

        latency_ms = int((time.monotonic() - t0) * 1000)

        if not res.is_success:
            return {"status": "error", "error": f"HTTP {res.status_code}", "latency_ms": latency_ms}

        content = res.text[:10000]  # Cap content for safety
        return {
            "file_id": file_id,
            "content": content,
            "latency_ms": latency_ms,
        }
    except Exception as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.error("Drive read_file failed: %s", e)
        return {"status": "error", "error": str(e), "latency_ms": latency_ms}


async def create_file(tenant_id: str, payload: dict, app) -> dict:
    """Create a new file in Google Drive.

    payload keys: name (str), content (str), folder_id (str, optional), access_token (str)
    """
    cfg = await _get_drive_config(tenant_id, app)
    name = payload.get("name", "untitled.txt")
    content = payload.get("content", "")
    folder_id = payload.get("folder_id", cfg["root_folder_id"])
    access_token = payload.get("access_token", "")

    if not access_token:
        return {"status": "error", "error": "No access_token provided"}

    t0 = time.monotonic()
    try:
        result = await _drive.upload_document(
            access_token=access_token,
            folder_id=folder_id,
            filename=name,
            content=content,
        )
        latency_ms = int((time.monotonic() - t0) * 1000)
        return {
            "file_id": result.get("id", ""),
            "name": result.get("name", ""),
            "web_link": result.get("webViewLink", ""),
            "latency_ms": latency_ms,
        }
    except GoogleDriveError as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.error("Drive create_file failed: %s", e)
        return {"status": "error", "error": str(e), "latency_ms": latency_ms}
