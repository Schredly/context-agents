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

export interface AgentRunResponse {
  run_id: string;
  tenant_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  work_object: WorkObject;
  result: {
    summary: string;
    steps: string[];
    sources: { title: string; url: string }[];
    confidence: number;
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
