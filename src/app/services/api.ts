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
