import httpx

from models import ManagedIntegration


async def test_managed_integration(integration: ManagedIntegration) -> dict:
    """Test connectivity for a ManagedIntegration based on its type."""

    if integration.type == "github":
        if not integration.token:
            return {"success": False, "message": "Missing Personal Access Token"}
        headers = {
            "Authorization": f"Bearer {integration.token}",
            "Accept": "application/vnd.github+json",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get("https://api.github.com/user", headers=headers)
            if resp.status_code == 401:
                return {"success": False, "message": "Invalid token"}
            if resp.status_code == 403:
                return {"success": False, "message": "Token lacks permissions"}
            if resp.is_success:
                user = resp.json()
                login = user.get("login", "")
                name = user.get("name", "")
                label = f"{login} ({name})" if name else login
                return {"success": True, "message": f"Authenticated as {label}"}
            return {"success": False, "message": f"GitHub returned HTTP {resp.status_code}"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    if integration.type == "web_service":
        if not integration.base_url:
            return {"success": False, "message": "Missing base_url"}
        url = integration.base_url.rstrip("/")
        if integration.test_endpoint:
            url += "/" + integration.test_endpoint.lstrip("/")
        elif integration.endpoint:
            url += "/" + integration.endpoint.lstrip("/")

        headers = dict(integration.headers)
        if integration.auth_type == "bearer" and integration.token:
            headers["Authorization"] = f"Bearer {integration.token}"
        elif integration.auth_type == "api_key" and integration.token:
            headers["X-API-Key"] = integration.token

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)
            if resp.is_success:
                return {"success": True, "message": "Connection successful"}
            return {"success": False, "message": f"HTTP {resp.status_code}"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    return {"success": False, "message": f"Unknown integration type: {integration.type}"}
