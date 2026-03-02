from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

from models import ClassificationSchema, GoogleDriveConfig, Tenant


class TenantStore(ABC):
    @abstractmethod
    async def create(self, name: str) -> Tenant: ...

    @abstractmethod
    async def get(self, id: str) -> Optional[Tenant]: ...

    @abstractmethod
    async def list(self) -> list[Tenant]: ...

    @abstractmethod
    async def delete(self, id: str) -> bool: ...

    @abstractmethod
    async def update(self, id: str, **kwargs: Any) -> Optional[Tenant]: ...


class ClassificationSchemaStore(ABC):
    @abstractmethod
    async def get_by_tenant(self, tenant_id: str) -> Optional[ClassificationSchema]: ...

    @abstractmethod
    async def upsert(
        self, tenant_id: str, schema_tree: list[dict[str, Any]]
    ) -> ClassificationSchema: ...


class GoogleDriveConfigStore(ABC):
    @abstractmethod
    async def get_by_tenant(self, tenant_id: str) -> Optional[GoogleDriveConfig]: ...

    @abstractmethod
    async def upsert(self, tenant_id: str, **kwargs: Any) -> GoogleDriveConfig: ...
