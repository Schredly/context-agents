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
