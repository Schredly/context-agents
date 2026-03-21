from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

from models import Action, AgentEvent, AgentRun, AgentUIRun, AgentUIRunEvent, ApplicationGenome, ClassificationSchema, ExtractionPayload, FeedbackEvent, GenomeArtifact, GoogleDriveConfig, Integration, LLMConfig, LLMUsageEvent, ManagedIntegration, MetricsEvent, ReplitConfig, RunTelemetry, ServiceNowConfig, Skill, Tenant, TenantLLMAssignment, Translation, UseCase, UseCaseRun, VideoGenomeExtraction


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


class ReplitConfigStore(ABC):
    @abstractmethod
    async def get_by_tenant(self, tenant_id: str) -> Optional[ReplitConfig]: ...

    @abstractmethod
    async def upsert(self, tenant_id: str, **kwargs: Any) -> ReplitConfig: ...


class LLMConfigStore(ABC):
    @abstractmethod
    async def create(self, config: LLMConfig) -> LLMConfig: ...

    @abstractmethod
    async def get(self, config_id: str) -> Optional[LLMConfig]: ...

    @abstractmethod
    async def list_all(self) -> list[LLMConfig]: ...

    @abstractmethod
    async def update(self, config_id: str, **kwargs: Any) -> Optional[LLMConfig]: ...

    @abstractmethod
    async def delete(self, config_id: str) -> bool: ...


class TenantLLMAssignmentStore(ABC):
    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[TenantLLMAssignment]: ...

    @abstractmethod
    async def assign(self, tenant_id: str, llm_config_id: str) -> TenantLLMAssignment: ...

    @abstractmethod
    async def unassign(self, tenant_id: str, llm_config_id: str) -> bool: ...

    @abstractmethod
    async def get_active(self, tenant_id: str) -> Optional[TenantLLMAssignment]: ...

    @abstractmethod
    async def set_active(self, tenant_id: str, llm_config_id: str) -> Optional[TenantLLMAssignment]: ...


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


class IntegrationStore(ABC):
    @abstractmethod
    async def create(self, integration: Integration) -> Integration: ...

    @abstractmethod
    async def get(self, integration_id: str) -> Optional[Integration]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[Integration]: ...

    @abstractmethod
    async def list_filtered(self, tenant_id: Optional[str] = None) -> list[Integration]:
        """None/'all' → everything, 'GLOBAL' → only global, else → tenant + GLOBAL."""
        ...

    @abstractmethod
    async def update(self, integration_id: str, **kwargs: Any) -> Optional[Integration]: ...

    @abstractmethod
    async def delete(self, integration_id: str) -> bool: ...

    @abstractmethod
    async def get_by_type(self, tenant_id: str, integration_type: str) -> Optional[Integration]: ...


class SkillStore(ABC):
    @abstractmethod
    async def create(self, skill: Skill) -> Skill: ...

    @abstractmethod
    async def get(self, skill_id: str) -> Optional[Skill]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[Skill]: ...

    @abstractmethod
    async def list_filtered(self, tenant_id: Optional[str] = None) -> list[Skill]:
        """None/'all' → everything, 'GLOBAL' → only global, else → tenant + GLOBAL."""
        ...

    @abstractmethod
    async def update(self, skill_id: str, **kwargs: Any) -> Optional[Skill]: ...

    @abstractmethod
    async def delete(self, skill_id: str) -> bool: ...


class UseCaseStore(ABC):
    @abstractmethod
    async def create(self, use_case: UseCase) -> UseCase: ...

    @abstractmethod
    async def get(self, use_case_id: str) -> Optional[UseCase]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[UseCase]: ...

    @abstractmethod
    async def list_filtered(self, tenant_id: Optional[str] = None) -> list[UseCase]:
        """None/'all' → everything, 'GLOBAL' → only global, else → tenant + GLOBAL."""
        ...

    @abstractmethod
    async def update(self, use_case_id: str, **kwargs: Any) -> Optional[UseCase]: ...

    @abstractmethod
    async def delete(self, use_case_id: str) -> bool: ...


class UseCaseRunStore(ABC):
    @abstractmethod
    async def create(self, run: UseCaseRun) -> UseCaseRun: ...

    @abstractmethod
    async def get(self, run_id: str) -> Optional[UseCaseRun]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[UseCaseRun]: ...

    @abstractmethod
    async def list_filtered(self, tenant_id: Optional[str] = None) -> list[UseCaseRun]:
        """None/'all' → everything, 'GLOBAL' → only global, else → tenant + GLOBAL."""
        ...

    @abstractmethod
    async def list_for_use_case(self, use_case_id: str) -> list[UseCaseRun]: ...

    @abstractmethod
    async def update(self, run_id: str, **kwargs: Any) -> Optional[UseCaseRun]: ...


class AgentUIRunStore(ABC):
    @abstractmethod
    async def create(self, run: AgentUIRun) -> AgentUIRun: ...

    @abstractmethod
    async def get(self, run_id: str) -> Optional[AgentUIRun]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[AgentUIRun]: ...

    @abstractmethod
    async def update(self, run_id: str, **kwargs: Any) -> Optional[AgentUIRun]: ...


class AgentUIRunEventStore(ABC):
    @abstractmethod
    async def create(self, event: AgentUIRunEvent) -> AgentUIRunEvent: ...

    @abstractmethod
    async def list_for_run(self, run_id: str) -> list[AgentUIRunEvent]: ...


class LLMUsageStore(ABC):
    @abstractmethod
    async def create(self, event: LLMUsageEvent) -> LLMUsageEvent: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[LLMUsageEvent]: ...

    @abstractmethod
    async def list_filtered(self, tenant_id: Optional[str] = None) -> list[LLMUsageEvent]:
        """None/'all' → everything, 'GLOBAL' → only global, else → tenant + GLOBAL."""
        ...

    @abstractmethod
    async def list_for_run(self, run_id: str) -> list[LLMUsageEvent]: ...

    @abstractmethod
    async def list_all(self) -> list[LLMUsageEvent]: ...


class ActionStore(ABC):
    @abstractmethod
    async def create(self, action: Action) -> Action: ...

    @abstractmethod
    async def get(self, action_id: str) -> Optional[Action]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[Action]: ...

    @abstractmethod
    async def list_filtered(self, tenant_id: Optional[str] = None) -> list[Action]:
        """None/'all' → everything, 'GLOBAL' → only global, else → tenant + GLOBAL."""
        ...

    @abstractmethod
    async def update(self, action_id: str, **kwargs: Any) -> Optional[Action]: ...

    @abstractmethod
    async def delete(self, action_id: str) -> bool: ...


class GenomeStore(ABC):
    @abstractmethod
    async def create(self, genome: ApplicationGenome) -> ApplicationGenome: ...

    @abstractmethod
    async def get(self, genome_id: str) -> Optional[ApplicationGenome]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[ApplicationGenome]: ...

    @abstractmethod
    async def update(self, genome_id: str, **kwargs: Any) -> Optional[ApplicationGenome]: ...

    @abstractmethod
    async def delete(self, genome_id: str) -> bool: ...


class GenomeArtifactStore(ABC):
    @abstractmethod
    async def create(self, artifact: GenomeArtifact) -> GenomeArtifact: ...

    @abstractmethod
    async def get_by_genome(self, genome_id: str) -> Optional[GenomeArtifact]: ...

    @abstractmethod
    async def get_latest_by_genome(self, genome_id: str) -> Optional[GenomeArtifact]: ...


class ExtractionPayloadStore(ABC):
    @abstractmethod
    async def create(self, extraction: ExtractionPayload) -> ExtractionPayload: ...

    @abstractmethod
    async def get(self, extraction_id: str) -> Optional[ExtractionPayload]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[ExtractionPayload]: ...

    @abstractmethod
    async def list_by_status(self, status: str) -> list[ExtractionPayload]: ...

    @abstractmethod
    async def update(self, extraction_id: str, **kwargs: Any) -> Optional[ExtractionPayload]: ...

    @abstractmethod
    async def find_by_payload_hash(self, payload_hash: str) -> Optional[ExtractionPayload]: ...


class ManagedIntegrationStore(ABC):
    @abstractmethod
    async def create(self, integration: ManagedIntegration) -> ManagedIntegration: ...

    @abstractmethod
    async def get(self, integration_id: str) -> Optional[ManagedIntegration]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[ManagedIntegration]: ...

    @abstractmethod
    async def update(self, integration_id: str, **kwargs: Any) -> Optional[ManagedIntegration]: ...

    @abstractmethod
    async def delete(self, integration_id: str) -> bool: ...


class TranslationStore(ABC):
    @abstractmethod
    async def create(self, translation: Translation) -> Translation: ...

    @abstractmethod
    async def get(self, translation_id: str) -> Optional[Translation]: ...

    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list[Translation]: ...

    @abstractmethod
    async def list_by_vendor(self, tenant_id: str, vendor: str) -> list[Translation]: ...

    @abstractmethod
    async def update(self, translation_id: str, **kwargs: Any) -> Optional[Translation]: ...

    @abstractmethod
    async def delete(self, translation_id: str) -> bool: ...


class VideoGenomeExtractionStore(ABC):
    @abstractmethod
    async def create(self, extraction: "VideoGenomeExtraction") -> "VideoGenomeExtraction": ...
    @abstractmethod
    async def get(self, extraction_id: str) -> Optional["VideoGenomeExtraction"]: ...
    @abstractmethod
    async def list_for_tenant(self, tenant_id: str) -> list["VideoGenomeExtraction"]: ...
    @abstractmethod
    async def update(self, extraction_id: str, **kwargs) -> Optional["VideoGenomeExtraction"]: ...
    @abstractmethod
    async def delete(self, extraction_id: str) -> bool: ...
