from __future__ import annotations

import json
import uuid

import httpx

DRIVE_API = "https://www.googleapis.com/drive/v3"
UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
FOLDER_MIME = "application/vnd.google-apps.folder"


class GoogleDriveError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class GoogleDriveProvider:
    """Stateless provider — every method receives an access_token."""

    async def test_folder(
        self, access_token: str, folder_id: str
    ) -> dict[str, str]:
        """GET a single file, validate it is a folder. Returns {id, name}."""
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{DRIVE_API}/files/{folder_id}",
                params={"fields": "id,name,mimeType", "supportsAllDrives": "true"},
                headers=_auth(access_token),
            )
        if res.status_code == 404:
            raise GoogleDriveError(404, "Folder not found. Check the folder ID.")
        if not res.is_success:
            body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            msg = body.get("error", {}).get("message", f"Drive API error ({res.status_code})")
            raise GoogleDriveError(res.status_code, msg)
        data = res.json()
        if data.get("mimeType") != FOLDER_MIME:
            raise GoogleDriveError(
                400, f'"{data["name"]}" is not a folder (type: {data["mimeType"]}).'
            )
        return {"id": data["id"], "name": data["name"]}

    async def ensure_folder(
        self, access_token: str, name: str, parent_id: str
    ) -> dict[str, str | bool]:
        """Search by name+parent+mimeType+not-trashed; create if missing."""
        q = (
            f"name='{name}' and '{parent_id}' in parents "
            f"and mimeType='{FOLDER_MIME}' and trashed=false"
        )
        async with httpx.AsyncClient() as client:
            search = await client.get(
                f"{DRIVE_API}/files",
                params={
                    "q": q,
                    "fields": "files(id,name)",
                    "supportsAllDrives": "true",
                    "includeItemsFromAllDrives": "true",
                },
                headers=_auth(access_token),
            )
            if not search.is_success:
                body = search.json() if search.headers.get("content-type", "").startswith("application/json") else {}
                msg = body.get("error", {}).get("message", f"Search failed ({search.status_code})")
                raise GoogleDriveError(search.status_code, msg)

            files = search.json().get("files", [])
            if files:
                return {"id": files[0]["id"], "name": files[0]["name"], "created": False}

            create = await client.post(
                f"{DRIVE_API}/files",
                params={"supportsAllDrives": "true"},
                headers={**_auth(access_token), "Content-Type": "application/json"},
                content=json.dumps(
                    {"name": name, "mimeType": FOLDER_MIME, "parents": [parent_id]}
                ),
            )
        if not create.is_success:
            body = create.json() if create.headers.get("content-type", "").startswith("application/json") else {}
            msg = body.get("error", {}).get("message", f"Create folder failed ({create.status_code})")
            raise GoogleDriveError(create.status_code, msg)
        d = create.json()
        return {"id": d["id"], "name": d["name"], "created": True}

    async def _create_folder_tree(
        self,
        access_token: str,
        parent_id: str,
        nodes: list[dict],
        path_prefix: str,
        log: list[str],
    ) -> int:
        """Recursively create classification folders. Returns count of created."""
        created_count = 0
        for node in nodes:
            name = node.get("name", "")
            if not name:
                continue
            folder = await self.ensure_folder(access_token, name, parent_id)
            tag = "Created" if folder["created"] else "Found"
            log.append(f"{tag} {path_prefix}{name}/")
            if folder["created"]:
                created_count += 1
            children = node.get("children", [])
            if children:
                created_count += await self._create_folder_tree(
                    access_token, folder["id"], children, f"{path_prefix}{name}/", log  # type: ignore[arg-type]
                )
        return created_count

    async def scaffold(
        self,
        access_token: str,
        root_folder_id: str,
        tenant_id: str,
        schema_tree: list[dict],
    ) -> dict:
        """Create AgenticKnowledge/{tenant_id}/_schema/,dimensions/{tree}/,documents/."""
        log: list[str] = []
        created_count = 0

        ak = await self.ensure_folder(access_token, "AgenticKnowledge", root_folder_id)
        log.append(f"{'Created' if ak['created'] else 'Found'} AgenticKnowledge/")
        if ak["created"]:
            created_count += 1

        tenant = await self.ensure_folder(access_token, tenant_id, ak["id"])  # type: ignore[arg-type]
        log.append(f"{'Created' if tenant['created'] else 'Found'} {tenant_id}/")
        if tenant["created"]:
            created_count += 1

        schema = await self.ensure_folder(access_token, "_schema", tenant["id"])  # type: ignore[arg-type]
        log.append(f"{'Created' if schema['created'] else 'Found'} _schema/")
        if schema["created"]:
            created_count += 1

        dims = await self.ensure_folder(access_token, "dimensions", tenant["id"])  # type: ignore[arg-type]
        log.append(f"{'Created' if dims['created'] else 'Found'} dimensions/")
        if dims["created"]:
            created_count += 1

        created_count += await self._create_folder_tree(
            access_token, dims["id"], schema_tree, "dimensions/", log  # type: ignore[arg-type]
        )

        docs = await self.ensure_folder(access_token, "documents", tenant["id"])  # type: ignore[arg-type]
        log.append(f"{'Created' if docs['created'] else 'Found'} documents/")
        if docs["created"]:
            created_count += 1

        return {
            "schema_folder_id": schema["id"],
            "progress_log": log,
            "created_count": created_count,
        }

    async def search_documents(
        self,
        access_token: str,
        folder_id: str,
        tokens: list[str],
        limit: int = 10,
    ) -> list[dict[str, str]]:
        """Search for files in a folder whose name matches any token."""
        if not tokens:
            return []
        name_clauses = " or ".join(f"name contains '{t}'" for t in tokens[:8])
        q = (
            f"'{folder_id}' in parents and ({name_clauses}) "
            f"and mimeType!='{FOLDER_MIME}' and trashed=false"
        )
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{DRIVE_API}/files",
                params={
                    "q": q,
                    "fields": "files(id,name,webViewLink)",
                    "pageSize": str(limit),
                    "supportsAllDrives": "true",
                    "includeItemsFromAllDrives": "true",
                },
                headers=_auth(access_token),
            )
        if not res.is_success:
            body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            msg = body.get("error", {}).get("message", f"Search failed ({res.status_code})")
            raise GoogleDriveError(res.status_code, msg)
        files = res.json().get("files", [])
        return [
            {
                "name": f.get("name", ""),
                "id": f.get("id", ""),
                "webViewLink": f.get("webViewLink", ""),
            }
            for f in files
        ]

    async def upload_schema(
        self,
        access_token: str,
        schema_folder_id: str,
        schema_tree: list[dict],
    ) -> None:
        """Multipart/related upload of classification_schema.json (idempotent)."""
        file_name = "classification_schema.json"
        content = json.dumps(schema_tree, indent=2)

        # Search for existing file
        q = f"name='{file_name}' and '{schema_folder_id}' in parents and trashed=false"
        async with httpx.AsyncClient() as client:
            search = await client.get(
                f"{DRIVE_API}/files",
                params={
                    "q": q,
                    "fields": "files(id)",
                    "supportsAllDrives": "true",
                    "includeItemsFromAllDrives": "true",
                },
                headers=_auth(access_token),
            )
            existing_id = None
            if search.is_success:
                files = search.json().get("files", [])
                if files:
                    existing_id = files[0]["id"]

            # Build multipart/related body (Google requires this, not multipart/form-data)
            boundary = f"boundary-{uuid.uuid4().hex}"
            if existing_id:
                metadata = json.dumps({"name": file_name})
                url = f"{UPLOAD_API}/files/{existing_id}"
                method = "PATCH"
            else:
                metadata = json.dumps(
                    {"name": file_name, "mimeType": "application/json", "parents": [schema_folder_id]}
                )
                url = f"{UPLOAD_API}/files"
                method = "POST"

            body = (
                f"--{boundary}\r\n"
                f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
                f"{metadata}\r\n"
                f"--{boundary}\r\n"
                f"Content-Type: application/json\r\n\r\n"
                f"{content}\r\n"
                f"--{boundary}--"
            )

            res = await client.request(
                method,
                url,
                params={"uploadType": "multipart", "supportsAllDrives": "true"},
                headers={
                    **_auth(access_token),
                    "Content-Type": f"multipart/related; boundary={boundary}",
                },
                content=body.encode(),
            )

        if not res.is_success:
            body_json = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            msg = body_json.get("error", {}).get("message", f"Upload failed ({res.status_code})")
            raise GoogleDriveError(res.status_code, msg)
