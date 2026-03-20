import { useState, useEffect } from 'react';
import { GitBranch, Play, Server, Cloud, Ticket, Headset, Briefcase, Globe, Plus, CheckCircle, Loader2, Save, X } from 'lucide-react';
import type { FilesystemPlan } from '../../store/useGenomeStore';

const TENANT = "acme";
const API = `/api/admin/${TENANT}`;

interface TenantIntegration {
  id: string;
  integration_type: string;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
}

const typeIcons: Record<string, typeof Server> = {
  servicenow: Server,
  salesforce: Cloud,
  jira: Ticket,
  zendesk: Headset,
  workday: Briefcase,
  github: GitBranch,
  replit: Play,
};

interface IntegrationsSidebarProps {
  filesystemPlan?: FilesystemPlan | null;
  onCommit?: () => Promise<any>;
  isSaving?: boolean;
  savedBranch?: string | null;
  onConnectRepo?: (repoName: string) => void;
  onDisconnectRepo?: () => void;
  connectedRepo?: string | null;
}

export function IntegrationsSidebar({ filesystemPlan, onCommit, isSaving, savedBranch, onConnectRepo, onDisconnectRepo, connectedRepo }: IntegrationsSidebarProps) {
  const [addedIntegrations, setAddedIntegrations] = useState<TenantIntegration[]>([]);
  const [availableIntegrations, setAvailableIntegrations] = useState<TenantIntegration[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  // Load available tenant integrations when picker opens
  useEffect(() => {
    if (!showPicker) return;
    setLoadingAvailable(true);
    fetch(`${API}/integrations/?filter_tenant=all`)
      .then((r) => r.json())
      .then((data: TenantIntegration[]) => {
        // Only show enabled integrations not already added
        const addedIds = new Set(addedIntegrations.map((a) => a.id));
        setAvailableIntegrations(data.filter((i) => i.enabled && !addedIds.has(i.id)));
      })
      .catch(() => {})
      .finally(() => setLoadingAvailable(false));
  }, [showPicker, addedIntegrations]);

  const addIntegration = (integ: TenantIntegration) => {
    setAddedIntegrations((prev) => [...prev, integ]);
    setShowPicker(false);

    // If it's a GitHub integration, auto-connect the repo
    if (integ.integration_type === "github") {
      const repoName = integ.config?.default_repository
        ?.replace(/\.git$/, "")
        ?.split("/")
        .pop() || integ.name || "genome-repo";
      onConnectRepo?.(repoName);
    }
  };

  const removeIntegration = (id: string) => {
    const integ = addedIntegrations.find((i) => i.id === id);
    if (integ?.integration_type === "github") {
      onDisconnectRepo?.();
    }
    setAddedIntegrations((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="w-[300px] h-screen bg-gray-50 border-l border-gray-200 flex flex-col">
      <div className="px-4 py-4 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-semibold text-gray-900">Integrations</h2>
        <p className="text-xs text-gray-500 mt-0.5">{addedIntegrations.length} active</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {addedIntegrations.length === 0 && !showPicker && (
          <div className="text-center py-8 text-gray-400">
            <Globe className="w-6 h-6 mx-auto mb-2" />
            <p className="text-xs">No integrations added yet.</p>
            <p className="text-xs mt-1">Click below to connect one.</p>
          </div>
        )}

        {/* Added integrations */}
        {addedIntegrations.map((integ) => {
          const Icon = typeIcons[integ.integration_type] || Globe;
          const isGithub = integ.integration_type === "github";
          const repoName = integ.config?.default_repository
            ?.replace(/\.git$/, "")
            ?.split("/")
            .pop() || "";
          const isActive = isGithub && connectedRepo === repoName;

          return (
            <div key={integ.id}
              onClick={() => {
                if (isGithub) onConnectRepo?.(repoName);
              }}
              className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${
                isGithub ? "cursor-pointer" : ""
              } ${isActive ? "border-orange-400 ring-1 ring-orange-400" : "border-gray-200"}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isActive ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700"}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 capitalize">
                      {integ.name || integ.integration_type}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono truncate max-w-[150px]">
                      {integ.config?.instance_url?.replace("https://", "")
                        || integ.config?.default_repository?.replace(/.*\//, "")
                        || integ.config?.org
                        || ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isActive && <CheckCircle className="w-3.5 h-3.5 text-orange-600" />}
                  <button onClick={(e) => { e.stopPropagation(); removeIntegration(integ.id); }}
                    className="p-1 text-gray-400 hover:text-red-500 rounded" title="Remove">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* GitHub-specific: commit button */}
              {isGithub && (
                <div onClick={(e) => e.stopPropagation()}>
                  {savedBranch ? (
                    <div className="w-full px-3 py-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg flex items-center justify-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Saved to: {savedBranch}
                    </div>
                  ) : filesystemPlan ? (
                    <button onClick={onCommit} disabled={isSaving}
                      className="w-full px-3 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {isSaving ? 'Committing...' : `Commit ${filesystemPlan.files.length} file(s)`}
                    </button>
                  ) : isActive ? (
                    <div className="w-full px-3 py-1.5 text-[10px] font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg text-center">
                      Repository loaded
                    </div>
                  ) : (
                    <div className="w-full px-3 py-1.5 text-[10px] font-medium text-gray-500 bg-gray-50 rounded-lg text-center">
                      Click to load repository
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Integration picker */}
        {showPicker && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide">Available Integrations</h3>
              <button onClick={() => setShowPicker(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {loadingAvailable ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            ) : availableIntegrations.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">No more integrations available.</p>
            ) : (
              <div className="space-y-2">
                {availableIntegrations.map((integ) => {
                  const Icon = typeIcons[integ.integration_type] || Globe;
                  return (
                    <button key={integ.id} onClick={() => addIntegration(integ)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-left transition-colors">
                      <Icon className="w-4 h-4 text-gray-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 capitalize">{integ.name || integ.integration_type}</p>
                        <p className="text-[10px] text-gray-500 truncate">
                          {integ.config?.instance_url?.replace("https://", "") || integ.config?.org || ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Add Integration button */}
        {!showPicker && (
          <button onClick={() => setShowPicker(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors">
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">Add Integration</span>
          </button>
        )}
      </div>
    </div>
  );
}
