"""Google Drive tool implementations for the execution engine."""

from __future__ import annotations

import logging
import re
import time

import httpx

from services.google_drive import GoogleDriveProvider, GoogleDriveError, FOLDER_MIME

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


# ---------------------------------------------------------------------------
# Smart knowledge doc creation — find best-fit folder, upload .md
# ---------------------------------------------------------------------------


async def _list_subfolders(access_token: str, parent_id: str) -> list[dict]:
    """List immediate child folders of a parent."""
    q = f"'{parent_id}' in parents and mimeType='{FOLDER_MIME}' and trashed=false"
    async with httpx.AsyncClient(timeout=DRIVE_TIMEOUT) as client:
        res = await client.get(
            f"{DRIVE_API}/files",
            params={
                "q": q,
                "fields": "files(id,name)",
                "pageSize": "100",
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if not res.is_success:
        return []
    return res.json().get("files", [])


def _score_folder(folder_name: str, tokens: set[str]) -> int:
    """Score a folder name against prompt tokens — higher is better."""
    name_tokens = set(re.split(r"[\s_\-/]+", folder_name.lower()))
    return len(name_tokens & tokens)


async def _find_best_folder(
    access_token: str, root_id: str, tokens: set[str], max_depth: int = 3
) -> tuple[str, str]:
    """Walk the folder tree greedily, picking the child with the best token overlap.

    Returns (folder_id, path_string) of the deepest matching folder.
    Falls back to root if no children match.
    """
    current_id = root_id
    path_parts: list[str] = []

    for _ in range(max_depth):
        children = await _list_subfolders(access_token, current_id)
        if not children:
            break
        scored = [(child, _score_folder(child["name"], tokens)) for child in children]
        scored.sort(key=lambda x: x[1], reverse=True)
        best_child, best_score = scored[0]
        if best_score == 0:
            break
        current_id = best_child["id"]
        path_parts.append(best_child["name"])

    return current_id, "/".join(path_parts) if path_parts else "(root)"


def _slugify(text: str, max_len: int = 60) -> str:
    """Turn a prompt into a filename-safe slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len]


async def create_knowledge_doc(tenant_id: str, payload: dict, app) -> dict:
    """Create a .md knowledge doc in the best-fit Drive folder.

    payload keys: title (str), content (str), access_token (str)
    """
    try:
        cfg = await _get_drive_config(tenant_id, app)
    except RuntimeError:
        return {"status": "error", "error": "Google Drive not configured — set up the integration in Settings first"}

    title = payload.get("title", "Untitled")
    content = payload.get("content", "")
    access_token = payload.get("access_token", "")

    if not access_token:
        return {"status": "error", "error": "No access_token provided — connect Google Drive in Settings"}

    root_id = cfg["root_folder_id"]
    tokens = set(re.split(r"\s+", title.lower()))

    t0 = time.monotonic()
    try:
        # Navigate to AgenticKnowledge/{tenant_id}/dimensions/ if it exists
        ak_folders = await _list_subfolders(access_token, root_id)
        ak = next((f for f in ak_folders if f["name"] == "AgenticKnowledge"), None)
        search_root = root_id
        if ak:
            tenant_folders = await _list_subfolders(access_token, ak["id"])
            tenant_f = next((f for f in tenant_folders if f["name"] == tenant_id), None)
            if tenant_f:
                dims = await _list_subfolders(access_token, tenant_f["id"])
                dims_f = next((f for f in dims if f["name"] == "dimensions"), None)
                if dims_f:
                    search_root = dims_f["id"]

        # Find best-matching folder
        folder_id, folder_path = await _find_best_folder(access_token, search_root, tokens)

        # Build markdown content
        filename = f"{_slugify(title)}.md"
        md_content = f"# {title}\n\n{content}\n"

        result = await _drive.upload_document(
            access_token=access_token,
            folder_id=folder_id,
            filename=filename,
            content=md_content,
            mime_type="text/markdown",
        )
        latency_ms = int((time.monotonic() - t0) * 1000)

        return {
            "status": "ok",
            "file_id": result.get("id", ""),
            "name": result.get("name", ""),
            "web_link": result.get("webViewLink", ""),
            "folder_path": folder_path,
            "latency_ms": latency_ms,
        }
    except GoogleDriveError as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.error("Drive create_knowledge_doc failed: %s", e)
        return {"status": "error", "error": str(e), "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.error("Drive create_knowledge_doc unexpected error: %s", e)
        return {"status": "error", "error": str(e), "latency_ms": latency_ms}
