from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

from models import AgentEvent, AgentRun, ClassificationSchema, FeedbackEvent, GoogleDriveConfig, MetricsEvent, RunTelemetry, ServiceNowConfig, Tenant


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


class ServiceNowConfigStore(ABC):
    @abstractmethod
    async def get_by_tenant(self, tenant_id: str) -> Optional[ServiceNowConfig]: ...

    @abstractmethod
    async def upsert(self, tenant_id: str, **kwargs: Any) -> ServiceNowConfig: ...


class RunStore(ABC):
    @abstractmethod
    async def create_run(self, run: AgentRun) -> AgentRun: ...

    @abstractmethod
    async def get_run(self, run_id: str) -> Optional[AgentRun]: ...

    @abstractmethod
    async def list_runs_for_tenant(self, tenant_id: str) -> list[AgentRun]: ...

    @abstractmethod
    async def update_run(self, run_id: str, **kwargs: Any) -> Optional[AgentRun]: ...


class EventStore(ABC):
    @abstractmethod
    async def append_event(self, event: AgentEvent) -> AgentEvent: ...

    @abstractmethod
    async def list_events_for_run(self, run_id: str) -> list[AgentEvent]: ...


class FeedbackStore(ABC):
    @abstractmethod
    async def append(self, event: FeedbackEvent) -> FeedbackEvent: ...

    @abstractmethod
    async def get_by_run(self, run_id: str) -> Optional[FeedbackEvent]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[FeedbackEvent]: ...


class MetricsEventStore(ABC):
    @abstractmethod
    async def append(self, event: MetricsEvent) -> MetricsEvent: ...

    @abstractmethod
    async def list_for_run(self, run_id: str) -> list[MetricsEvent]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[MetricsEvent]: ...


class TelemetryStore(ABC):
    @abstractmethod
    async def upsert(self, run_telemetry: RunTelemetry) -> RunTelemetry: ...

    @abstractmethod
    async def get(self, run_id: str) -> Optional[RunTelemetry]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[RunTelemetry]: ...
