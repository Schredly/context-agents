import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, CheckCircle2, XCircle, Plug, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useTenants } from "../context/TenantContext";
import { TenantFilter, type TenantFilterValue } from "../components/TenantFilter";
import * as api from "../services/api";

/* ── Integration type → friendly name ──────────────────────────── */

const INTEGRATION_NAMES: Record<string, string> = {
  servicenow: "ServiceNow",
  "google-drive": "Google Drive",
  salesforce: "Salesforce",
  slack: "Slack",
  github: "GitHub",
  jira: "Jira",
  replit: "Replit",
};

const INTEGRATION_COLORS: Record<string, string> = {
  servicenow: "bg-green-100 text-green-700 border-green-200",
  "google-drive": "bg-blue-100 text-blue-700 border-blue-200",
  salesforce: "bg-sky-100 text-sky-700 border-sky-200",
  slack: "bg-purple-100 text-purple-700 border-purple-200",
  github: "bg-gray-100 text-gray-700 border-gray-200",
  jira: "bg-indigo-100 text-indigo-700 border-indigo-200",
  replit: "bg-orange-100 text-orange-700 border-orange-200",
};

/* ── Component ─────────────────────────────────────────────────── */

export default function ToolsPage() {
  const { currentTenantId } = useTenants();
  const [filterTenant, setFilterTenant] = useState<TenantFilterValue>("all");
  const [catalog, setCatalog] = useState<api.ToolsResponse | null>(null);
  const [available, setAvailable] = useState<api.ToolsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const fetchTools = useCallback(async () => {
    if (!currentTenantId) {
      setCatalog(null);
      setAvailable(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [cat, avail] = await Promise.all([
        api.getToolsCatalog(currentTenantId),
        api.getAvailableTools(currentTenantId),
      ]);
      setCatalog(cat);
      setAvailable(avail);
    } catch {
      toast.error("Failed to load tools");
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const availableToolIds = new Set(available?.tools.map((t) => t.tool_id) || []);
  const source = showAvailableOnly ? available : catalog;
  const byIntegration = source?.by_integration || {};
  const integrationTypes = Object.keys(byIntegration).sort();
  const totalCount = source?.tools.length || 0;
  const availableCount = available?.tools.length || 0;
  const catalogCount = catalog?.tools.length || 0;

  const toggleGroup = (intType: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(intType)) next.delete(intType);
      else next.add(intType);
      return next;
    });
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">Tools</h1>
            <p className="text-sm text-gray-600">
              Capabilities available to skills, grouped by integration.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <TenantFilter value={filterTenant} onChange={setFilterTenant} />
            </div>
          </div>
          {/* Toggle */}
          {catalog && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {availableCount} of {catalogCount} available
              </span>
              <button
                onClick={() => setShowAvailableOnly(!showAvailableOnly)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  showAvailableOnly
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {showAvailableOnly ? "Available Only" : "All Tools"}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading tools...
          </div>
        ) : !currentTenantId ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <AlertCircle className="w-5 h-5 mr-2" />
            Select a tenant to view tools.
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-16 text-gray-500">
            {showAvailableOnly
              ? "No tools available — enable integrations to unlock tools."
              : "No tools in the catalog."}
          </div>
        ) : (
          <div className="space-y-4">
            {integrationTypes.map((intType) => {
              const tools = byIntegration[intType];
              const name = INTEGRATION_NAMES[intType] || intType;
              const colors = INTEGRATION_COLORS[intType] || "bg-gray-100 text-gray-700 border-gray-200";
              const isCollapsed = collapsedGroups.has(intType);
              const groupAvailableCount = tools.filter((t) => availableToolIds.has(t.tool_id)).length;

              return (
                <div
                  key={intType}
                  className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
                >
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(intType)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                    <Plug className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-900">{name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors}`}>
                      {tools.length} tool{tools.length !== 1 ? "s" : ""}
                    </span>
                    {groupAvailableCount === tools.length ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="w-3 h-3" /> Connected
                      </span>
                    ) : groupAvailableCount > 0 ? (
                      <span className="text-xs text-amber-600">
                        {groupAvailableCount}/{tools.length} available
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <XCircle className="w-3 h-3" /> Not connected
                      </span>
                    )}
                  </button>

                  {/* Tool rows */}
                  {!isCollapsed && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {tools.map((tool) => {
                        const isAvailable = availableToolIds.has(tool.tool_id);
                        return (
                          <div
                            key={tool.tool_id}
                            className={`px-5 py-3 flex items-start gap-4 ${
                              isAvailable ? "" : "opacity-50"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-medium text-gray-900">
                                  {tool.name}
                                </span>
                                <code className="text-[10px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                                  {tool.tool_id}
                                </code>
                              </div>
                              <p className="text-xs text-gray-500">{tool.description}</p>
                              {/* Schemas */}
                              <div className="flex gap-4 mt-1.5">
                                {tool.input_schema && Object.keys(tool.input_schema).length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-medium text-gray-400 uppercase">In:</span>
                                    {Object.entries(tool.input_schema).map(([key, type]) => (
                                      <span
                                        key={key}
                                        className="text-[10px] font-mono bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded"
                                      >
                                        {key}: {type}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {tool.output_schema && Object.keys(tool.output_schema).length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-medium text-gray-400 uppercase">Out:</span>
                                    {Object.entries(tool.output_schema).map(([key, type]) => (
                                      <span
                                        key={key}
                                        className="text-[10px] font-mono bg-green-50 text-green-600 px-1.5 py-0.5 rounded"
                                      >
                                        {key}: {type}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 mt-0.5">
                              {isAvailable ? (
                                <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 className="w-3 h-3" /> Available
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                                  <XCircle className="w-3 h-3" /> Unavailable
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
