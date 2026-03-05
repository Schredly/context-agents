import { Fragment, useEffect, useState, useCallback } from 'react';
import {
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Plus,
  FlaskConical,
  Pencil,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  getLLMProviders,
  getLLMConfigs,
  createLLMConfig,
  updateLLMConfig,
  deleteLLMConfig,
  testLLMConfig,
  getTenants,
  getTenantLLMAssignments,
  assignLLMConfig,
  unassignLLMConfig,
  activateLLMAssignment,
  type LLMProviderInfo,
  type LLMConfigResponse,
  type TenantLLMAssignmentResponse,
  type TenantResponse,
} from '../services/api';

type ActionStatus = 'idle' | 'loading' | 'success' | 'error';

interface FormState {
  label: string;
  provider: string;
  apiKey: string;
  model: string;
  showKey: boolean;
  saveStatus: ActionStatus;
  saveError: string;
  testStatus: ActionStatus;
  testError: string;
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

/* ========== Component ========== */

export function SettingsPage() {
  const [providers, setProviders] = useState<Record<string, LLMProviderInfo>>({});
  const [configs, setConfigs] = useState<LLMConfigResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // LLM Setup form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  // Tenant Intelligence state
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [assignmentsMap, setAssignmentsMap] = useState<
    Record<string, TenantLLMAssignmentResponse[]>
  >({});

  const loadSharedData = useCallback(async () => {
    setLoading(true);
    try {
      const [providerData, configData] = await Promise.all([
        getLLMProviders(),
        getLLMConfigs(),
      ]);
      setProviders(providerData);
      setConfigs(configData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSharedData();
  }, [loadSharedData]);

  // Load tenants independently for Tab 2
  useEffect(() => {
    (async () => {
      setTenantsLoading(true);
      try {
        const data = await getTenants();
        setTenants(data);
      } catch {
        // ignore
      } finally {
        setTenantsLoading(false);
      }
    })();
  }, []);

  // Load assignments when a tenant row is expanded
  useEffect(() => {
    if (!expandedTenantId) return;
    if (assignmentsMap[expandedTenantId]) return; // already loaded
    (async () => {
      try {
        const assignments = await getTenantLLMAssignments(expandedTenantId);
        setAssignmentsMap((prev) => ({ ...prev, [expandedTenantId]: assignments }));
      } catch {
        setAssignmentsMap((prev) => ({ ...prev, [expandedTenantId]: [] }));
      }
    })();
  }, [expandedTenantId, assignmentsMap]);

  /* ---- Form helpers ---- */

  function defaultForm(): FormState {
    const providerKeys = Object.keys(providers);
    const firstProvider = providerKeys[0] ?? '';
    const models = providers[firstProvider]?.models ?? [];
    return {
      label: '',
      provider: firstProvider,
      apiKey: '',
      model: models[0]?.id ?? '',
      showKey: false,
      saveStatus: 'idle',
      saveError: '',
      testStatus: 'idle',
      testError: '',
    };
  }

  function openAdd() {
    setEditingId('new');
    setForm(defaultForm());
  }

  function openEdit(cfg: LLMConfigResponse) {
    setEditingId(cfg.id);
    setForm({
      label: cfg.label,
      provider: cfg.provider,
      apiKey: cfg.api_key,
      model: cfg.model,
      showKey: false,
      saveStatus: 'idle',
      saveError: '',
      testStatus: 'idle',
      testError: '',
    });
  }

  function closeForm() {
    setEditingId(null);
    setForm(null);
  }

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  /* ---- LLM Setup actions ---- */

  async function handleTest() {
    if (!form || !form.apiKey || !form.model) return;
    patchForm({ testStatus: 'loading', testError: '' });
    try {
      await testLLMConfig(form.provider, form.apiKey, form.model);
      patchForm({ testStatus: 'success' });
    } catch (err) {
      patchForm({
        testStatus: 'error',
        testError: err instanceof Error ? err.message : 'Test failed',
      });
    }
  }

  async function handleSave() {
    if (!form || !form.apiKey || !form.model || !form.label) return;
    patchForm({ saveStatus: 'loading', saveError: '' });
    try {
      if (editingId === 'new') {
        const created = await createLLMConfig(form.label, form.provider, form.apiKey, form.model);
        setConfigs((prev) => [...prev, created]);
      } else if (editingId) {
        const updated = await updateLLMConfig(editingId, {
          label: form.label,
          provider: form.provider,
          api_key: form.apiKey,
          model: form.model,
        });
        setConfigs((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      }
      closeForm();
    } catch (err) {
      patchForm({
        saveStatus: 'error',
        saveError: err instanceof Error ? err.message : 'Failed to save',
      });
    }
  }

  async function handleDelete(configId: string) {
    try {
      await deleteLLMConfig(configId);
    } catch {
      // ignore
    }
    setConfigs((prev) => prev.filter((c) => c.id !== configId));
    // Clean up assignments referencing this config
    setAssignmentsMap((prev) => {
      const next: Record<string, TenantLLMAssignmentResponse[]> = {};
      for (const [tid, assigns] of Object.entries(prev)) {
        next[tid] = assigns.filter((a) => a.llm_config_id !== configId);
      }
      return next;
    });
    if (editingId === configId) closeForm();
  }

  /* ---- Tenant Intelligence actions ---- */

  function toggleTenantRow(tenantId: string) {
    setExpandedTenantId((prev) => (prev === tenantId ? null : tenantId));
  }

  async function handleToggleAssign(tenantId: string, configId: string, isAssigned: boolean) {
    if (isAssigned) {
      try {
        await unassignLLMConfig(tenantId, configId);
        setAssignmentsMap((prev) => ({
          ...prev,
          [tenantId]: (prev[tenantId] ?? []).filter((a) => a.llm_config_id !== configId),
        }));
      } catch {
        // ignore
      }
    } else {
      try {
        const assignment = await assignLLMConfig(tenantId, configId);
        setAssignmentsMap((prev) => ({
          ...prev,
          [tenantId]: [
            ...(prev[tenantId] ?? []).filter((a) => a.llm_config_id !== configId),
            assignment,
          ],
        }));
      } catch {
        // ignore
      }
    }
  }

  async function handleActivate(tenantId: string, configId: string) {
    try {
      const updated = await activateLLMAssignment(tenantId, configId);
      setAssignmentsMap((prev) => ({
        ...prev,
        [tenantId]: (prev[tenantId] ?? []).map((a) =>
          a.llm_config_id === configId ? updated : { ...a, is_active: false },
        ),
      }));
    } catch {
      // ignore
    }
  }

  const displayStatus = (status: string) =>
    status.charAt(0).toUpperCase() + status.slice(1);

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading settings...
      </div>
    );
  }

  /* ---- Inline form card (used for both add and edit) ---- */
  function renderFormCard() {
    if (!form) return null;
    const providerInfo = providers[form.provider];
    const models = providerInfo?.models ?? [];
    const canSave = form.apiKey && form.model && form.label;

    return (
      <td colSpan={5} className="px-0 py-0">
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3 m-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">
              {editingId === 'new' ? 'New LLM Configuration' : 'Edit LLM Configuration'}
            </span>
            <button
              onClick={closeForm}
              className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Label */}
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Label</label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => patchForm({ label: e.target.value, saveStatus: 'idle' })}
              placeholder="e.g. Production Anthropic Key"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Provider</label>
            <select
              value={form.provider}
              onChange={(e) => {
                const newProvider = e.target.value;
                const newModels = providers[newProvider]?.models ?? [];
                patchForm({
                  provider: newProvider,
                  model: newModels[0]?.id ?? '',
                  saveStatus: 'idle',
                });
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {Object.entries(providers).map(([key, info]) => (
                <option key={key} value={key}>{info.name}</option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">API Key</label>
            <div className="relative">
              <input
                type={form.showKey ? 'text' : 'password'}
                value={form.apiKey}
                autoComplete="off"
                onChange={(e) =>
                  patchForm({ apiKey: e.target.value, saveStatus: 'idle', testStatus: 'idle' })
                }
                placeholder="Enter your API key"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 pr-10 text-sm"
              />
              <button
                type="button"
                onClick={() => patchForm({ showKey: !form.showKey })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {form.showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Model</label>
            <select
              value={form.model}
              onChange={(e) => patchForm({ model: e.target.value, saveStatus: 'idle' })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              onClick={handleTest}
              disabled={!form.apiKey || !form.model || form.testStatus === 'loading'}
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {form.testStatus === 'loading' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FlaskConical className="w-3.5 h-3.5" />
              )}
              Test
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || form.saveStatus === 'loading'}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {form.saveStatus === 'loading' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save
            </button>
            <button
              onClick={closeForm}
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              Cancel
            </button>

            {/* Status messages */}
            {form.testStatus === 'success' && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> Key valid
              </span>
            )}
            {form.testStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <XCircle className="w-3.5 h-3.5" /> {form.testError}
              </span>
            )}
            {form.saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <XCircle className="w-3.5 h-3.5" /> {form.saveError}
              </span>
            )}
          </div>
        </div>
      </td>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage LLM configurations and tenant intelligence assignments
        </p>
      </div>

      <Tabs defaultValue="llm-setup">
        <TabsList>
          <TabsTrigger value="llm-setup">LLM Setup</TabsTrigger>
          <TabsTrigger value="tenant-intelligence">Tenant Intelligence</TabsTrigger>
        </TabsList>

        {/* ===== Tab 1: LLM Setup ===== */}
        <TabsContent value="llm-setup">
          <div className="flex items-center justify-between mb-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Global LLM configurations shared across tenants.
            </p>
            {configs.length > 0 && editingId !== 'new' && (
              <button
                onClick={openAdd}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            )}
          </div>

          {configs.length === 0 && editingId !== 'new' ? (
            <div className="rounded-lg border border-dashed border-input p-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No LLM configurations yet.</p>
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          ) : (
            <div className="bg-white border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                      Label
                    </th>
                    <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                      Provider
                    </th>
                    <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                      Model
                    </th>
                    <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                      API Key
                    </th>
                    <th className="text-right px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {/* Add form row at top */}
                  {editingId === 'new' && (
                    <tr>{renderFormCard()}</tr>
                  )}

                  {configs.map((cfg) => {
                    const providerInfo = providers[cfg.provider];

                    if (editingId === cfg.id) {
                      return (
                        <tr key={cfg.id}>{renderFormCard()}</tr>
                      );
                    }

                    return (
                      <tr key={cfg.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium">{cfg.label}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {providerInfo?.name ?? cfg.provider}
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{cfg.model}</td>
                        <td className="px-6 py-4 text-sm font-mono text-muted-foreground">
                          {maskKey(cfg.api_key)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(cfg)}
                              className="p-2 hover:bg-gray-100 rounded transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => handleDelete(cfg.id)}
                              className="p-2 hover:bg-red-50 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ===== Tab 2: Tenant Intelligence ===== */}
        <TabsContent value="tenant-intelligence">
          <div className="mt-2 mb-4">
            <p className="text-sm text-muted-foreground">
              Assign LLM configurations to tenants and set defaults for the AI Resolution Assistant.
            </p>
          </div>

          {tenantsLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading tenants...
            </div>
          ) : (
            <div className="bg-white border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    <th className="w-10 px-4 py-3" />
                    <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                      Name
                    </th>
                    <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                      Tenant ID
                    </th>
                    <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                      Assigned LLMs
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tenants.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                        No tenants yet. Create a tenant first.
                      </td>
                    </tr>
                  ) : (
                    tenants.map((tenant) => {
                      const isExpanded = expandedTenantId === tenant.id;
                      const tenantAssignments = assignmentsMap[tenant.id] ?? [];
                      const assignedCount = tenantAssignments.length;
                      const assignedConfigIds = new Set(tenantAssignments.map((a) => a.llm_config_id));
                      const activeConfigId =
                        tenantAssignments.find((a) => a.is_active)?.llm_config_id ?? null;

                      return (
                        <Fragment key={tenant.id}>
                          <tr
                            className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                            onClick={() => toggleTenantRow(tenant.id)}
                          >
                            <td className="px-4 py-4 text-center">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm">{tenant.name}</td>
                            <td className="px-6 py-4 text-sm font-mono text-muted-foreground">
                              {tenant.id}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-xs ${
                                  tenant.status === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {displayStatus(tenant.status)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">
                              {assignedCount > 0 ? `${assignedCount} assigned` : '—'}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={5} className="px-0 py-0 bg-gray-50/50">
                                <div className="px-8 py-4 space-y-2">
                                  {configs.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-2">
                                      No LLM configs available. Add one in the LLM Setup tab first.
                                    </p>
                                  ) : (
                                    configs.map((cfg) => {
                                      const isAssigned = assignedConfigIds.has(cfg.id);
                                      const isActive = activeConfigId === cfg.id;
                                      const providerInfo = providers[cfg.provider];

                                      return (
                                        <div
                                          key={cfg.id}
                                          className={`flex items-center gap-4 rounded-lg border p-3 bg-white ${
                                            isAssigned ? 'border-input' : 'border-input/50'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isAssigned}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              handleToggleAssign(tenant.id, cfg.id, isAssigned);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="h-4 w-4 rounded border-input accent-primary shrink-0"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <span
                                              className={`text-sm ${isAssigned ? 'font-medium' : 'text-muted-foreground'}`}
                                            >
                                              {cfg.label}
                                            </span>
                                            <span className="text-xs text-muted-foreground ml-2">
                                              {providerInfo?.name ?? cfg.provider} / {cfg.model}
                                            </span>
                                          </div>
                                          {isAssigned && (
                                            <label
                                              className="flex items-center gap-1.5 shrink-0 cursor-pointer"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <input
                                                type="radio"
                                                name={`default-llm-${tenant.id}`}
                                                checked={isActive}
                                                onChange={() => handleActivate(tenant.id, cfg.id)}
                                                className="h-4 w-4 accent-primary"
                                              />
                                              <span className="text-xs text-muted-foreground">
                                                Default
                                              </span>
                                            </label>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-4">
            When no active assignment exists, the system falls back to the{' '}
            <code>CLAUDE_API_KEY</code> environment variable.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
