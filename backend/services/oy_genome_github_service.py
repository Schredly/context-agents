"""OYGenomeGitHubService — commits genome artifacts to GitHub.

Pipeline position:
    Genome YAML → **OYGenomeGitHubService** → GitHub Commit

This service:
  1. Resolves the tenant's GitHub integration
  2. Builds the prescribed directory structure
  3. Commits genome.yaml, graph.yaml, structure/, config/, data/ to the repo

GitHub structure:
    genomes/tenants/{tenant}/vendors/{vendor}/{product_module}/
        genome.yaml              — canonical normalized genome
        graph.yaml               — structured GenomeGraph
        structure/{item}.yaml    — per-item structure files
        config/catalog_config.yaml
        data/raw_vendor_payload.json
        transformations/         — created only when translations/re-prompts modify content
"""

from __future__ import annotations

import json
import logging

import yaml

from services.snow_to_github import (
    _load_github_targets,
    _parse_repo_ref,
    _ensure_repo,
    _commit_files_to_repo,
    _scrub_secrets,
)

logger = logging.getLogger(__name__)


async def commit_genome(
    tenant_id: str,
    vendor: str,
    application: str,
    depth: str,
    normalized_genome: dict | None,
    genome_document: dict | None,
    genome_graph: dict | None,
    raw_vendor_payload: dict | None,
    app,
) -> dict:
    """Commit genome artifacts to GitHub.

    Returns:
        {
            "status": "ok" | "error",
            "repo_url": str,
            "commit_hash": str,
            "files_pushed": list[str],
            "file_count": int,
            "error": str | None,
        }
    """
    # Resolve GitHub target
    targets = await _load_github_targets(tenant_id, app)
    if not targets:
        return {"status": "error", "error": "No GitHub integration configured"}

    target = targets[0]
    if not target.token:
        return {"status": "error", "error": "GitHub integration has no access token"}

    owner, repo_name = _parse_repo_ref(target.default_repo, target.org)
    if not owner:
        return {"status": "error", "error": "GitHub integration missing org/owner"}

    headers = {
        "Authorization": f"Bearer {target.token}",
        "Accept": "application/vnd.github+json",
    }

    # Build file tree
    app_slug = application.lower().replace(" ", "_").replace("/", "_")
    base = f"genomes/tenants/{tenant_id}/vendors/{vendor}/{app_slug}"

    files: dict[str, str] = {}

    # genome.yaml — canonical normalized genome
    if normalized_genome:
        files[f"{base}/genome.yaml"] = yaml.dump(
            normalized_genome, default_flow_style=False, sort_keys=False,
        )

    # graph.yaml — structured GenomeGraph
    if genome_graph:
        files[f"{base}/graph.yaml"] = yaml.dump(
            genome_graph, default_flow_style=False, sort_keys=False,
        )

    # structure/ — per-item YAML files
    items = _get_items(raw_vendor_payload)
    for item in items:
        item_name = item.get("name", "unknown")
        item_slug = item_name.lower().replace(" ", "_").replace("(", "").replace(")", "")
        structure_data = {
            "name": item_name,
            "category": item.get("category", ""),
            "description": item.get("short_description", item.get("description", "")),
            "active": item.get("active", True),
            "variables": [
                {
                    "name": v.get("name", ""),
                    "type": v.get("type", ""),
                    "mandatory": v.get("mandatory", False),
                    "question": v.get("question_text", ""),
                }
                for v in item.get("variables", [])
                if v.get("name")
            ],
        }
        files[f"{base}/structure/{item_slug}.yaml"] = yaml.dump(
            structure_data, default_flow_style=False, sort_keys=False,
        )

    # config/ — pricing and workflow config
    config_items = []
    for item in items:
        cfg = {"name": item.get("name", "")}
        if item.get("price"):
            cfg["price"] = item["price"]
        if item.get("recurring_price"):
            cfg["recurring_price"] = item["recurring_price"]
        if item.get("workflow"):
            cfg["workflow"] = item["workflow"]
        config_items.append(cfg)
    if config_items:
        files[f"{base}/config/catalog_config.yaml"] = yaml.dump(
            config_items, default_flow_style=False, sort_keys=False,
        )

    # data/ — raw vendor payload (JSON)
    if raw_vendor_payload:
        files[f"{base}/data/raw_vendor_payload.json"] = json.dumps(raw_vendor_payload, indent=2)

    # Scrub secrets from all files
    files = {path: _scrub_secrets(content) for path, content in files.items()}

    if not files:
        return {"status": "error", "error": "No files to commit"}

    # Ensure repo exists
    repo = await _ensure_repo(owner, repo_name, headers, description=f"Genome: {application}")
    if not repo["ok"]:
        return {"status": "error", "error": repo["error"]}

    # Commit with structured message
    commit_msg = (
        f"Capture genome\n\n"
        f"Tenant: {tenant_id}\n"
        f"Vendor: {vendor}\n"
        f"Application: {application}\n"
        f"Depth: {depth}"
    )

    import services.snow_to_github as _gh
    original_msg = _gh.COMMIT_MESSAGE
    _gh.COMMIT_MESSAGE = commit_msg

    result = await _commit_files_to_repo(owner, repo_name, files, headers)

    _gh.COMMIT_MESSAGE = original_msg

    if not result["pushed"]:
        return {"status": "error", "error": "Failed to commit files to GitHub", "errors": result.get("errors", [])}

    logger.info("[oy_github] Committed %d files to %s/%s", len(result["pushed"]), owner, repo_name)

    return {
        "status": "ok",
        "repo_url": repo["repo_url"],
        "commit_hash": result["commit_hash"],
        "files_pushed": result["pushed"],
        "file_count": len(result["pushed"]),
    }


def _get_items(raw: dict | None) -> list[dict]:
    """Extract items list from raw vendor payload, handling common wrappers."""
    if not raw or not isinstance(raw, dict):
        return []
    items = raw.get("items", [])
    if not isinstance(items, list):
        return []
    # Unwrap {item: {...}} wrappers
    result = []
    for entry in items:
        if isinstance(entry, dict):
            result.append(entry.get("item", entry) if "item" in entry else entry)
    return result
