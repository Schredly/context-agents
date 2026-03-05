// --- Response types (snake_case matching backend) ---

export interface TenantResponse {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  shared_secret: string | null;
}

export interface ClassificationNodeResponse {
  name: string;
  children: ClassificationNodeResponse[];
}

export interface ClassificationSchemaResponse {
  tenant_id: string;
  schema_tree: ClassificationNodeResponse[];
  updated_at: string;
  version: number;
}

export interface GoogleDriveConfigResponse {
  tenant_id: string;
  root_folder_id: string;
  folder_name: string | null;
  scaffolded: boolean;
  scaffolded_at: string | null;
  updated_at: string;
}

export interface ActivateResponse {
  tenant_id: string;
  shared_secret: string;
  instructions_stub: string;
}

export interface TestDriveFolderResponse {
  folder_id: string;
  folder_name: string;
}

export interface ScaffoldApplyResponse {
  schema_folder_id: string;
  progress_log: string[];
  created_count: number;
}

// --- Runs ---

export interface WorkObject {
  work_id: string;
  source_system: string;
  record_type: string;
  title: string;
  description: string;
  classification: { name: string; value: string }[];
  metadata?: Record<string, unknown> | null;
}

export interface AnswerPayload {
  summary: string;
  steps: string[];
  sources: { title: string; url: string }[];
  confidence: number;
}

export interface AgentRunResponse {
  run_id: string;
  tenant_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'fallback_completed';
  started_at: string;
  completed_at: string | null;
  work_object: WorkObject;
  result: {
    // Top-level backward-compat fields (always present)
    summary: string;
    steps: string[];
    sources: { title: string; url: string }[];
    confidence: number;
    // Dual-answer fields
    mode?: 'dual' | 'single';
    kb_answer?: AnswerPayload;
    llm_answer?: AnswerPayload;
    selected?: 'kb' | 'llm' | null;
    classification_folder_id?: string | null;
  } | null;
}

export interface AgentEventResponse {
  run_id: string;
  skill_id: string;
  event_type: string;
  summary: string;
  confidence: number | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

// --- Helpers ---

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body.detail) message = body.detail;
    } catch {
      // ignore parse error
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- Tenants ---

export function createTenant(name: string): Promise<TenantResponse> {
  return request('/tenants', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function getTenants(): Promise<TenantResponse[]> {
  return request('/tenants');
}

export function getTenant(id: string): Promise<TenantResponse> {
  return request(`/tenants/${id}`);
}

export function deleteTenant(id: string): Promise<void> {
  return request(`/tenants/${id}`, { method: 'DELETE' });
}

// --- Classification Schema ---

export function getSchema(
  tenantId: string,
): Promise<ClassificationSchemaResponse> {
  return request(`/admin/${tenantId}/classification-schema`);
}

export function putSchema(
  tenantId: string,
  schemaTree: ClassificationNodeResponse[],
): Promise<ClassificationSchemaResponse> {
  return request(`/admin/${tenantId}/classification-schema`, {
    method: 'PUT',
    body: JSON.stringify({ schema_tree: schemaTree }),
  });
}

// --- Google Drive Config ---

export function getDriveConfig(
  tenantId: string,
): Promise<GoogleDriveConfigResponse | null> {
  return request(`/admin/${tenantId}/google-drive`);
}

export function putDriveConfig(
  tenantId: string,
  rootFolderId: string,
  folderName?: string,
): Promise<GoogleDriveConfigResponse> {
  return request(`/admin/${tenantId}/google-drive`, {
    method: 'PUT',
    body: JSON.stringify({ root_folder_id: rootFolderId, folder_name: folderName }),
  });
}

// --- ServiceNow Config ---

export interface ServiceNowConfigResponse {
  tenant_id: string;
  instance_url: string;
  username: string;
  password: string;
  updated_at: string;
}

export function getSnowConfig(
  tenantId: string,
): Promise<ServiceNowConfigResponse | null> {
  return request(`/admin/${tenantId}/servicenow`);
}

export function putSnowConfig(
  tenantId: string,
  instanceUrl: string,
  username: string,
  password: string,
): Promise<ServiceNowConfigResponse> {
  return request(`/admin/${tenantId}/servicenow`, {
    method: 'PUT',
    body: JSON.stringify({ instance_url: instanceUrl, username, password }),
  });
}

// --- Activate ---

export function activateTenant(tenantId: string): Promise<ActivateResponse> {
  return request(`/admin/${tenantId}/activate`, { method: 'POST' });
}

// --- Scaffold Result ---

export function postScaffoldResult(
  tenantId: string,
  data: {
    scaffolded: boolean;
    scaffolded_at?: string;
    root_folder_id: string;
    folder_name?: string;
  },
): Promise<GoogleDriveConfigResponse> {
  return request(`/admin/${tenantId}/scaffold-result`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// --- Google Drive (server-side) ---

export function testDriveFolder(
  tenantId: string,
  accessToken: string,
  folderId: string,
): Promise<TestDriveFolderResponse> {
  return request(`/admin/${tenantId}/google-drive/test`, {
    method: 'POST',
    body: JSON.stringify({ access_token: accessToken, folder_id: folderId }),
  });
}

export function scaffoldApply(
  tenantId: string,
  accessToken: string,
  rootFolderId: string,
  schemaTree: ClassificationNodeResponse[],
): Promise<ScaffoldApplyResponse> {
  return request(`/admin/${tenantId}/scaffold-apply`, {
    method: 'POST',
    body: JSON.stringify({
      access_token: accessToken,
      root_folder_id: rootFolderId,
      schema_tree: schemaTree,
    }),
  });
}

// --- Feedback & Metrics ---

export interface FeedbackEventResponse {
  id: string;
  tenant_id: string;
  run_id: string;
  work_id: string;
  outcome: 'success' | 'fail';
  reason: 'resolved' | 'partial' | 'wrong-doc' | 'missing-context' | 'other';
  notes: string;
  classification_path: string;
  timestamp: string;
}

export interface MetricsResponse {
  total_runs: number;
  completed_runs: number;
  success_rate: number | null;
  avg_confidence: number | null;
  doc_hit_rate: number | null;
  avg_latency_seconds: number | null;
  writeback_success_rate: number | null;
  feedback_count: number;
  breakdown_by_classification_path: Record<string, unknown>[];
}

export function submitFeedback(
  tenantId: string,
  runId: string,
  outcome: 'success' | 'fail',
  reason: string,
  notes: string,
): Promise<FeedbackEventResponse> {
  return request('/runs/feedback', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenantId,
      run_id: runId,
      outcome,
      reason,
      notes,
    }),
  });
}

export function getFeedback(
  runId: string,
  tenantId: string,
): Promise<FeedbackEventResponse | null> {
  return request(
    `/runs/feedback/${runId}?tenant_id=${encodeURIComponent(tenantId)}`,
  );
}

export function getMetrics(tenantId: string): Promise<MetricsResponse> {
  return request(`/admin/${tenantId}/metrics`);
}

// --- Observability ---

export interface SkillTelemetryResponse {
  skill_id: string;
  status: 'completed' | 'failed' | 'skipped';
  duration_ms: number | null;
  tool_calls: number;
  tool_errors: number;
  model: string | null;
  model_latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  doc_count: number | null;
  fallback_used: boolean | null;
}

export interface RunTelemetryResponse {
  tenant_id: string;
  run_id: string;
  work_id: string;
  source_system: string;
  record_type: string;
  classification_path: string;
  started_at: string;
  completed_at: string | null;
  status: 'completed' | 'failed';
  duration_ms: number | null;
  confidence: number | null;
  doc_hit: boolean | null;
  writeback_attempted: boolean;
  writeback_success: boolean | null;
  fallback_used: boolean;
  model: string | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  skills: SkillTelemetryResponse[];
}

export interface ObservabilitySummaryResponse {
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  runs_last_7d: number;
  runs_last_30d: number;
  avg_duration_ms: number | null;
  p95_duration_ms: number | null;
  avg_confidence: number | null;
  doc_hit_rate: number | null;
  fallback_rate: number | null;
  writeback_success_rate: number | null;
  model_mix: { model: string; count: number }[];
  top_classification_paths: {
    path: string;
    count: number;
    success_rate: number | null;
    avg_confidence: number | null;
  }[];
}

export interface ObservabilityTrendPoint {
  date: string;
  runs: number;
  success_rate: number | null;
  avg_confidence: number | null;
  fallback_rate: number | null;
  doc_hit_rate: number | null;
  avg_duration_ms: number | null;
}

export interface ObservabilityTrendsResponse {
  last_7d: ObservabilityTrendPoint[];
  last_30d: ObservabilityTrendPoint[];
}

export function getObservabilitySummary(
  tenantId: string,
): Promise<ObservabilitySummaryResponse> {
  return request(`/admin/${tenantId}/observability/summary`);
}

export function getObservabilityTrends(
  tenantId: string,
  window?: 7 | 30,
): Promise<ObservabilityTrendsResponse> {
  const qs = window ? `?window=${window}` : '';
  return request(`/admin/${tenantId}/observability/trends${qs}`);
}

export function getObservabilityRuns(
  tenantId: string,
  limit: number = 50,
): Promise<RunTelemetryResponse[]> {
  return request(`/admin/${tenantId}/observability/runs?limit=${limit}`);
}

// --- LLM Config (global pool) ---

export interface LLMConfigResponse {
  id: string;
  label: string;
  provider: string;
  api_key: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface TenantLLMAssignmentResponse {
  tenant_id: string;
  llm_config_id: string;
  is_active: boolean;
  created_at: string;
}

export interface LLMProviderModel {
  id: string;
  name: string;
}

export interface LLMProviderInfo {
  name: string;
  models: LLMProviderModel[];
}

// --- Global LLM config CRUD ---

export function getLLMProviders(): Promise<Record<string, LLMProviderInfo>> {
  return request('/llm-configs/providers');
}

export function getLLMConfigs(): Promise<LLMConfigResponse[]> {
  return request('/llm-configs');
}

export function createLLMConfig(
  label: string,
  provider: string,
  apiKey: string,
  model: string,
): Promise<LLMConfigResponse> {
  return request('/llm-configs', {
    method: 'POST',
    body: JSON.stringify({ label, provider, api_key: apiKey, model }),
  });
}

export function updateLLMConfig(
  configId: string,
  updates: { label?: string; provider?: string; api_key?: string; model?: string },
): Promise<LLMConfigResponse> {
  return request(`/llm-configs/${configId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export function deleteLLMConfig(
  configId: string,
): Promise<{ ok: boolean }> {
  return request(`/llm-configs/${configId}`, {
    method: 'DELETE',
  });
}

export function testLLMConfig(
  provider: string,
  apiKey: string,
  model: string,
): Promise<{ ok: boolean }> {
  return request('/llm-configs/test', {
    method: 'POST',
    body: JSON.stringify({ provider, api_key: apiKey, model }),
  });
}

// --- Tenant LLM assignments ---

export function getTenantLLMAssignments(
  tenantId: string,
): Promise<TenantLLMAssignmentResponse[]> {
  return request(`/admin/${tenantId}/llm-assignments`);
}

export function assignLLMConfig(
  tenantId: string,
  llmConfigId: string,
): Promise<TenantLLMAssignmentResponse> {
  return request(`/admin/${tenantId}/llm-assignments`, {
    method: 'POST',
    body: JSON.stringify({ llm_config_id: llmConfigId }),
  });
}

export function unassignLLMConfig(
  tenantId: string,
  configId: string,
): Promise<{ ok: boolean }> {
  return request(`/admin/${tenantId}/llm-assignments/${configId}`, {
    method: 'DELETE',
  });
}

export function activateLLMAssignment(
  tenantId: string,
  configId: string,
): Promise<TenantLLMAssignmentResponse> {
  return request(`/admin/${tenantId}/llm-assignments/${configId}/activate`, {
    method: 'PUT',
  });
}

// --- Runs (server-side) ---

export function createRun(
  tenantId: string,
  accessToken: string,
  workObject: WorkObject,
): Promise<{ run_id: string }> {
  return request('/runs', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenantId,
      access_token: accessToken,
      work_object: workObject,
    }),
  });
}

export function getRuns(tenantId: string): Promise<AgentRunResponse[]> {
  return request(`/runs?tenant_id=${encodeURIComponent(tenantId)}`);
}

export function getRun(
  tenantId: string,
  runId: string,
): Promise<AgentRunResponse> {
  return request(`/runs/${runId}?tenant_id=${encodeURIComponent(tenantId)}`);
}

export function connectRunEvents(
  runId: string,
  tenantId: string,
  onEvent: (event: AgentEventResponse) => void,
  onEnd: (status: string) => void,
  onError?: (err: Event) => void,
): WebSocket {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(
    `${proto}//${window.location.host}/api/runs/${runId}/events?tenant_id=${encodeURIComponent(tenantId)}`,
  );
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === 'stream_end') {
      onEnd(data.status);
      ws.close();
    } else {
      onEvent(data as AgentEventResponse);
    }
  };
  ws.onerror = (err) => onError?.(err);
  return ws;
}

// --- Answer Selection + Save to Drive ---

export function selectRunAnswer(
  runId: string,
  tenantId: string,
  selected: 'kb' | 'llm',
): Promise<AgentRunResponse> {
  return request(`/runs/${runId}/select-answer`, {
    method: 'PUT',
    body: JSON.stringify({ tenant_id: tenantId, selected }),
  });
}

export function saveAnswerToDrive(
  runId: string,
  tenantId: string,
  accessToken: string,
): Promise<{ ok: boolean; file_id: string; web_link: string }> {
  return request(`/runs/${runId}/save-to-drive`, {
    method: 'POST',
    body: JSON.stringify({ tenant_id: tenantId, access_token: accessToken }),
  });
}

// --- Integrations ---

export interface IntegrationResponse {
  id: string;
  tenant_id: string;
  integration_type: string;
  enabled: boolean;
  config: Record<string, string>;
  connection_status: 'connected' | 'not-connected' | 'error';
  created_at: string;
  updated_at: string;
}

export interface IntegrationCatalogEntry {
  name: string;
  description: string;
  config_fields: string[];
}

export function getIntegrationCatalog(
  tenantId: string,
): Promise<Record<string, IntegrationCatalogEntry>> {
  return request(`/admin/${tenantId}/integrations/catalog`);
}

export function getIntegrations(
  tenantId: string,
): Promise<IntegrationResponse[]> {
  return request(`/admin/${tenantId}/integrations`);
}

export function getIntegration(
  tenantId: string,
  integrationId: string,
): Promise<IntegrationResponse> {
  return request(`/admin/${tenantId}/integrations/${integrationId}`);
}

export function createIntegration(
  tenantId: string,
  integrationType: string,
): Promise<IntegrationResponse> {
  return request(`/admin/${tenantId}/integrations`, {
    method: 'POST',
    body: JSON.stringify({ integration_type: integrationType }),
  });
}

export function updateIntegrationConfig(
  tenantId: string,
  integrationId: string,
  config: Record<string, string>,
): Promise<IntegrationResponse> {
  return request(`/admin/${tenantId}/integrations/${integrationId}/config`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  });
}

export function enableIntegration(
  tenantId: string,
  integrationId: string,
): Promise<IntegrationResponse> {
  return request(`/admin/${tenantId}/integrations/${integrationId}/enable`, {
    method: 'PUT',
  });
}

export function disableIntegration(
  tenantId: string,
  integrationId: string,
): Promise<IntegrationResponse> {
  return request(`/admin/${tenantId}/integrations/${integrationId}/disable`, {
    method: 'PUT',
  });
}

export function testIntegration(
  tenantId: string,
  integrationId: string,
): Promise<{ ok: boolean }> {
  return request(`/admin/${tenantId}/integrations/${integrationId}/test`, {
    method: 'POST',
  });
}

export function deleteIntegration(
  tenantId: string,
  integrationId: string,
): Promise<{ ok: boolean }> {
  return request(`/admin/${tenantId}/integrations/${integrationId}`, {
    method: 'DELETE',
  });
}

// --- Tools ---

export interface ToolCatalogEntry {
  tool_id: string;
  integration_type: string;
  name: string;
  description: string;
  input_schema: Record<string, string>;
  output_schema: Record<string, string>;
}

export interface ToolsResponse {
  tools: ToolCatalogEntry[];
  by_integration: Record<string, ToolCatalogEntry[]>;
}

export function getToolsCatalog(
  tenantId: string,
): Promise<ToolsResponse> {
  return request(`/admin/${tenantId}/tools/catalog`);
}

export function getAvailableTools(
  tenantId: string,
): Promise<ToolsResponse> {
  return request(`/admin/${tenantId}/tools/available`);
}

// --- Skills ---

export interface SkillResponse {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  model: string;
  instructions: string;
  tools: string[];
  created_at: string;
  updated_at: string;
}

export function getSkills(tenantId: string): Promise<SkillResponse[]> {
  return request(`/admin/${tenantId}/skills`);
}

export function getSkill(
  tenantId: string,
  skillId: string,
): Promise<SkillResponse> {
  return request(`/admin/${tenantId}/skills/${skillId}`);
}

export function createSkill(
  tenantId: string,
  payload: {
    name: string;
    description?: string;
    model?: string;
    instructions?: string;
    tools?: string[];
  },
): Promise<SkillResponse> {
  return request(`/admin/${tenantId}/skills`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateSkill(
  tenantId: string,
  skillId: string,
  payload: {
    name?: string;
    description?: string;
    model?: string;
    instructions?: string;
    tools?: string[];
  },
): Promise<SkillResponse> {
  return request(`/admin/${tenantId}/skills/${skillId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteSkill(
  tenantId: string,
  skillId: string,
): Promise<{ ok: boolean }> {
  return request(`/admin/${tenantId}/skills/${skillId}`, {
    method: 'DELETE',
  });
}

// --- Use Cases ---

export interface UseCaseStepResponse {
  step_id: string;
  skill_id: string;
  name: string;
  input_mapping: string;
  output_mapping: string;
}

export interface UseCaseResponse {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  status: 'draft' | 'active';
  triggers: string[];
  steps: UseCaseStepResponse[];
  created_at: string;
  updated_at: string;
}

// (RunUseCaseResponse replaced by UseCaseRunResponse below)

export function getUseCases(tenantId: string): Promise<UseCaseResponse[]> {
  return request(`/admin/${tenantId}/use-cases`);
}

export function getUseCase(
  tenantId: string,
  useCaseId: string,
): Promise<UseCaseResponse> {
  return request(`/admin/${tenantId}/use-cases/${useCaseId}`);
}

export function createUseCase(
  tenantId: string,
  payload: {
    name: string;
    description?: string;
    status?: 'draft' | 'active';
    triggers?: string[];
    steps?: UseCaseStepResponse[];
  },
): Promise<UseCaseResponse> {
  return request(`/admin/${tenantId}/use-cases`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateUseCase(
  tenantId: string,
  useCaseId: string,
  payload: {
    name?: string;
    description?: string;
    status?: 'draft' | 'active';
    triggers?: string[];
    steps?: UseCaseStepResponse[];
  },
): Promise<UseCaseResponse> {
  return request(`/admin/${tenantId}/use-cases/${useCaseId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteUseCase(
  tenantId: string,
  useCaseId: string,
): Promise<{ ok: boolean }> {
  return request(`/admin/${tenantId}/use-cases/${useCaseId}`, {
    method: 'DELETE',
  });
}

export function runUseCase(
  tenantId: string,
  useCaseId: string,
): Promise<UseCaseRunResponse> {
  return request(`/admin/${tenantId}/use-cases/${useCaseId}/run`, {
    method: 'POST',
  });
}

// --- Use Case Runs ---

export interface ToolCallRecordResponse {
  name: string;
  status: 'completed' | 'failed' | 'not_implemented';
  latency_ms: number;
  request: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
}

export interface UseCaseRunStepResponse {
  step_index: number;
  skill_id: string;
  skill_name: string;
  model: string;
  tools: string[];
  instructions: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  latency_ms: number | null;
  tokens: number;
  result_summary: string;
  tool_request_payload: Record<string, unknown> | null;
  tool_response: Record<string, unknown> | null;
  tool_calls: ToolCallRecordResponse[];
  llm_output: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface UseCaseRunResponse {
  run_id: string;
  tenant_id: string;
  use_case_id: string;
  use_case_name: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: UseCaseRunStepResponse[];
  total_latency_ms: number;
  total_tokens: number;
  final_result: string;
  started_at: string;
  completed_at: string | null;
}

export function getUseCaseRuns(
  tenantId: string,
  useCaseId: string,
): Promise<UseCaseRunResponse[]> {
  return request(`/admin/${tenantId}/use-cases/${useCaseId}/runs`);
}

export function getUseCaseRun(
  tenantId: string,
  useCaseId: string,
  runId: string,
): Promise<UseCaseRunResponse> {
  return request(`/admin/${tenantId}/use-cases/${useCaseId}/runs/${runId}`);
}

export function getAllUCRuns(
  tenantId: string,
): Promise<UseCaseRunResponse[]> {
  return request(`/admin/${tenantId}/uc-runs`);
}

export function getUCRun(
  tenantId: string,
  runId: string,
): Promise<UseCaseRunResponse> {
  return request(`/admin/${tenantId}/uc-runs/${runId}`);
}

export function connectUCRunEvents(
  tenantId: string,
  runId: string,
  onStepCompleted: (step: UseCaseRunStepResponse, runStatus: string) => void,
  onRunCompleted: (run: UseCaseRunResponse) => void,
  onRunCancelled?: (run: UseCaseRunResponse) => void,
): EventSource {
  const url = `/api/admin/${tenantId}/uc-runs/${runId}/events`;
  const es = new EventSource(url);
  es.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === 'step.completed') {
      onStepCompleted(data.step, data.run_status);
    } else if (data.type === 'run.cancelled') {
      onRunCancelled?.(data.run);
      es.close();
    } else if (data.type === 'run.completed') {
      onRunCompleted(data.run);
      es.close();
    }
  };
  es.onerror = () => {
    es.close();
  };
  return es;
}

export function cancelUCRun(
  tenantId: string,
  runId: string,
): Promise<{ ok: boolean }> {
  return request(`/admin/${tenantId}/uc-runs/${runId}/cancel`, {
    method: 'POST',
  });
}

// --- Agent Ask ---

export interface AgentAskResponse {
  reasoning: string[];
  use_case: string;
  skills: string[];
  tools: string[];
  result: string;
}

export function askAgent(
  tenantId: string,
  prompt: string,
): Promise<AgentAskResponse> {
  return request(`/admin/${tenantId}/agent/ask`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}

// --- ServiceNow Preview + Approve ---

export interface ServiceNowPreviewRequest {
  tenant_id: string;
  tenant_secret: string;
  sys_id: string;
  number: string;
  short_description: string;
  description?: string;
  classification?: { name: string; value: string }[];
  metadata?: Record<string, unknown> | null;
  access_token?: string | null;
}

export function createRunFromServiceNowPreview(
  body: ServiceNowPreviewRequest,
): Promise<{ run_id: string }> {
  return request('/runs/from/servicenow/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function approveRunWriteback(
  runId: string,
  tenantId: string,
  tenantSecret: string,
  sysId: string,
  notePrefix?: string,
): Promise<{ ok: boolean }> {
  return request(
    `/runs/${runId}/writeback/approve?tenant_id=${encodeURIComponent(tenantId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        tenant_secret: tenantSecret,
        sys_id: sysId,
        note_prefix: notePrefix ?? null,
      }),
    },
  );
}
