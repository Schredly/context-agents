"""Replit integration — authenticates via connect.sid JWT cookie.

Test Connection validates the JWT locally (structure + expiry) and verifies the username
via Replit's public profile page. No server-side cookie replay needed.
Build Application generates a pre-filled Replit create URL that opens in the user's browser.
"""

from __future__ import annotations

import base64
import json
import logging
import time
import urllib.parse

import httpx

logger = logging.getLogger(__name__)


async def _get_replit_config(tenant_id: str, app):
    cfg = await app.state.replit_config_store.get_by_tenant(tenant_id)
    if cfg is None:
        raise RuntimeError(f"Replit config not found for tenant {tenant_id}")
    return cfg


def _decode_jwt_payload(token: str) -> dict | None:
    """Decode the payload of a JWT without verifying the signature."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        # Add padding for base64
        payload_b64 = parts[1]
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        return json.loads(payload_bytes)
    except Exception:
        return None


async def verify_connection(connect_sid: str, username: str = "") -> dict:
    """Verify the connect.sid cookie is a valid JWT and the username exists on Replit."""
    connect_sid = connect_sid.strip().strip('"').strip("'")

    if not connect_sid:
        return {"ok": False, "detail": "Missing connect.sid cookie"}

    # Decode the JWT payload
    payload = _decode_jwt_payload(connect_sid)
    if payload is None:
        return {
            "ok": False,
            "detail": "Invalid connect.sid format — make sure you copied the full value from DevTools → Application → Cookies → replit.com → connect.sid",
        }

    # Check expiry
    exp = payload.get("exp")
    if exp and isinstance(exp, (int, float)):
        if time.time() > exp:
            return {"ok": False, "detail": "connect.sid has expired — sign in to Replit again and copy a fresh cookie"}

    # Extract info from the JWT
    jwt_user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")
    jwt_username = payload.get("username") or payload.get("name") or ""

    detail_parts = ["Session cookie is valid (JWT verified)"]
    if jwt_username:
        detail_parts[0] = f"Session cookie is valid — JWT user: {jwt_username}"
    elif jwt_user_id:
        detail_parts[0] = f"Session cookie is valid — JWT user ID: {jwt_user_id}"

    # Verify username via public profile if provided
    if username:
        user_result = await verify_username(username)
        if user_result["ok"]:
            detail_parts.append(f"@{username} verified on Replit")
        else:
            return user_result

    return {"ok": True, "detail": " — ".join(detail_parts)}


async def verify_username(username: str) -> dict:
    """Verify a Replit username exists by checking their profile page."""
    if not username:
        return {"ok": True, "detail": "No username to verify"}
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        resp = await client.get(
            f"https://replit.com/@{username}",
            headers={"User-Agent": "Mozilla/5.0"},
        )
    if resp.status_code == 200 and username.lower() in resp.text.lower():
        return {"ok": True, "detail": f"User @{username} found on Replit"}
    return {"ok": False, "detail": f"Replit user @{username} not found"}


# Map common names to Replit template slugs
_TEMPLATE_MAP = {
    "python": "python3",
    "python3": "python3",
    "node": "nodejs",
    "nodejs": "nodejs",
    "javascript": "nodejs",
    "js": "nodejs",
    "typescript": "nodejs",
    "ts": "nodejs",
    "html": "html-css-js",
    "css": "html-css-js",
    "react": "react-javascript",
    "java": "java",
    "go": "go",
    "golang": "go",
    "ruby": "ruby",
    "rust": "rust",
    "c": "c",
    "cpp": "cpp",
    "c++": "cpp",
    "flask": "flask",
    "django": "django",
    "express": "express",
    "nextjs": "nextjs",
    "next": "nextjs",
    "vue": "vue",
    "svelte": "svelte",
    "php": "php",
    "kotlin": "kotlin",
    "swift": "swift",
}


def _extract_tech_stack(text: str) -> str:
    """Scan free-form text for a known tech stack keyword. Defaults to python3."""
    tokens = text.lower().split()
    for token in tokens:
        clean = token.strip(".,;:!?\"'()[]{}").lower()
        if clean in _TEMPLATE_MAP:
            return clean
    return "python3"


def _extract_app_name(text: str) -> str:
    """Extract a short app name from free-form text."""
    # Strip common filler words to get something meaningful
    stop = {"build", "me", "a", "an", "the", "on", "replit", "create", "make", "new",
            "app", "application", "please", "can", "you", "i", "want", "to", "using",
            "with", "in", "for", "my", "use", "let's", "lets"}
    words = [w for w in text.strip().split() if w.lower() not in stop]
    if words:
        name = "-".join(words[:4]).lower()
        # Remove non-alphanumeric except hyphens
        name = "".join(c for c in name if c.isalnum() or c == "-").strip("-")
        if name:
            return name
    return "my-app"


_GRAPHQL_URL = "https://replit.com/graphql"

_CREATE_REPL_MUTATION = """
mutation CreateRepl($input: CreateReplInput!) {
  createRepl(input: $input) {
    __typename
    ... on Repl {
      id
      slug
      title
      description
      templateInfo { label }
      url
    }
    ... on UserError {
      message
    }
  }
}
"""

# Map our tech_stack names to Replit language identifiers
_LANGUAGE_MAP = {
    "python3": "python3",
    "nodejs": "nodejs",
    "react-javascript": "react-javascript",
    "html-css-js": "html-css-js",
    "java": "java",
    "go": "go",
    "ruby": "ruby",
    "rust": "rust",
    "c": "c",
    "cpp": "cpp",
    "flask": "python3",
    "django": "python3",
    "express": "nodejs",
    "nextjs": "nextjs",
    "vue": "vue",
    "svelte": "svelte",
    "php": "php",
    "kotlin": "kotlin",
    "swift": "swift",
}


async def _create_repl_graphql(
    connect_sid: str,
    title: str,
    language: str,
    description: str = "",
) -> dict | None:
    """Call Replit's GraphQL API to create a repl. Returns repl info or None on failure."""
    variables = {
        "input": {
            "title": title,
            "language": language,
        }
    }
    if description:
        variables["input"]["description"] = description[:500]

    headers = {
        "Content-Type": "application/json",
        "Cookie": f"connect.sid={connect_sid}",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                _GRAPHQL_URL,
                headers=headers,
                json={"query": _CREATE_REPL_MUTATION, "variables": variables},
            )

        print(f"[replit] GraphQL HTTP {resp.status_code}")
        print(f"[replit] Response body: {resp.text[:500]}")

        if resp.status_code != 200:
            return None

        data = resp.json()
        result = data.get("data", {}).get("createRepl")
        if not result:
            print(f"[replit] No createRepl in response: {data}")
            return None

        if result.get("__typename") == "UserError":
            print(f"[replit] UserError: {result.get('message')}")
            return None

        print(f"[replit] Created repl: {result}")
        return {
            "id": result.get("id", ""),
            "slug": result.get("slug", ""),
            "title": result.get("title", ""),
            "url": result.get("url", ""),
        }
    except Exception as e:
        print(f"[replit] GraphQL exception: {e}")
        return None


def _build_agent_prompt(app_name: str, tech_stack: str, user_prompt: str, agent_result: str) -> str:
    """Build a structured prompt for Replit Agent from the chat context."""
    lines = [f"Build a {tech_stack} application called \"{app_name}\"."]
    if user_prompt and user_prompt != app_name:
        lines.append(f"\nUser request: {user_prompt}")
    if agent_result:
        clean = agent_result.replace("Agent completed execution.\n\n", "").strip()
        if clean and clean != user_prompt:
            lines.append(f"\nAdditional context:\n{clean}")
    return "\n".join(lines)


async def build_application(tenant_id: str, payload: dict, app) -> dict:
    """Build an application on Replit.

    Tries to create the repl directly via Replit's GraphQL API using the
    stored connect.sid cookie. Falls back to a clipboard + open-browser
    flow if the API call fails or no cookie is configured.
    """
    cfg = await app.state.replit_config_store.get_by_tenant(tenant_id)

    # Parse inputs
    query = payload.get("query", "")
    raw_name = payload.get("app_name", "") or query
    app_name = _extract_app_name(raw_name) if " " in raw_name else (raw_name or "my-app")
    description = payload.get("description", "") or query
    raw_tech = payload.get("tech_stack", "")
    tech_stack = _TEMPLATE_MAP.get(raw_tech.lower().strip(), "") if raw_tech else ""
    if not tech_stack:
        tech_stack = _extract_tech_stack(raw_tech or raw_name or query)

    template = _TEMPLATE_MAP.get(tech_stack.lower().strip(), tech_stack.lower().strip())
    language = _LANGUAGE_MAP.get(template, template)

    # Build a description from the chat context
    desc_text = raw_name if raw_name != app_name else query
    prompt_text = _build_agent_prompt(app_name, tech_stack, raw_name, description)

    # --- Try creating the repl via GraphQL ---
    connect_sid = (cfg.connect_sid if cfg else "") or ""
    print(f"[replit] connect_sid present: {bool(connect_sid)}, length: {len(connect_sid)}")
    if connect_sid:
        repl = await _create_repl_graphql(connect_sid, app_name, language, desc_text)
        if repl and repl.get("url"):
            repl_url = f"https://replit.com{repl['url']}"
            return {
                "status": "ok",
                "message": f"Repl created — opening {app_name} on Replit.",
                "repl_url": repl_url,
                "app_name": repl.get("title", app_name),
                "description": description,
                "tech_stack": tech_stack,
            }

    # --- Fallback: clipboard + open Replit home page ---
    return {
        "status": "ok",
        "message": f"Prompt copied to clipboard — paste it into Replit Agent to build your {tech_stack} app.",
        "repl_url": "https://replit.com/~",
        "prompt_text": prompt_text,
        "app_name": app_name,
        "description": description,
        "tech_stack": tech_stack,
    }


async def build_application_action(tenant_id: str, payload: dict, app) -> dict:
    """Thin wrapper for the action executor."""
    return await build_application(tenant_id, payload, app)
