import { useParams, useNavigate } from "react-router";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, LogIn, FolderOpen } from "lucide-react";
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
      label: "Organization / Username",
      placeholder: "my-org",
      help: "GitHub organization or personal username that owns the repositories.",
    },
    repo: {
      label: "Repository (optional)",
      placeholder: "my-repo",
      help: "Scope actions to a specific repository. Leave blank to use all repos in the org.",
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
    username: { label: "Username", placeholder: "your-username", help: "Your Replit username (optional — auto-detected on Test Connection).", optional: true },
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
  const { currentTenantId } = useTenants();
  const { accessToken: googleAccessToken, signIn: googleSignIn, isAuthenticated: googleAuthed, userEmail: googleEmail, configureClientId, isInitialized: gisReady } = useGoogleAuth();

  const [integration, setIntegration] = useState<api.IntegrationResponse | null>(null);
  const [catalog, setCatalog] = useState<Record<string, api.IntegrationCatalogEntry>>({});
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [connectionDetail, setConnectionDetail] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentTenantId || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [intData, catData] = await Promise.all([
        api.getIntegration(currentTenantId, id),
        api.getIntegrationCatalog(currentTenantId),
      ]);
      setIntegration(intData);
      setCatalog(catData);
      setFormData(intData.config || {});
    } catch {
      toast.error("Failed to load integration");
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, id]);

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

  /* Test connection */
  const testConnection = async () => {
    if (!currentTenantId || !id) return;
    setConnectionStatus("testing");
    setConnectionDetail(null);
    try {
      // For Google Drive, include the access_token in the saved config so the backend can test
      const configToSave = { ...formData };
      if (isGoogleDrive && googleAccessToken) {
        configToSave.access_token = googleAccessToken;
      }
      await api.updateIntegrationConfig(currentTenantId, id, configToSave);
      const result = await api.testIntegration(currentTenantId, id);
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
    if (!currentTenantId || !id) return;
    setSaving(true);
    try {
      const configToSave = { ...formData };
      if (isGoogleDrive && googleAccessToken) {
        configToSave.access_token = googleAccessToken;
      }
      await api.updateIntegrationConfig(currentTenantId, id, configToSave);
      await api.enableIntegration(currentTenantId, id);
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
    if (!currentTenantId || !id) return;
    setSaving(true);
    try {
      const configToSave = { ...formData };
      if (isGoogleDrive && googleAccessToken) {
        configToSave.access_token = googleAccessToken;
      }
      await api.updateIntegrationConfig(currentTenantId, id, configToSave);
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

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            {integrationName} Integration
          </h1>
          <p className="text-sm text-gray-600">
            Configure your {integrationName} connection.
          </p>
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
                Test Connection
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
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save &amp; Enable
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
