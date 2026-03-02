from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# --- Domain models ---


class Tenant(BaseModel):
    id: str
    name: str
    status: str = "draft"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    shared_secret: Optional[str] = None


class ClassificationNodeModel(BaseModel):
    name: str
    children: list[ClassificationNodeModel] = Field(default_factory=list)


class ClassificationSchema(BaseModel):
    tenant_id: str
    schema_tree: list[ClassificationNodeModel] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    version: int = 1


class GoogleDriveConfig(BaseModel):
    tenant_id: str
    root_folder_id: str
    folder_name: Optional[str] = None
    scaffolded: bool = False
    scaffolded_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ServiceNowConfig(BaseModel):
    tenant_id: str
    instance_url: str
    username: str
    password: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# --- Request models ---


class CreateTenantRequest(BaseModel):
    name: str


class PutSchemaRequest(BaseModel):
    schema_tree: list[ClassificationNodeModel]


class PutDriveConfigRequest(BaseModel):
    root_folder_id: str
    folder_name: Optional[str] = None


class PutServiceNowConfigRequest(BaseModel):
    instance_url: str
    username: str
    password: str


class ScaffoldResultRequest(BaseModel):
    scaffolded: bool
    scaffolded_at: Optional[datetime] = None
    root_folder_id: str
    folder_name: Optional[str] = None


# --- Response models ---


class ActivateResponse(BaseModel):
    tenant_id: str
    shared_secret: str
    instructions_stub: str


# --- Google Drive request/response models ---


class TestDriveFolderRequest(BaseModel):
    access_token: str
    folder_id: str


class ScaffoldApplyRequest(BaseModel):
    access_token: str
    root_folder_id: str
    schema_tree: list[ClassificationNodeModel]


class TestDriveFolderResponse(BaseModel):
    folder_id: str
    folder_name: str


class ScaffoldApplyResponse(BaseModel):
    schema_folder_id: str
    progress_log: list[str]
    created_count: int


# --- Execution plane models ---


class ClassificationPair(BaseModel):
    name: str
    value: str


class WorkObject(BaseModel):
    work_id: str
    source_system: str = "ui"
    record_type: str = "incident"
    title: str
    description: str
    classification: list[ClassificationPair] = Field(default_factory=list)
    metadata: Optional[dict[str, Any]] = None


class CreateRunRequest(BaseModel):
    tenant_id: str
    access_token: str
    work_object: WorkObject


class ServiceNowRunRequest(BaseModel):
    tenant_id: str
    tenant_secret: str
    sys_id: str
    number: str
    short_description: str
    description: str = ""
    classification: list[ClassificationPair] = Field(default_factory=list)
    metadata: Optional[dict[str, Any]] = None
    access_token: Optional[str] = None


class AgentRun(BaseModel):
    run_id: str
    tenant_id: str
    status: Literal["queued", "running", "completed", "failed"] = "queued"
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    work_object: WorkObject
    result: Optional[dict[str, Any]] = None


class AgentEvent(BaseModel):
    run_id: str
    skill_id: str
    event_type: Literal[
        "thinking",
        "retrieval",
        "planning",
        "tool_call",
        "tool_result",
        "verification",
        "complete",
        "error",
    ]
    summary: str
    confidence: Optional[float] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Optional[dict[str, Any]] = None


# --- Feedback & Metrics models ---


class FeedbackEvent(BaseModel):
    id: str
    tenant_id: str
    run_id: str
    work_id: str
    outcome: Literal["success", "fail"]
    reason: Literal["resolved", "partial", "wrong-doc", "missing-context", "other"]
    notes: str = ""
    classification_path: str = ""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CreateFeedbackRequest(BaseModel):
    tenant_id: str
    run_id: str
    outcome: Literal["success", "fail"]
    reason: Literal["resolved", "partial", "wrong-doc", "missing-context", "other"]
    notes: str = ""


class MetricsResponse(BaseModel):
    total_runs: int
    completed_runs: int
    success_rate: Optional[float] = None
    avg_confidence: Optional[float] = None
    doc_hit_rate: Optional[float] = None
    avg_latency_seconds: Optional[float] = None
    writeback_success_rate: Optional[float] = None
    feedback_count: int
    breakdown_by_classification_path: list[dict[str, Any]]
