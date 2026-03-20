"""GitHub Provider — file and branch operations against a GitHub repo via the API.

Tenant-scoped: every call requires the tenant's GitHub integration token.
"""

from __future__ import annotations

import base64
import logging

import httpx

from services.snow_to_github import _load_github_targets, _parse_repo_ref

logger = logging.getLogger(__name__)

_TIMEOUT = 15.0


async def _resolve(tenant_id: str, app) -> tuple[str, str, dict] | None:
    """Resolve owner, repo, and auth headers from the tenant's GitHub integration."""
    targets = await _load_github_targets(tenant_id, app)
    if not targets:
        return None
    target = targets[0]
    if not target.token:
        return None
    owner, repo = _parse_repo_ref(target.default_repo, target.org)
    if not owner:
        return None
    headers = {
        "Authorization": f"Bearer {target.token}",
        "Accept": "application/vnd.github+json",
    }
    return owner, repo, headers


# ---------------------------------------------------------------------------
# Branch operations
# ---------------------------------------------------------------------------


async def create_branch(tenant_id: str, branch_name: str, app, base_branch: str = "main") -> dict | None:
    """Create a new branch from the given base branch."""
    resolved = await _resolve(tenant_id, app)
    if not resolved:
        return None
    owner, repo, headers = resolved

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            # Get SHA of base branch
            ref_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/git/ref/heads/{base_branch}",
                headers=headers,
            )
            if not ref_resp.is_success:
                logger.warning("[github_provider] Base branch '%s' not found: HTTP %s", base_branch, ref_resp.status_code)
                return None
            base_sha = ref_resp.json()["object"]["sha"]

            # Create new branch
            create_resp = await client.post(
                f"https://api.github.com/repos/{owner}/{repo}/git/refs",
                headers=headers,
                json={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
            )
            if create_resp.is_success:
                logger.info("[github_provider] Created branch: %s", branch_name)
                return {"branch": branch_name, "sha": base_sha}
            elif create_resp.status_code == 422:
                # Branch already exists
                logger.info("[github_provider] Branch '%s' already exists", branch_name)
                return {"branch": branch_name, "sha": base_sha, "existed": True}
            else:
                logger.warning("[github_provider] Create branch failed: HTTP %s", create_resp.status_code)
                return None
    except Exception as exc:
        logger.error("[github_provider] create_branch error: %s", exc)
        return None


# ---------------------------------------------------------------------------
# File operations
# ---------------------------------------------------------------------------


async def list_files(tenant_id: str, path: str, app) -> list[dict]:
    """List files/folders at a given path in the repo."""
    resolved = await _resolve(tenant_id, app)
    if not resolved:
        return []
    owner, repo, headers = resolved

    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
        if not resp.is_success:
            return []
        data = resp.json()
        if isinstance(data, list):
            return [{"name": f["name"], "type": f["type"], "path": f["path"], "sha": f.get("sha", "")} for f in data]
        return [{"name": data["name"], "type": data["type"], "path": data["path"], "sha": data.get("sha", "")}]
    except Exception as exc:
        logger.error("[github_provider] list_files error: %s", exc)
        return []


async def get_file(tenant_id: str, path: str, app, branch: str = "") -> dict | None:
    """Get a file's content from the repo."""
    resolved = await _resolve(tenant_id, app)
    if not resolved:
        return None
    owner, repo, headers = resolved

    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    if branch:
        url += f"?ref={branch}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
        if not resp.is_success:
            return None
        data = resp.json()
        content = ""
        if data.get("content"):
            content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
        return {"path": data["path"], "name": data["name"], "sha": data.get("sha", ""), "content": content, "size": data.get("size", 0)}
    except Exception as exc:
        logger.error("[github_provider] get_file error: %s", exc)
        return None


async def create_or_update_file(
    tenant_id: str, path: str, content: str, message: str, app, branch: str = "",
) -> dict | None:
    """Create or update a file in the repo, optionally on a specific branch."""
    resolved = await _resolve(tenant_id, app)
    if not resolved:
        return None
    owner, repo, headers = resolved

    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    encoded = base64.b64encode(content.encode()).decode()

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            # Check if file exists (need SHA for update)
            check_url = url + (f"?ref={branch}" if branch else "")
            existing = await client.get(check_url, headers=headers)
            body: dict = {"message": message, "content": encoded}
            if branch:
                body["branch"] = branch
            if existing.is_success:
                body["sha"] = existing.json().get("sha", "")

            resp = await client.put(url, headers=headers, json=body)

        if resp.is_success:
            data = resp.json()
            return {
                "path": path,
                "sha": data.get("content", {}).get("sha", ""),
                "commit": data.get("commit", {}).get("sha", ""),
            }
        logger.warning("[github_provider] create_or_update %s: HTTP %s — %s", path, resp.status_code, resp.text[:200])
        return None
    except Exception as exc:
        logger.error("[github_provider] create_or_update error: %s", exc)
        return None


async def list_tree(tenant_id: str, path: str, app, depth: int = 3) -> list[dict]:
    """Recursively list the file tree up to a given depth."""
    items = await list_files(tenant_id, path, app)
    result = []
    for item in items:
        node = {"name": item["name"], "type": item["type"], "path": item["path"]}
        if item["type"] == "dir" and depth > 0:
            node["children"] = await list_tree(tenant_id, item["path"], app, depth - 1)
        result.append(node)
    return result
