from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from models import (
    AgentEvent,
    AgentRun,
    ClassificationNodeModel,
    ClassificationSchema,
    GoogleDriveConfig,
    Tenant,
)
from store.interface import (
    ClassificationSchemaStore,
    EventStore,
    GoogleDriveConfigStore,
    RunStore,
    TenantStore,
)


class InMemoryTenantStore(TenantStore):
    def __init__(self) -> None:
        self._tenants: dict[str, Tenant] = {}

    async def create(self, name: str) -> Tenant:
        tenant = Tenant(id=str(uuid.uuid4()), name=name)
        self._tenants[tenant.id] = tenant
        return tenant

    async def get(self, id: str) -> Optional[Tenant]:
        return self._tenants.get(id)

    async def list(self) -> list[Tenant]:
        return list(self._tenants.values())

    async def delete(self, id: str) -> bool:
        return self._tenants.pop(id, None) is not None

    async def update(self, id: str, **kwargs: Any) -> Optional[Tenant]:
        tenant = self._tenants.get(id)
        if tenant is None:
            return None
        data = tenant.model_dump()
        data.update(kwargs)
        data["updated_at"] = datetime.now(timezone.utc)
        updated = Tenant(**data)
        self._tenants[id] = updated
        return updated


class InMemoryClassificationSchemaStore(ClassificationSchemaStore):
    def __init__(self) -> None:
        self._schemas: dict[str, ClassificationSchema] = {}
        self._versions: dict[str, int] = {}

    async def get_by_tenant(self, tenant_id: str) -> Optional[ClassificationSchema]:
        return self._schemas.get(tenant_id)

    async def upsert(
        self, tenant_id: str, schema_tree: list[dict[str, Any]]
    ) -> ClassificationSchema:
        current_version = self._versions.get(tenant_id, 0)
        new_version = current_version + 1
        self._versions[tenant_id] = new_version

        nodes = [ClassificationNodeModel(**node) for node in schema_tree]
        schema = ClassificationSchema(
            tenant_id=tenant_id,
            schema_tree=nodes,
            version=new_version,
            updated_at=datetime.now(timezone.utc),
        )
        self._schemas[tenant_id] = schema
        return schema


class InMemoryGoogleDriveConfigStore(GoogleDriveConfigStore):
    def __init__(self) -> None:
        self._configs: dict[str, GoogleDriveConfig] = {}

    async def get_by_tenant(self, tenant_id: str) -> Optional[GoogleDriveConfig]:
        return self._configs.get(tenant_id)

    async def upsert(self, tenant_id: str, **kwargs: Any) -> GoogleDriveConfig:
        existing = self._configs.get(tenant_id)
        if existing is not None:
            data = existing.model_dump()
            data.update({k: v for k, v in kwargs.items() if v is not None})
            data["updated_at"] = datetime.now(timezone.utc)
            config = GoogleDriveConfig(**data)
        else:
            config = GoogleDriveConfig(tenant_id=tenant_id, **kwargs)
        self._configs[tenant_id] = config
        return config


class InMemoryRunStore(RunStore):
    def __init__(self) -> None:
        self._runs: dict[str, AgentRun] = {}

    async def create_run(self, run: AgentRun) -> AgentRun:
        self._runs[run.run_id] = run
        return run

    async def get_run(self, run_id: str) -> Optional[AgentRun]:
        return self._runs.get(run_id)

    async def list_runs_for_tenant(self, tenant_id: str) -> list[AgentRun]:
        return [r for r in self._runs.values() if r.tenant_id == tenant_id]

    async def update_run(self, run_id: str, **kwargs: Any) -> Optional[AgentRun]:
        run = self._runs.get(run_id)
        if run is None:
            return None
        data = run.model_dump()
        data.update({k: v for k, v in kwargs.items() if v is not None})
        updated = AgentRun(**data)
        self._runs[run_id] = updated
        return updated


class InMemoryEventStore(EventStore):
    def __init__(self) -> None:
        self._events: dict[str, list[AgentEvent]] = {}

    async def append_event(self, event: AgentEvent) -> AgentEvent:
        self._events.setdefault(event.run_id, []).append(event)
        return event

    async def list_events_for_run(self, run_id: str) -> list[AgentEvent]:
        return list(self._events.get(run_id, []))
