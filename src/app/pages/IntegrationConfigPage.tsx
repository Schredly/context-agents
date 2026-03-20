import { useParams, useNavigate } from "react-router";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, LogIn, FolderOpen, Pencil, Check, X, Trash2, Plus, Play, ChevronDown, ChevronRight, ChevronUp, Globe, Building2, Search, Code } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTenants } from "../context/TenantContext";
import { useGoogleAuth } from "../auth/GoogleAuthContext";
import * as api from "../services/api";

/* ── Field metadata ──────────────────────────────────────────────── */

interface FieldMeta {
  label: string;
  placeholder: string;
  help?: string;
  secret?: boolean;
  optional?: boolean;
}

const FIELD_META: Record<string, Record<string, FieldMeta>> = {
  servicenow: {
    instance_url: {
      label: "Instance URL",
      placeholder: "https://dev12345.service-now.com",
      help: "The full URL of your ServiceNow instance (e.g. https://dev12345.service-now.com)",
    },
    username: {
      label: "Username",
      placeholder: "admin",
      help: "ServiceNow user with API access (admin or integration user)",
    },
    password: {
      label: "Password",
      placeholder: "••••••••",
      help: "Password for the ServiceNow user above",
      secret: true,
    },
  },
  "google-drive": {
    client_id: {
      label: "Google OAuth Client ID",
      placeholder: "123456789-abc.apps.googleusercontent.com",
      help: "Create one at console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application). Add http://localhost:5173 as an authorized JavaScript origin.",
    },
    root_folder_id: {
      label: "Root Folder ID",
      placeholder: "1aBcDeFgHiJkLmNoPqRsTuVwXyZ",
      help: "The Google Drive folder ID where knowledge documents are stored. Open the folder in Drive and copy the ID from the URL: drive.google.com/drive/folders/<this-id>",
    },
  },
  jira: {
    instance_url: {
      label: "Instance URL",
      placeholder: "https://your-org.atlassian.net",
      help: "Your Jira Cloud instance URL",
    },
    username: {
      label: "Email",
      placeholder: "user@company.com",
      help: "The email address of your Atlassian account",
    },
    api_token: {
      label: "API Token",
      placeholder: "••••••••",
      help: "Generate at id.atlassian.com → Security → API tokens",
      secret: true,
    },
  },
  slack: {
    webhook_url: {
      label: "Webhook URL",
      placeholder: "https://hooks.slack.com/services/T.../B.../...",
      help: "Create an Incoming Webhook at api.slack.com/apps → Your App → Incoming Webhooks",
      secret: true,
    },
  },
  github: {
    token: {
      label: "Personal Access Token",
      placeholder: "ghp_...",
      help: "Generate at github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens. Grant 'repo' scope for full access or select specific permissions.",
      secret: true,
    },
    org: {
      label: "Organization",
      placeholder: "my-org",
      help: "GitHub organization that owns the repositories.",
    },
    default_repository: {
      label: "Default Repository (optional)",
      placeholder: "my-repo",
      help: "Default target repository for exports. Leave blank to specify per-export.",
      optional: true,
    },
  },
  salesforce: {
    instance_url: {
      label: "Instance URL",
      placeholder: "https://your-org.my.salesforce.com",
      help: "Your Salesforce instance URL",
    },
    username: { label: "Username", placeholder: "user@company.com" },
    password: {
      label: "Password + Security Token",
      placeholder: "••••••••",
      help: "Concatenate your password and security token (no space)",
      secret: true,
    },
  },
  replit: {
    connect_sid: { label: "Session Cookie (connect.sid)", placeholder: "s%3A...", help: "Sign in to replit.com, open DevTools (F12) → Application → Cookies → replit.com → copy the value of connect.sid.", secret: true },
    username: { label: "Username", placeholder: "your-username", help: "Your Replit username (optional — auto-detected on Test Integration).", optional: true },
  },
};

function getFieldMeta(
  integrationType: string,
  field: string,
): FieldMeta {
  const meta = FIELD_META[integrationType]?.[field];
  if (meta) return meta;
  const label = field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const secret = ["password", "api_token", "token", "api_key", "webhook_url"].includes(field);
  return { label, placeholder: secret ? "••••••••" : `Enter ${label.toLowerCase()}`, secret };
}

/* ── Component ───────────────────────────────────────────────────── */

export default function IntegrationConfigPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenants, apiTenantId } = useTenants();
  const { accessToken: googleAccessToken, signIn: googleSignIn, isAuthenticated: googleAuthed, userEmail: googleEmail, configureClientId, isInitialized: gisReady } = useGoogleAuth();

  const [integration, setIntegration] = useState<api.IntegrationResponse | null>(null);
  // Use integration's own tenant_id once loaded, fallback to apiTenantId for initial fetch
  const effectiveTenantId = integration?.tenant_id || apiTenantId;
  const [catalog, setCatalog] = useState<Record<string, api.IntegrationCatalogEntry>>({});
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [connectionDetail, setConnectionDetail] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const saveName = async () => {
    if (!effectiveTenantId || !id || !nameDraft.trim()) return;
    setSavingName(true);
    try {
      const updated = await api.renameIntegration(effectiveTenantId, id, nameDraft.trim());
      setIntegration(updated);
      setEditingName(false);
      toast.success("Name updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setSavingName(false);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!effectiveTenantId || !id) return;
    setDeleting(true);
    try {
      await api.deleteIntegration(effectiveTenantId, id);
      toast.success("Integration deleted");
      navigate("/integrations");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  const handleTenantChange = async (newTenantId: string) => {
    if (!effectiveTenantId || !id || newTenantId === integration?.tenant_id) return;
    try {
      const updated = await api.reassignIntegrationTenant(effectiveTenantId, id, newTenantId);
      setIntegration(updated);
      toast.success(`Moved to ${tenants.find((t) => t.id === newTenantId)?.name || newTenantId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign tenant");
    }
  };

  const fetchData = useCallback(async () => {
    if (!effectiveTenantId || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [intData, catData] = await Promise.all([
        api.getIntegration(effectiveTenantId, id),
        api.getIntegrationCatalog(effectiveTenantId),
      ]);
      setIntegration(intData);
      setCatalog(catData);
      setFormData(intData.config || {});
    } catch {
      toast.error("Failed to load integration");
    } finally {
      setLoading(false);
    }
  }, [effectiveTenantId, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const integrationType = integration?.integration_type ?? "";
  const catalogEntry = integration ? catalog[integrationType] : null;
  const configFields = catalogEntry?.config_fields ?? [];
  const integrationName = catalogEntry?.name ?? integrationType ?? "Integration";
  const isGoogleDrive = integrationType === "google-drive";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setConnectionStatus("idle");
  };

  /* Google sign-in handler — initialise GIS with the client_id from the form, then sign in */
  const [signingIn, setSigningIn] = useState(false);
  const handleGoogleSignIn = async () => {
    const clientId = formData.client_id?.trim();
    if (!clientId) {
      toast.error("Enter your Google OAuth Client ID first");
      return;
    }
    setSigningIn(true);
    try {
      // Always (re-)configure GIS with the client_id from the form
      await configureClientId(clientId);
      await googleSignIn();
      toast.success("Signed in with Google");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setSigningIn(false);
    }
  };

  /* Strip redacted values so we never overwrite real secrets with masked strings */
  const buildConfigToSave = () => {
    const config: Record<string, string> = {};
    for (const [key, value] of Object.entries(formData)) {
      if (typeof value === "string" && value.includes("••••")) continue;
      config[key] = value as string;
    }
    if (isGoogleDrive && googleAccessToken) {
      config.access_token = googleAccessToken;
    }
    return config;
  };

  /* Test integration */
  const testConnection = async () => {
    if (!effectiveTenantId || !id) return;
    setConnectionStatus("testing");
    setConnectionDetail(null);
    try {
      await api.updateIntegrationConfig(effectiveTenantId, id, buildConfigToSave());
      const result = await api.testIntegration(effectiveTenantId, id);
      setConnectionStatus(result.ok ? "success" : "error");
      if (result.folder_name) {
        setConnectionDetail(`Connected to folder: ${result.folder_name}`);
      } else if (result.detail) {
        setConnectionDetail(result.detail);
      }
    } catch {
      setConnectionStatus("error");
    }
  };

  /* Save & enable */
  const handleEnable = async () => {
    if (!effectiveTenantId || !id) return;
    setSaving(true);
    try {
      await api.updateIntegrationConfig(effectiveTenantId, id, buildConfigToSave());
      await api.enableIntegration(effectiveTenantId, id);
      toast.success(`${integrationName} enabled`);
      navigate("/integrations");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to enable integration");
    } finally {
      setSaving(false);
    }
  };

  /* Save without enabling */
  const handleSave = async () => {
    if (!effectiveTenantId || !id) return;
    setSaving(true);
    try {
      await api.updateIntegrationConfig(effectiveTenantId, id, buildConfigToSave());
      toast.success("Configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const allFieldsFilled =
    configFields.every((f) => {
      const meta = getFieldMeta(integrationType, f);
      return meta.optional || !!formData[f];
    }) &&
    (!isGoogleDrive || googleAuthed);

  const canTest = connectionStatus !== "testing" && allFieldsFilled;

  /* ── Render ──────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!integration) {
    return (
      <div className="p-8 text-center text-gray-500">Integration not found.</div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        {/* Back */}
        <button
          onClick={() => navigate("/integrations")}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Integrations
        </button>

        {/* Header with editable name */}
        <div className="mb-6">
          {editingName ? (
            <div className="flex items-center gap-2 mb-1">
              <input
                autoFocus
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") { setEditingName(false); setNameDraft(integration.name || ""); }
                }}
                className="text-2xl font-semibold text-gray-900 bg-gray-50 border border-gray-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              <button onClick={saveName} disabled={savingName || !nameDraft.trim()} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50">
                {savingName ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              </button>
              <button onClick={() => { setEditingName(false); setNameDraft(integration.name || ""); }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-semibold text-gray-900">
                {integration.name || integrationName} Integration
              </h1>
              <button
                onClick={() => { setNameDraft(integration.name || integrationName); setEditingName(true); }}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Rename integration"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          )}
          {integration.name && integration.name !== integrationName && (
            <p className="text-xs text-gray-400 mb-1">{integrationName}</p>
          )}
          <p className="text-sm text-gray-600">
            Configure your {integration.name || integrationName} connection.
          </p>
          {/* Tenant assignment */}
          <div className="flex items-center gap-2 mt-3">
            <Building2 className="w-4 h-4 text-gray-400" />
            <label className="text-sm text-gray-500">Tenant:</label>
            <select
              value={integration.tenant_id}
              onChange={(e) => handleTenantChange(e.target.value)}
              className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Config fields ────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          {isGoogleDrive && (
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              Step 1 — Configure Drive Settings
            </h2>
          )}

          <div className="space-y-6">
            {configFields.map((field) => {
              const meta = getFieldMeta(integrationType, field);
              return (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {meta.label}
                  </label>
                  {meta.help && (
                    <p className="text-xs text-gray-500 mb-2">{meta.help}</p>
                  )}
                  <input
                    type={meta.secret ? "password" : "text"}
                    name={field}
                    value={formData[field] || ""}
                    onChange={handleChange}
                    placeholder={meta.placeholder}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
                  />
                </div>
              );
            })}

            {/* ── Google Drive: Sign-in section (Step 2) ──── */}
            {isGoogleDrive && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">
                  Step 2 — Sign in with Google
                </h2>
                <p className="text-xs text-gray-500 mb-3">
                  Sign in so the platform can access your Google Drive to read and create documents.
                  Your OAuth Client ID above will be used for authentication.
                </p>
                {googleAuthed ? (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <CheckCircle2 className="w-4 h-4" />
                    Signed in{googleEmail ? ` as ${googleEmail}` : ""}
                  </div>
                ) : (
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={!formData.client_id?.trim() || signingIn}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {signingIn ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogIn className="w-4 h-4" />
                    )}
                    Sign in with Google
                  </button>
                )}
                {!formData.client_id?.trim() && !googleAuthed && (
                  <p className="text-xs text-amber-600 mt-2">
                    Enter your OAuth Client ID above first.
                  </p>
                )}
              </div>
            )}

            {/* Connection Status */}
            {connectionStatus !== "idle" && (
              <div
                className={`p-4 rounded-lg border flex items-start gap-3 ${
                  connectionStatus === "testing"
                    ? "bg-blue-50 border-blue-200"
                    : connectionStatus === "success"
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                {connectionStatus === "testing" && (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mt-0.5" />
                    <span className="text-sm text-blue-700">Testing connection...</span>
                  </>
                )}
                {connectionStatus === "success" && (
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Connection successful!</span>
                    </div>
                    {connectionDetail && (
                      <div className="flex items-center gap-1.5 mt-1.5 ml-7 text-xs text-green-600">
                        <FolderOpen className="w-3.5 h-3.5" />
                        {connectionDetail}
                      </div>
                    )}
                  </div>
                )}
                {connectionStatus === "error" && (
                  <div>
                    <div className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-red-600" />
                      <span className="text-sm font-medium text-red-700">Connection failed</span>
                    </div>
                    {connectionDetail && (
                      <p className="text-xs text-red-600 mt-1 ml-7">{connectionDetail}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={testConnection}
                disabled={!canTest}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Test Integration
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={handleEnable}
                disabled={!allFieldsFilled || saving}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save &amp; Enable
              </button>
              <div className="ml-auto">
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">Delete this integration?</span>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Webservice Endpoints ────────────────────────── */}
        <EndpointsSection
          integration={integration}
          catalog={catalog}
          tenantId={effectiveTenantId!}
          onUpdate={(updated) => setIntegration(updated)}
        />
      </div>
    </div>
  );
}


/* ── METHOD badge colors ──────────────────────────────────────── */

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700",
  POST: "bg-green-100 text-green-700",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-purple-100 text-purple-700",
  DELETE: "bg-red-100 text-red-700",
};

/* ── Endpoints sub-component ──────────────────────────────────── */

interface EndpointsSectionProps {
  integration: api.IntegrationResponse;
  catalog: Record<string, api.IntegrationCatalogEntry>;
  tenantId: string;
  onUpdate: (i: api.IntegrationResponse) => void;
}

const EMPTY_FORM = { name: "", path: "", method: "GET", description: "", headers: {} as Record<string, string>, query_params: {} as Record<string, string> };

function EndpointsSection({ integration, catalog, tenantId, onUpdate }: EndpointsSectionProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
  const [savingEdit, setSavingEdit] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; latency_ms?: number; resolved_url?: string; response_body?: string; detail?: string }>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  // Tester panel state
  const [testerEpId, setTesterEpId] = useState<string | null>(null);
  const [fetchLimit, setFetchLimit] = useState(5);
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ ok: boolean; latency_ms?: number; record_count?: number; records?: Record<string, unknown>[]; detail?: string } | null>(null);
  const [pathVars, setPathVars] = useState<Record<string, string>>({});
  const [showResponseBody, setShowResponseBody] = useState<string | null>(null); // ep id
  // Inline path-vars prompt: which endpoint + what action triggered it
  const [promptEpId, setPromptEpId] = useState<string | null>(null);
  const [promptAction, setPromptAction] = useState<"test" | "fetch" | null>(null);

  const endpoints = integration.endpoints || [];
  const catalogEntry = catalog[integration.integration_type];
  const defaultEndpoints = catalogEntry?.default_endpoints || [];

  // Endpoints from catalog that haven't been added yet
  const suggestable = defaultEndpoints.filter(
    (de) => !endpoints.some((ep) => ep.path === de.path && ep.method === de.method)
  );

  const handleAdd = async () => {
    if (!form.name.trim() || !form.path.trim()) return;
    setAdding(true);
    try {
      const updated = await api.addIntegrationEndpoint(tenantId, integration.id, {
        name: form.name.trim(),
        path: form.path.trim(),
        method: form.method,
        description: form.description.trim(),
        headers: form.headers,
        query_params: form.query_params,
      });
      onUpdate(updated);
      setForm({ ...EMPTY_FORM });
      setShowAdd(false);
      toast.success(`Endpoint "${form.name}" added`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add endpoint");
    } finally {
      setAdding(false);
    }
  };

  const handleAddFromCatalog = async (de: api.CatalogDefaultEndpoint) => {
    setAdding(true);
    try {
      const updated = await api.addIntegrationEndpoint(tenantId, integration.id, {
        name: de.name,
        path: de.path,
        method: de.method,
        description: de.description,
      });
      onUpdate(updated);
      toast.success(`Endpoint "${de.name}" added`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add endpoint");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (ep: api.IntegrationEndpoint) => {
    setEditingId(ep.id);
    setEditForm({ name: ep.name, path: ep.path, method: ep.method, description: ep.description, headers: { ...ep.headers }, query_params: { ...ep.query_params } });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSavingEdit(true);
    try {
      const updated = await api.updateIntegrationEndpoint(tenantId, integration.id, editingId, {
        name: editForm.name.trim(),
        path: editForm.path.trim(),
        method: editForm.method,
        description: editForm.description.trim(),
        headers: editForm.headers,
        query_params: editForm.query_params,
      });
      onUpdate(updated);
      setEditingId(null);
      toast.success("Endpoint updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSavingEdit(false);
    }
  };

  // Extract {var} placeholders from an endpoint path
  const getPathVarNames = (path: string): string[] => {
    const matches = path.match(/\{([^}]+)\}/g);
    if (!matches) return [];
    return matches.map((m) => m.slice(1, -1));
  };

  // Initialise path var inputs for an endpoint and show the prompt if needed
  const initPathVars = (epId: string) => {
    const ep = endpoints.find((e) => e.id === epId);
    if (ep) {
      const vars: Record<string, string> = {};
      getPathVarNames(ep.path).forEach((v) => { vars[v] = pathVars[v] || ""; });
      setPathVars(vars);
    }
  };

  // Gate: if the endpoint has unfilled path vars, show prompt; otherwise execute directly
  const requirePathVars = (epId: string, action: "test" | "fetch"): boolean => {
    const ep = endpoints.find((e) => e.id === epId);
    if (!ep) return false;
    const varNames = getPathVarNames(ep.path);
    if (varNames.length === 0) return false; // no vars needed
    // Check if all vars are already filled from a previous prompt
    const allFilled = varNames.every((v) => pathVars[v]?.trim());
    if (allFilled) return false; // already have values
    // Show the prompt
    initPathVars(epId);
    setPromptEpId(epId);
    setPromptAction(action);
    return true; // caller should NOT proceed
  };

  const dismissPrompt = () => {
    setPromptEpId(null);
    setPromptAction(null);
  };

  const executePromptAction = () => {
    if (!promptEpId || !promptAction) return;
    const epId = promptEpId;
    const action = promptAction;
    dismissPrompt();
    if (action === "test") doTest(epId);
    else doFetch(epId);
  };

  const doTest = async (epId: string) => {
    setTestingId(epId);
    setTestResult((prev) => { const n = { ...prev }; delete n[epId]; return n; });
    setShowResponseBody(null);
    try {
      const pv = Object.keys(pathVars).length > 0 ? pathVars : undefined;
      const result = await api.testIntegrationEndpoint(tenantId, integration.id, epId, {
        path_vars: pv,
      });
      setTestResult((prev) => ({ ...prev, [epId]: result }));
    } catch {
      setTestResult((prev) => ({ ...prev, [epId]: { ok: false, detail: "Request failed" } }));
    } finally {
      setTestingId(null);
    }
  };

  const handleTest = (epId: string) => {
    if (!requirePathVars(epId, "test")) doTest(epId);
  };

  const openTester = (epId: string) => {
    if (testerEpId === epId) {
      setTesterEpId(null);
      setFetchResult(null);
      return;
    }
    setTesterEpId(epId);
    setFetchResult(null);
    setFetchLimit(5);
    setShowResponseBody(null);
    initPathVars(epId);
  };

  const doFetch = async (epId: string) => {
    setFetching(true);
    setFetchResult(null);
    // Also open the tester panel so results are visible
    if (testerEpId !== epId) {
      setTesterEpId(epId);
      setFetchLimit(5);
    }
    try {
      const pv = Object.keys(pathVars).length > 0 ? pathVars : undefined;
      const result = await api.fetchEndpointRecords(tenantId, integration.id, epId, fetchLimit, pv);
      setFetchResult(result);
    } catch {
      setFetchResult({ ok: false, detail: "Request failed" });
    } finally {
      setFetching(false);
    }
  };

  const handleFetch = () => {
    const epId = testerEpId;
    if (!epId) return;
    if (!requirePathVars(epId, "fetch")) doFetch(epId);
  };

  const handleFetchFromButton = (epId: string) => {
    if (!requirePathVars(epId, "fetch")) doFetch(epId);
  };

  const handleDelete = async (epId: string) => {
    setDeletingId(epId);
    try {
      await api.deleteIntegrationEndpoint(tenantId, integration.id, epId);
      onUpdate({ ...integration, endpoints: endpoints.filter((e) => e.id !== epId) });
      toast.success("Endpoint removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="mt-6">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left group"
        >
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <Globe className="w-4 h-4 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Webservice Endpoints</h2>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{endpoints.length}</span>
        </button>
        {expanded && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Endpoint
          </button>
        )}
      </div>

      {expanded && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          {/* Endpoint list */}
          {endpoints.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {endpoints.map((ep) => (
                <div key={ep.id} className="p-4">
                  {editingId === ep.id ? (
                    /* Inline edit form */
                    <div className="space-y-3">
                      <div className="grid grid-cols-[1fr_120px] gap-3">
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="Endpoint name"
                          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                        <select
                          value={editForm.method}
                          onChange={(e) => setEditForm({ ...editForm, method: e.target.value })}
                          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                        >
                          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        value={editForm.path}
                        onChange={(e) => setEditForm({ ...editForm, path: e.target.value })}
                        placeholder="/api/..."
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <input
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        placeholder="Description (optional)"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <div className="flex gap-2">
                        <button onClick={handleSaveEdit} disabled={savingEdit || !editForm.name.trim() || !editForm.path.trim()} className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 flex items-center gap-1.5">
                          {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    /* Read-only row + tester */
                    <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${METHOD_COLORS[ep.method] || "bg-gray-100 text-gray-700"}`}>
                            {ep.method}
                          </span>
                          <span className="text-sm font-medium text-gray-900 truncate">{ep.name}</span>
                        </div>
                        <code className="text-xs text-gray-500 font-mono">{ep.path}</code>
                        {ep.description && <p className="text-xs text-gray-400 mt-0.5">{ep.description}</p>}
                        {/* Test result inline */}
                        {testResult[ep.id] && (
                          <div className="mt-1.5">
                            <div className={`text-xs flex items-center gap-1 ${testResult[ep.id].ok ? "text-green-600" : "text-red-600"}`}>
                              {testResult[ep.id].ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {testResult[ep.id].detail || (testResult[ep.id].ok ? "Success" : "Failed")}
                              {testResult[ep.id].response_body && (
                                <button
                                  onClick={() => setShowResponseBody(showResponseBody === ep.id ? null : ep.id)}
                                  className="ml-2 inline-flex items-center gap-1 text-gray-400 hover:text-indigo-600 transition-colors"
                                >
                                  <Code className="w-3 h-3" />
                                  {showResponseBody === ep.id ? "Hide" : "Response"}
                                  {showResponseBody === ep.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                            {testResult[ep.id].resolved_url && (
                              <code className="block mt-1 text-[10px] text-gray-400 font-mono truncate" title={testResult[ep.id].resolved_url}>{testResult[ep.id].resolved_url}</code>
                            )}
                            {showResponseBody === ep.id && testResult[ep.id].response_body && (
                              <pre className="mt-2 p-3 bg-gray-900 text-green-400 text-xs font-mono rounded-lg overflow-auto max-h-64 whitespace-pre-wrap">{(() => {
                                try { return JSON.stringify(JSON.parse(testResult[ep.id].response_body!), null, 2); } catch { return testResult[ep.id].response_body; }
                              })()}</pre>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleTest(ep.id)} disabled={testingId === ep.id} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Test endpoint">
                          {testingId === ep.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button onClick={() => openTester(ep.id)} className={`p-1.5 rounded-lg transition-colors ${testerEpId === ep.id ? "text-indigo-600 bg-indigo-50" : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"}`} title="Fetch records">
                          <Search className="w-4 h-4" />
                        </button>
                        <button onClick={() => startEdit(ep)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {confirmDeleteId === ep.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(ep.id)} disabled={deletingId === ep.id} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Confirm delete">
                              {deletingId === ep.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(ep.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {/* ── Path vars prompt (inline mini-dialog) ── */}
                    {promptEpId === ep.id && (() => {
                      const varNames = getPathVarNames(ep.path);
                      return (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-xs font-medium text-amber-800 mb-2">
                            This endpoint requires {varNames.length === 1 ? "a parameter" : "parameters"} before it can be called:
                          </p>
                          <div className="flex flex-wrap items-end gap-3">
                            {varNames.map((v) => (
                              <div key={v} className="flex flex-col gap-1">
                                <label className="text-xs text-amber-700 font-mono">{`{${v}}`}</label>
                                <input
                                  autoFocus={varNames[0] === v}
                                  type="text"
                                  value={pathVars[v] || ""}
                                  onChange={(e) => setPathVars((prev) => ({ ...prev, [v]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === "Enter") executePromptAction(); if (e.key === "Escape") dismissPrompt(); }}
                                  placeholder={v}
                                  className="w-48 px-2 py-1.5 bg-white border border-amber-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                            ))}
                            <button
                              onClick={executePromptAction}
                              disabled={varNames.some((v) => !pathVars[v]?.trim())}
                              className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {promptAction === "test" ? <Play className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
                              {promptAction === "test" ? "Run Test" : "Fetch"}
                            </button>
                            <button
                              onClick={dismissPrompt}
                              className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                    {/* ── Tester panel ── */}
                    {testerEpId === ep.id && (() => {
                      const varNames = getPathVarNames(ep.path);
                      return (
                      <div className="mt-3 p-4 bg-indigo-50/50 border border-indigo-200 rounded-lg space-y-3">
                        {/* Path variable inputs */}
                        {varNames.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-gray-600">Path variables</p>
                            <div className="flex flex-wrap gap-2">
                              {varNames.map((v) => (
                                <div key={v} className="flex items-center gap-1.5">
                                  <code className="text-xs text-indigo-600 font-mono bg-indigo-100 px-1.5 py-0.5 rounded">{`{${v}}`}</code>
                                  <input
                                    type="text"
                                    value={pathVars[v] || ""}
                                    onChange={(e) => setPathVars((prev) => ({ ...prev, [v]: e.target.value }))}
                                    placeholder={v}
                                    className="w-44 px-2 py-1 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Controls row */}
                        <div className="flex items-center gap-3">
                          <label className="text-xs font-medium text-gray-700">Limit</label>
                          <input
                            type="number"
                            min={1}
                            max={25}
                            value={fetchLimit}
                            onChange={(e) => setFetchLimit(Math.max(1, Math.min(25, Number(e.target.value) || 1)))}
                            className="w-16 px-2 py-1 bg-white border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            onClick={() => doTest(ep.id)}
                            disabled={testingId === ep.id}
                            className="px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {testingId === ep.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            Test
                          </button>
                          <button
                            onClick={() => doFetch(ep.id)}
                            disabled={fetching}
                            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                            Fetch Records
                          </button>
                          <button
                            onClick={() => { setTesterEpId(null); setFetchResult(null); }}
                            className="ml-auto p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Fetch results */}
                        {fetchResult && (
                          <div className="space-y-2">
                            {/* Status bar */}
                            <div className={`flex items-center gap-3 text-xs px-3 py-2 rounded-lg ${fetchResult.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                              {fetchResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                              <span className="font-medium">{fetchResult.ok ? "Success" : "Failed"}</span>
                              {fetchResult.latency_ms != null && (
                                <span className="text-gray-500">{fetchResult.latency_ms}ms</span>
                              )}
                              {fetchResult.record_count != null && (
                                <span className="text-gray-500">{fetchResult.record_count} record{fetchResult.record_count !== 1 ? "s" : ""}</span>
                              )}
                              {fetchResult.detail && !fetchResult.ok && (
                                <span className="truncate">{fetchResult.detail}</span>
                              )}
                            </div>

                            {/* Records table */}
                            {fetchResult.records && fetchResult.records.length > 0 && (
                              <div className="overflow-auto max-h-96 rounded-lg border border-gray-200">
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-100 sticky top-0">
                                    <tr>
                                      {Object.keys(fetchResult.records[0]).slice(0, 8).map((key) => (
                                        <th key={key} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{key}</th>
                                      ))}
                                      {Object.keys(fetchResult.records[0]).length > 8 && (
                                        <th className="px-3 py-2 text-left font-medium text-gray-400">...</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {fetchResult.records.map((rec, idx) => {
                                      const keys = Object.keys(rec).slice(0, 8);
                                      return (
                                        <tr key={idx} className="hover:bg-gray-50">
                                          {keys.map((key) => (
                                            <td key={key} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate" title={String(rec[key] ?? "")}>
                                              {rec[key] == null ? <span className="text-gray-300">null</span> : String(rec[key])}
                                            </td>
                                          ))}
                                          {Object.keys(rec).length > 8 && (
                                            <td className="px-3 py-2 text-gray-400">...</td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      );
                    })()}
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-gray-500">
              No endpoints configured yet.
            </div>
          )}

          {/* Suggested endpoints from catalog */}
          {suggestable.length > 0 && !showAdd && (
            <div className="border-t border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Suggested endpoints</p>
              <div className="flex flex-wrap gap-2">
                {suggestable.map((de, i) => (
                  <button
                    key={i}
                    onClick={() => handleAddFromCatalog(de)}
                    disabled={adding}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3" />
                    <span className={`font-bold ${METHOD_COLORS[de.method]?.split(" ")[1] || "text-gray-700"}`}>{de.method}</span>
                    {de.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add endpoint form */}
          {showAdd && (
            <div className="border-t border-gray-100 p-4">
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">New Endpoint</p>
                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Endpoint name"
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <select
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value })}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <input
                  value={form.path}
                  onChange={(e) => setForm({ ...form, path: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setShowAdd(false); setForm({ ...EMPTY_FORM }); } }}
                  placeholder="/api/now/table/incident"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setShowAdd(false); setForm({ ...EMPTY_FORM }); } }}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <div className="flex gap-2">
                  <button onClick={handleAdd} disabled={adding || !form.name.trim() || !form.path.trim()} className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                    {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add Endpoint
                  </button>
                  <button onClick={() => { setShowAdd(false); setForm({ ...EMPTY_FORM }); }} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
