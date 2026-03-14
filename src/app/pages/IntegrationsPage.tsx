import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useTenants } from "../context/TenantContext";
import { TenantFilter, type TenantFilterValue } from "../components/TenantFilter";
import * as api from "../services/api";

const MULTI_INSTANCE_TYPES = new Set(["github"]);

const ICONS: Record<string, string> = {
  servicenow: "\u{1F527}",
  "google-drive": "\u{1F4C1}",
  salesforce: "\u2601\uFE0F",
  slack: "\u{1F4AC}",
  github: "\u{1F419}",
  jira: "\u{1F4CB}",
  replit: "\u{1F680}",
};

export default function IntegrationsPage() {
  const { currentTenantId } = useTenants();
  const [filterTenant, setFilterTenant] = useState<TenantFilterValue>("all");
  const [integrations, setIntegrations] = useState<api.IntegrationResponse[]>(
    [],
  );
  const [catalog, setCatalog] = useState<
    Record<string, api.IntegrationCatalogEntry>
  >({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentTenantId) {
      setIntegrations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [ints, cat] = await Promise.all([
        api.getIntegrations(currentTenantId, filterTenant),
        api.getIntegrationCatalog(currentTenantId),
      ]);
      setIntegrations(ints);
      setCatalog(cat);
    } catch {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, filterTenant]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const [namePromptType, setNamePromptType] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const existingTypes = new Set(integrations.map((i) => i.integration_type));
  const availableTypes = Object.entries(catalog).filter(
    ([key]) => !existingTypes.has(key) || MULTI_INSTANCE_TYPES.has(key),
  );

  const handleAddClick = (integrationType: string) => {
    if (MULTI_INSTANCE_TYPES.has(integrationType)) {
      setNamePromptType(integrationType);
      setNameInput("");
      setShowAdd(false);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    } else {
      handleAdd(integrationType);
    }
  };

  const handleAdd = async (integrationType: string, name?: string) => {
    if (!currentTenantId) return;
    try {
      await api.createIntegration(currentTenantId, integrationType, name);
      setShowAdd(false);
      setNamePromptType(null);
      setNameInput("");
      await fetchData();
      toast.success(`${name || catalog[integrationType]?.name || integrationType} added`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add integration",
      );
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              Integrations
            </h1>
            <p className="text-sm text-gray-600">
              Connect external systems for this tenant.
            </p>
            <div className="mt-2">
              <TenantFilter value={filterTenant} onChange={setFilterTenant} />
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowAdd(!showAdd)}
              disabled={!currentTenantId || availableTypes.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Add Integration
            </button>
            {showAdd && availableTypes.length > 0 && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                {availableTypes.map(([key, entry]) => (
                  <button
                    key={key}
                    onClick={() => handleAddClick(key)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg flex items-center gap-2"
                  >
                    <span className="text-lg">{ICONS[key] ?? "🔌"}</span>
                    {entry.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Name Prompt Modal for multi-instance types */}
        {namePromptType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Name this {catalog[namePromptType]?.name ?? namePromptType} integration
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Give it a unique name to distinguish it from other {catalog[namePromptType]?.name ?? namePromptType} integrations.
              </p>
              <input
                ref={nameInputRef}
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nameInput.trim()) handleAdd(namePromptType, nameInput.trim());
                  if (e.key === "Escape") { setNamePromptType(null); setNameInput(""); }
                }}
                placeholder="e.g. Production, Staging, Client-A"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setNamePromptType(null); setNameInput(""); }}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAdd(namePromptType, nameInput.trim())}
                  disabled={!nameInput.trim()}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading integrations...
          </div>
        ) : !currentTenantId ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <AlertCircle className="w-5 h-5 mr-2" />
            Select a tenant to view integrations.
          </div>
        ) : integrations.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="mb-3">No integrations configured yet.</p>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Integration
            </button>
          </div>
        ) : (
          /* Integration Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((integration) => (
              <Link
                key={integration.id}
                to={`/integrations/${integration.id}`}
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 hover:border-gray-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">
                      {ICONS[integration.integration_type] ?? "🔌"}
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">
                        {integration.name ||
                          catalog[integration.integration_type]?.name ||
                          integration.integration_type}
                      </h3>
                      {integration.name && integration.name !== catalog[integration.integration_type]?.name && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {catalog[integration.integration_type]?.name}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">
                        {catalog[integration.integration_type]?.description ??
                          ""}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  {integration.connection_status === "connected" ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Connected
                      </span>
                    </>
                  ) : (
                    <>
                      <Circle className="w-4 h-4 text-gray-400" />
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        Not Connected
                      </span>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
