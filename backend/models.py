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
    client_id: Optional[str] = None
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


class ReplitConfig(BaseModel):
    tenant_id: str
    connect_sid: str
    username: str = ""
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LLMConfig(BaseModel):
    id: str
    label: str
    provider: str          # "anthropic", "openai", etc.
    api_key: str
    model: str
    input_token_cost: float = 0.0   # $ per 1k tokens
    output_token_cost: float = 0.0  # $ per 1k tokens
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TenantLLMAssignment(BaseModel):
    tenant_id: str
    llm_config_id: str
    is_active: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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


class CreateLLMConfigRequest(BaseModel):
    label: str
    provider: str
    api_key: str
    model: str
    input_token_cost: float = 0.0
    output_token_cost: float = 0.0


class UpdateLLMConfigRequest(BaseModel):
    label: Optional[str] = None
    provider: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    input_token_cost: Optional[float] = None
    output_token_cost: Optional[float] = None


class AssignLLMConfigRequest(BaseModel):
    llm_config_id: str


class TestLLMConfigRequest(BaseModel):
    provider: str
    api_key: str
    model: str


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


class WritebackApproveRequest(BaseModel):
    tenant_secret: str
    sys_id: str
    note_prefix: Optional[str] = None


class SelectAnswerRequest(BaseModel):
    tenant_id: str
    selected: Literal["kb", "llm"]


class SaveToDriveRequest(BaseModel):
    tenant_id: str
    access_token: str


class AgentRun(BaseModel):
    run_id: str
    tenant_id: str
    status: Literal["queued", "running", "completed", "failed", "fallback_completed"] = "queued"
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
    confidence_at_time: Optional[float] = None
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


# --- Metrics Event Logging ---


class MetricsEvent(BaseModel):
    id: str
    tenant_id: str
    run_id: str
    event_type: Literal[
        "run_started",
        "skill_started",
        "skill_completed",
        "tool_called",
        "tool_failed",
        "run_completed",
        "feedback_recorded",
        "writeback_success",
        "writeback_failed",
    ]
    skill_name: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# --- Telemetry & Observability models ---


class SkillTelemetry(BaseModel):
    skill_id: str
    status: Literal["completed", "failed", "skipped"]
    duration_ms: Optional[int] = None
    tool_calls: int = 0
    tool_errors: int = 0
    model: Optional[str] = None
    model_latency_ms: Optional[int] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    doc_count: Optional[int] = None
    fallback_used: Optional[bool] = None


class RunTelemetry(BaseModel):
    tenant_id: str
    run_id: str
    work_id: str
    source_system: str
    record_type: str
    classification_path: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: Literal["completed", "failed", "fallback_completed"]
    duration_ms: Optional[int] = None
    confidence: Optional[float] = None
    doc_hit: Optional[bool] = None
    writeback_attempted: bool = False
    writeback_success: Optional[bool] = None
    fallback_used: bool = False
    model: Optional[str] = None
    total_input_tokens: Optional[int] = None
    total_output_tokens: Optional[int] = None
    skills: list[SkillTelemetry] = Field(default_factory=list)


class ObservabilitySummaryResponse(BaseModel):
    total_runs: int
    completed_runs: int
    failed_runs: int
    runs_last_7d: int
    runs_last_30d: int
    avg_duration_ms: Optional[float] = None
    p95_duration_ms: Optional[int] = None
    avg_confidence: Optional[float] = None
    doc_hit_rate: Optional[float] = None
    fallback_rate: Optional[float] = None
    writeback_success_rate: Optional[float] = None
    model_latency_avg: Optional[float] = None
    model_mix: list[dict[str, Any]] = Field(default_factory=list)
    top_classification_paths: list[dict[str, Any]] = Field(default_factory=list)
    confidence_outcome_matrix: list[dict[str, Any]] = Field(default_factory=list)


class DiagnosticFailureEvent(BaseModel):
    run_id: str
    event_type: str
    skill_name: str
    error_message: str
    timestamp: str


class IntegrationDiagnosticsResponse(BaseModel):
    drive_configured: bool
    claude_configured: bool
    servicenow_configured: bool
    last_writeback_status: Optional[str] = None
    last_writeback_error: Optional[str] = None
    recent_failure_events: list[DiagnosticFailureEvent] = Field(default_factory=list)


class ObservabilityTrendPoint(BaseModel):
    date: str
    runs: int
    success_rate: Optional[float] = None
    avg_confidence: Optional[float] = None
    fallback_rate: Optional[float] = None
    doc_hit_rate: Optional[float] = None
    avg_duration_ms: Optional[float] = None


class ObservabilityTrendsResponse(BaseModel):
    last_7d: list[ObservabilityTrendPoint] = Field(default_factory=list)
    last_30d: list[ObservabilityTrendPoint] = Field(default_factory=list)


# --- Integration models ---


INTEGRATION_CATALOG = {
    "servicenow": {"name": "ServiceNow", "description": "IT service management platform", "config_fields": ["instance_url", "username", "password"]},
    "google-drive": {"name": "Google Drive", "description": "Cloud storage and file sharing", "config_fields": ["client_id", "root_folder_id"]},
    "salesforce": {"name": "Salesforce", "description": "Customer relationship management", "config_fields": ["instance_url", "username", "password"]},
    "slack": {"name": "Slack", "description": "Team communication platform", "config_fields": ["webhook_url"]},
    "github": {"name": "GitHub", "description": "Code repository and collaboration", "config_fields": ["token", "org", "repo"]},
    "jira": {"name": "Jira", "description": "Project tracking and management", "config_fields": ["instance_url", "username", "api_token"]},
    "replit": {"name": "Replit", "description": "Application builder and deployment platform", "config_fields": ["connect_sid", "username"]},
}


class Integration(BaseModel):
    id: str
    tenant_id: str
    integration_type: str
    enabled: bool = False
    config: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CreateIntegrationRequest(BaseModel):
    integration_type: str


class UpdateIntegrationConfigRequest(BaseModel):
    config: dict[str, Any]


class TestIntegrationRequest(BaseModel):
    integration_type: str
    config: dict[str, Any]


# --- Tool Catalog ---


TOOL_CATALOG = [
    # ServiceNow
    {"tool_id": "servicenow.search_incidents", "integration_type": "servicenow", "name": "Search Incidents", "description": "Search ServiceNow incident records", "input_schema": {"query": "string", "limit": "integer"}, "output_schema": {"incidents": "array"}},
    {"tool_id": "servicenow.get_incident_details", "integration_type": "servicenow", "name": "Get Incident Details", "description": "Retrieve details for a specific ServiceNow incident", "input_schema": {"sys_id": "string"}, "output_schema": {"incident": "object"}},
    {"tool_id": "servicenow.search_kb", "integration_type": "servicenow", "name": "Search Knowledge Base", "description": "Search ServiceNow knowledge base articles", "input_schema": {"query": "string", "limit": "integer"}, "output_schema": {"articles": "array"}},
    {"tool_id": "servicenow.add_work_note", "integration_type": "servicenow", "name": "Add Work Note", "description": "Add a work note to a ServiceNow record", "input_schema": {"sys_id": "string", "note": "string"}, "output_schema": {"ok": "boolean"}},
    # Google Drive
    {"tool_id": "google-drive.search_documents", "integration_type": "google-drive", "name": "Search Documents", "description": "Search Google Drive for documents", "input_schema": {"query": "string", "folder_id": "string"}, "output_schema": {"files": "array"}},
    {"tool_id": "google-drive.read_file", "integration_type": "google-drive", "name": "Read File", "description": "Read content of a Google Drive file", "input_schema": {"file_id": "string"}, "output_schema": {"content": "string"}},
    {"tool_id": "google-drive.create_file", "integration_type": "google-drive", "name": "Create File", "description": "Create a new file in Google Drive", "input_schema": {"name": "string", "content": "string", "folder_id": "string"}, "output_schema": {"file_id": "string"}},
    # Salesforce
    {"tool_id": "salesforce.search_accounts", "integration_type": "salesforce", "name": "Search Accounts", "description": "Search Salesforce accounts", "input_schema": {"query": "string"}, "output_schema": {"accounts": "array"}},
    {"tool_id": "salesforce.get_case_history", "integration_type": "salesforce", "name": "Get Case History", "description": "Retrieve case history for a Salesforce account", "input_schema": {"account_id": "string"}, "output_schema": {"cases": "array"}},
    # Slack
    {"tool_id": "slack.send_message", "integration_type": "slack", "name": "Send Message", "description": "Send a message to a Slack channel", "input_schema": {"channel": "string", "text": "string"}, "output_schema": {"ok": "boolean", "ts": "string"}},
    {"tool_id": "slack.search_messages", "integration_type": "slack", "name": "Search Messages", "description": "Search Slack messages", "input_schema": {"query": "string"}, "output_schema": {"messages": "array"}},
    # GitHub
    {"tool_id": "github.search_commits", "integration_type": "github", "name": "Search Commits", "description": "Search GitHub commits", "input_schema": {"query": "string", "repo": "string"}, "output_schema": {"commits": "array"}},
    {"tool_id": "github.search_issues", "integration_type": "github", "name": "Search Issues", "description": "Search GitHub issues and pull requests", "input_schema": {"query": "string", "repo": "string"}, "output_schema": {"issues": "array"}},
    # Jira
    {"tool_id": "jira.search_issues", "integration_type": "jira", "name": "Search Issues", "description": "Search Jira issues with JQL", "input_schema": {"jql": "string"}, "output_schema": {"issues": "array"}},
    {"tool_id": "jira.get_issue", "integration_type": "jira", "name": "Get Issue", "description": "Get details for a specific Jira issue", "input_schema": {"issue_key": "string"}, "output_schema": {"issue": "object"}},
    # Replit
    {"tool_id": "replit.build_application", "integration_type": "replit", "name": "Build Application", "description": "Build and deploy an application on Replit", "input_schema": {"app_name": "string", "description": "string", "tech_stack": "string"}, "output_schema": {"project_id": "string", "repl_url": "string"}},
]

TOOL_CATALOG_BY_ID = {t["tool_id"]: t for t in TOOL_CATALOG}


# --- Skill models ---


class Skill(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: str = ""
    model: str = ""
    instructions: str = ""
    tools: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CreateSkillRequest(BaseModel):
    name: str
    description: str = ""
    model: str = ""
    instructions: str = ""
    tools: list[str] = Field(default_factory=list)


class UpdateSkillRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    model: Optional[str] = None
    instructions: Optional[str] = None
    tools: Optional[list[str]] = None


# --- Use Case models ---


class UseCaseStep(BaseModel):
    step_id: str
    skill_id: str
    name: str = ""
    input_mapping: str = ""
    output_mapping: str = ""


class UseCase(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: str = ""
    status: Literal["draft", "active"] = "draft"
    triggers: list[str] = Field(default_factory=list)
    steps: list[UseCaseStep] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CreateUseCaseRequest(BaseModel):
    name: str
    description: str = ""
    status: Literal["draft", "active"] = "draft"
    triggers: list[str] = Field(default_factory=list)
    steps: list[UseCaseStep] = Field(default_factory=list)


class UpdateUseCaseRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["draft", "active"]] = None
    triggers: Optional[list[str]] = None
    steps: Optional[list[UseCaseStep]] = None


# --- Use Case Execution models ---


class ToolCallRecord(BaseModel):
    name: str
    status: Literal["completed", "failed", "not_implemented"] = "completed"
    latency_ms: int = 0
    request: Optional[dict[str, Any]] = None
    response: Optional[dict[str, Any]] = None


class UseCaseRunStep(BaseModel):
    step_index: int
    skill_id: str
    skill_name: str
    model: str
    tools: list[str] = Field(default_factory=list)
    instructions: str = ""
    status: Literal["pending", "running", "completed", "failed"] = "pending"
    latency_ms: Optional[int] = None
    tokens: int = 0
    result_summary: str = ""
    tool_request_payload: Optional[dict[str, Any]] = None
    tool_response: Optional[dict[str, Any]] = None
    tool_calls: list[ToolCallRecord] = Field(default_factory=list)
    llm_output: str = ""
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class UseCaseRun(BaseModel):
    run_id: str
    tenant_id: str
    use_case_id: str
    use_case_name: str = ""
    status: Literal["queued", "running", "completed", "failed", "cancelled"] = "queued"
    steps: list[UseCaseRunStep] = Field(default_factory=list)
    total_latency_ms: int = 0
    total_tokens: int = 0
    final_result: str = ""
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None


# --- Agent UI Run persistence ---


class AgentUIRun(BaseModel):
    id: str                          # "arun_" + uuid hex[:12]
    tenant_id: str
    prompt: str
    selected_use_case: str | None = None
    result: str | None = None
    confidence: float | None = None
    skills_used: list[str] = Field(default_factory=list)
    total_cost: float = 0.0          # aggregated cost across all llm_usage events
    status: Literal["running", "completed", "error"] = "running"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentUIRunEvent(BaseModel):
    id: str                          # "arevt_" + uuid hex[:12]
    run_id: str
    event_type: str                  # reasoning | use_case_selected | skill_started | llm_usage | etc.
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # LLM usage fields (populated when event_type == "llm_usage")
    model: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    cost_usd: float | None = None


# --- Actions ---


class ActionParameter(BaseModel):
    name: str
    source: str = "static"           # static | user_prompt | agent_result | agent_metadata | user_input
    value: str | None = None


class ActionRule(BaseModel):
    type: str                        # use_case | confidence | skill | keyword | tag
    operator: str = "equals"         # equals | not_equals | greater_than | less_than | contains | not_contains
    value: str = ""


class Action(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: str = ""
    integration_id: str = ""         # e.g. "servicenow", "jira", "slack", etc.
    operation: str = ""              # e.g. "incident.create", "message.post"
    parameters: list[ActionParameter] = Field(default_factory=list)
    rules: list[ActionRule] = Field(default_factory=list)
    status: Literal["active", "disabled"] = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CreateActionRequest(BaseModel):
    name: str
    description: str = ""
    integration_id: str = ""
    operation: str = ""
    parameters: list[ActionParameter] = Field(default_factory=list)
    rules: list[ActionRule] = Field(default_factory=list)
    status: Literal["active", "disabled"] = "active"


class UpdateActionRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    integration_id: Optional[str] = None
    operation: Optional[str] = None
    parameters: Optional[list[ActionParameter]] = None
    rules: Optional[list[ActionRule]] = None
    status: Optional[Literal["active", "disabled"]] = None


class ExecuteActionRequest(BaseModel):
    run_id: str = ""
    input: dict[str, Any] = Field(default_factory=dict)


# --- LLM Usage / Cost Ledger ---


LLM_PRICING: dict[str, dict[str, float]] = {
    # OpenAI — 5.x / reasoning models
    "o3": {"input": 0.010 / 1000, "output": 0.040 / 1000},
    "o3-mini": {"input": 0.001 / 1000, "output": 0.004 / 1000},
    "o3-pro": {"input": 0.020 / 1000, "output": 0.080 / 1000},
    "o4-mini": {"input": 0.001 / 1000, "output": 0.004 / 1000},
    "gpt-5": {"input": 0.010 / 1000, "output": 0.030 / 1000},
    # OpenAI — 4.x models
    "gpt-4o": {"input": 0.005 / 1000, "output": 0.015 / 1000},
    "gpt-4o-mini": {"input": 0.00015 / 1000, "output": 0.0006 / 1000},
    # Anthropic
    "claude-3-sonnet": {"input": 0.003 / 1000, "output": 0.015 / 1000},
    "claude-3-haiku": {"input": 0.00025 / 1000, "output": 0.00125 / 1000},
    "claude-sonnet-4-20250514": {"input": 0.003 / 1000, "output": 0.015 / 1000},
    "claude-haiku-3-5-20241022": {"input": 0.00025 / 1000, "output": 0.00125 / 1000},
}

# Backward-compat alias
MODEL_PRICING = LLM_PRICING


import re as _re

_DATE_SUFFIX_RE = _re.compile(r"-\d{4,8}$")
_DEFAULT_PRICING = {"input": 0.003 / 1000, "output": 0.015 / 1000}


def normalize_model_name(model: str) -> str:
    """Normalize a model name for pricing lookup.

    APIs often return versioned names like ``gpt-4o-2024-08-06`` or
    ``claude-sonnet-4-20250514``.  We try the exact name first, then
    strip trailing date suffixes to match the base key in LLM_PRICING.
    """
    if model in LLM_PRICING:
        return model
    # Strip trailing date segment (e.g. -20250514 or -2024-08-06)
    base = _DATE_SUFFIX_RE.sub("", model)
    if base in LLM_PRICING:
        return base
    # Try progressively shorter prefixes (e.g. gpt-4o-2024-08-06 → gpt-4o-2024 → gpt-4o)
    parts = model.split("-")
    for i in range(len(parts) - 1, 0, -1):
        candidate = "-".join(parts[:i])
        if candidate in LLM_PRICING:
            return candidate
    return model


def calculate_llm_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Compute cost locally from the pricing registry. Never relies on provider-reported cost."""
    key = normalize_model_name(model)
    pricing = LLM_PRICING.get(key, _DEFAULT_PRICING)
    return prompt_tokens * pricing["input"] + completion_tokens * pricing["output"]


# Backward-compat alias
estimate_cost = calculate_llm_cost


class LLMUsageEvent(BaseModel):
    id: str                          # "llmu_" + uuid hex[:12]
    tenant_id: str
    run_id: str = ""
    use_case: str = ""
    skill: str = ""
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0
    latency_ms: int = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
