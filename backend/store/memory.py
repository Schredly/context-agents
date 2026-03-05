from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from models import (
    AgentEvent,
    AgentRun,
    ClassificationNodeModel,
    ClassificationSchema,
    FeedbackEvent,
    GoogleDriveConfig,
    Integration,
    LLMConfig,
    MetricsEvent,
    RunTelemetry,
    ServiceNowConfig,
    Skill,
    Tenant,
    TenantLLMAssignment,
    UseCase,
    UseCaseRun,
)
from store.interface import (
    ClassificationSchemaStore,
    EventStore,
    FeedbackStore,
    GoogleDriveConfigStore,
    IntegrationStore,
    LLMConfigStore,
    MetricsEventStore,
    RunStore,
    ServiceNowConfigStore,
    SkillStore,
    TelemetryStore,
    TenantLLMAssignmentStore,
    TenantStore,
    UseCaseRunStore,
    UseCaseStore,
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


class InMemoryServiceNowConfigStore(ServiceNowConfigStore):
    def __init__(self) -> None:
        self._configs: dict[str, ServiceNowConfig] = {}

    async def get_by_tenant(self, tenant_id: str) -> Optional[ServiceNowConfig]:
        return self._configs.get(tenant_id)

    async def upsert(self, tenant_id: str, **kwargs: Any) -> ServiceNowConfig:
        existing = self._configs.get(tenant_id)
        if existing is not None:
            data = existing.model_dump()
            data.update({k: v for k, v in kwargs.items() if v is not None})
            data["updated_at"] = datetime.now(timezone.utc)
            config = ServiceNowConfig(**data)
        else:
            config = ServiceNowConfig(tenant_id=tenant_id, **kwargs)
        self._configs[tenant_id] = config
        return config


class InMemoryLLMConfigStore(LLMConfigStore):
    def __init__(self) -> None:
        self._configs: dict[str, LLMConfig] = {}  # keyed by config id

    async def create(self, config: LLMConfig) -> LLMConfig:
        self._configs[config.id] = config
        return config

    async def get(self, config_id: str) -> Optional[LLMConfig]:
        return self._configs.get(config_id)

    async def list_all(self) -> list[LLMConfig]:
        return list(self._configs.values())

    async def update(self, config_id: str, **kwargs: Any) -> Optional[LLMConfig]:
        existing = self._configs.get(config_id)
        if existing is None:
            return None
        data = existing.model_dump()
        data.update({k: v for k, v in kwargs.items() if v is not None})
        data["updated_at"] = datetime.now(timezone.utc)
        config = LLMConfig(**data)
        self._configs[config_id] = config
        return config

    async def delete(self, config_id: str) -> bool:
        return self._configs.pop(config_id, None) is not None


class InMemoryTenantLLMAssignmentStore(TenantLLMAssignmentStore):
    def __init__(self) -> None:
        # tenant_id -> {llm_config_id -> TenantLLMAssignment}
        self._assignments: dict[str, dict[str, TenantLLMAssignment]] = {}

    async def list_for_tenant(self, tenant_id: str) -> list[TenantLLMAssignment]:
        return list(self._assignments.get(tenant_id, {}).values())

    async def assign(self, tenant_id: str, llm_config_id: str) -> TenantLLMAssignment:
        bucket = self._assignments.setdefault(tenant_id, {})
        existing = bucket.get(llm_config_id)
        if existing is not None:
            return existing
        assignment = TenantLLMAssignment(tenant_id=tenant_id, llm_config_id=llm_config_id)
        bucket[llm_config_id] = assignment
        return assignment

    async def unassign(self, tenant_id: str, llm_config_id: str) -> bool:
        bucket = self._assignments.get(tenant_id, {})
        return bucket.pop(llm_config_id, None) is not None

    async def get_active(self, tenant_id: str) -> Optional[TenantLLMAssignment]:
        for a in self._assignments.get(tenant_id, {}).values():
            if a.is_active:
                return a
        return None

    async def set_active(self, tenant_id: str, llm_config_id: str) -> Optional[TenantLLMAssignment]:
        bucket = self._assignments.get(tenant_id, {})
        target = bucket.get(llm_config_id)
        if target is None:
            return None
        # Deactivate all others, activate target
        for cid, a in bucket.items():
            if cid == llm_config_id:
                bucket[cid] = a.model_copy(update={"is_active": True})
            elif a.is_active:
                bucket[cid] = a.model_copy(update={"is_active": False})
        return bucket[llm_config_id]


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


class InMemoryFeedbackStore(FeedbackStore):
    def __init__(self) -> None:
        self._feedback: dict[str, FeedbackEvent] = {}  # keyed by run_id

    async def append(self, event: FeedbackEvent) -> FeedbackEvent:
        self._feedback[event.run_id] = event
        return event

    async def get_by_run(self, run_id: str) -> Optional[FeedbackEvent]:
        return self._feedback.get(run_id)

    async def list_for_tenant(self, tenant_id: str) -> list[FeedbackEvent]:
        return [fb for fb in self._feedback.values() if fb.tenant_id == tenant_id]


class InMemoryMetricsEventStore(MetricsEventStore):
    def __init__(self) -> None:
        self._events: list[MetricsEvent] = []

    async def append(self, event: MetricsEvent) -> MetricsEvent:
        self._events.append(event)
        return event

    async def list_for_run(self, run_id: str) -> list[MetricsEvent]:
        return [e for e in self._events if e.run_id == run_id]

    async def list_for_tenant(self, tenant_id: str) -> list[MetricsEvent]:
        return [e for e in self._events if e.tenant_id == tenant_id]


class InMemoryTelemetryStore(TelemetryStore):
    def __init__(self) -> None:
        self._telemetry: dict[str, RunTelemetry] = {}  # keyed by run_id

    async def upsert(self, run_telemetry: RunTelemetry) -> RunTelemetry:
        self._telemetry[run_telemetry.run_id] = run_telemetry
        return run_telemetry

    async def get(self, run_id: str) -> Optional[RunTelemetry]:
        return self._telemetry.get(run_id)

    async def list_for_tenant(self, tenant_id: str) -> list[RunTelemetry]:
        return [t for t in self._telemetry.values() if t.tenant_id == tenant_id]


class InMemoryIntegrationStore(IntegrationStore):
    def __init__(self) -> None:
        self._integrations: dict[str, Integration] = {}

    async def create(self, integration: Integration) -> Integration:
        self._integrations[integration.id] = integration
        return integration

    async def get(self, integration_id: str) -> Optional[Integration]:
        return self._integrations.get(integration_id)

    async def list_for_tenant(self, tenant_id: str) -> list[Integration]:
        return [i for i in self._integrations.values() if i.tenant_id == tenant_id]

    async def update(self, integration_id: str, **kwargs: Any) -> Optional[Integration]:
        existing = self._integrations.get(integration_id)
        if existing is None:
            return None
        data = existing.model_dump()
        data.update({k: v for k, v in kwargs.items() if v is not None})
        data["updated_at"] = datetime.now(timezone.utc)
        updated = Integration(**data)
        self._integrations[integration_id] = updated
        return updated

    async def delete(self, integration_id: str) -> bool:
        return self._integrations.pop(integration_id, None) is not None

    async def get_by_type(self, tenant_id: str, integration_type: str) -> Optional[Integration]:
        for i in self._integrations.values():
            if i.tenant_id == tenant_id and i.integration_type == integration_type:
                return i
        return None


class InMemorySkillStore(SkillStore):
    def __init__(self) -> None:
        self._skills: dict[str, Skill] = {}

    async def create(self, skill: Skill) -> Skill:
        self._skills[skill.id] = skill
        return skill

    async def get(self, skill_id: str) -> Optional[Skill]:
        return self._skills.get(skill_id)

    async def list_for_tenant(self, tenant_id: str) -> list[Skill]:
        return [s for s in self._skills.values() if s.tenant_id == tenant_id]

    async def update(self, skill_id: str, **kwargs: Any) -> Optional[Skill]:
        existing = self._skills.get(skill_id)
        if existing is None:
            return None
        data = existing.model_dump()
        data.update({k: v for k, v in kwargs.items() if v is not None})
        data["updated_at"] = datetime.now(timezone.utc)
        updated = Skill(**data)
        self._skills[skill_id] = updated
        return updated

    async def delete(self, skill_id: str) -> bool:
        return self._skills.pop(skill_id, None) is not None


class InMemoryUseCaseStore(UseCaseStore):
    def __init__(self) -> None:
        self._use_cases: dict[str, UseCase] = {}

    async def create(self, use_case: UseCase) -> UseCase:
        self._use_cases[use_case.id] = use_case
        return use_case

    async def get(self, use_case_id: str) -> Optional[UseCase]:
        return self._use_cases.get(use_case_id)

    async def list_for_tenant(self, tenant_id: str) -> list[UseCase]:
        return [uc for uc in self._use_cases.values() if uc.tenant_id == tenant_id]

    async def update(self, use_case_id: str, **kwargs: Any) -> Optional[UseCase]:
        existing = self._use_cases.get(use_case_id)
        if existing is None:
            return None
        data = existing.model_dump()
        data.update({k: v for k, v in kwargs.items() if v is not None})
        data["updated_at"] = datetime.now(timezone.utc)
        updated = UseCase(**data)
        self._use_cases[use_case_id] = updated
        return updated

    async def delete(self, use_case_id: str) -> bool:
        return self._use_cases.pop(use_case_id, None) is not None


class InMemoryUseCaseRunStore(UseCaseRunStore):
    def __init__(self) -> None:
        self._runs: dict[str, UseCaseRun] = {}

    async def create(self, run: UseCaseRun) -> UseCaseRun:
        self._runs[run.run_id] = run
        return run

    async def get(self, run_id: str) -> Optional[UseCaseRun]:
        return self._runs.get(run_id)

    async def list_for_tenant(self, tenant_id: str) -> list[UseCaseRun]:
        return [r for r in self._runs.values() if r.tenant_id == tenant_id]

    async def list_for_use_case(self, use_case_id: str) -> list[UseCaseRun]:
        return [r for r in self._runs.values() if r.use_case_id == use_case_id]

    async def update(self, run_id: str, **kwargs: Any) -> Optional[UseCaseRun]:
        existing = self._runs.get(run_id)
        if existing is None:
            return None
        data = existing.model_dump()
        data.update({k: v for k, v in kwargs.items() if v is not None})
        updated = UseCaseRun(**data)
        self._runs[run_id] = updated
        return updated
