import { useParams, useNavigate } from "react-router";
import { ArrowLeft, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTenants } from "../context/TenantContext";
import * as api from "../services/api";

export default function IntegrationConfigPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentTenantId } = useTenants();

  const [integration, setIntegration] = useState<api.IntegrationResponse | null>(null);
  const [catalog, setCatalog] = useState<Record<string, api.IntegrationCatalogEntry>>({});
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
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
      // Populate form from existing config
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

  const catalogEntry = integration
    ? catalog[integration.integration_type]
    : null;
  const configFields = catalogEntry?.config_fields ?? [];
  const integrationName = catalogEntry?.name ?? integration?.integration_type ?? "Integration";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const testConnection = async () => {
    if (!currentTenantId || !id) return;
    setConnectionStatus("testing");
    try {
      // Save config first so test can use it
      await api.updateIntegrationConfig(currentTenantId, id, formData);
      const result = await api.testIntegration(currentTenantId, id);
      setConnectionStatus(result.ok ? "success" : "error");
    } catch {
      setConnectionStatus("error");
    }
  };

  const handleEnable = async () => {
    if (!currentTenantId || !id) return;
    setSaving(true);
    try {
      await api.updateIntegrationConfig(currentTenantId, id, formData);
      await api.enableIntegration(currentTenantId, id);
      toast.success(`${integrationName} enabled`);
      navigate("/integrations");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to enable integration",
      );
    } finally {
      setSaving(false);
    }
  };

  const formatLabel = (field: string) =>
    field
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const isSecret = (field: string) =>
    ["password", "api_token", "token", "api_key", "webhook_url"].includes(field);

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
      <div className="p-8 text-center text-gray-500">
        Integration not found.
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        {/* Back button */}
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

        {/* Form */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="space-y-6">
            {configFields.map((field) => (
              <div key={field}>
                <label className="block text-sm text-gray-700 mb-2">
                  {formatLabel(field)}
                </label>
                <input
                  type={isSecret(field) ? "password" : "text"}
                  name={field}
                  value={formData[field] || ""}
                  onChange={handleChange}
                  placeholder={isSecret(field) ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : `Enter ${formatLabel(field).toLowerCase()}`}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            ))}

            {/* Connection Status */}
            {connectionStatus !== "idle" && (
              <div
                className={`p-4 rounded-lg border flex items-center gap-3 ${
                  connectionStatus === "testing"
                    ? "bg-blue-50 border-blue-200"
                    : connectionStatus === "success"
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                {connectionStatus === "testing" && (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                    <span className="text-sm text-blue-700">
                      Testing connection...
                    </span>
                  </>
                )}
                {connectionStatus === "success" && (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm text-green-700">
                      Connection successful!
                    </span>
                  </>
                )}
                {connectionStatus === "error" && (
                  <>
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="text-sm text-red-700">
                      Connection failed. Please check your credentials.
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={testConnection}
                disabled={connectionStatus === "testing"}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Test Connection
              </button>
              <button
                onClick={handleEnable}
                disabled={connectionStatus !== "success" || saving}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Enable Integration
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
