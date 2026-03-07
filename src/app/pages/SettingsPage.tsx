import { useEffect, useState, useCallback } from 'react';
import {
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Plus,
  X,
  Zap,
  DollarSign,
  TrendingUp,
  Shield,
  Star,
  RotateCcw,
  Settings as SettingsIcon,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
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
  inputTokenCost: string;
  outputTokenCost: string;
  saveStatus: ActionStatus;
  saveError: string;
  testStatus: ActionStatus;
  testError: string;
}

/* Default per-model token pricing ($ per 1k tokens) — used as initial values for new configs */
const DEFAULT_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-haiku-3-20250414': { input: 0.00025, output: 0.00125 },
  'o3': { input: 0.010, output: 0.040 },
  'o3-mini': { input: 0.001, output: 0.004 },
  'o3-pro': { input: 0.020, output: 0.080 },
  'o4-mini': { input: 0.001, output: 0.004 },
  'gpt-5': { input: 0.010, output: 0.030 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};

function getDefaultPricing(model: string) {
  return DEFAULT_MODEL_PRICING[model] ?? { input: 0, output: 0 };
}

function formatTokenCost(cfg: LLMConfigResponse): string {
  const cost = cfg.input_token_cost;
  if (cost === 0 && cfg.output_token_cost === 0) return '—';
  return `$${cost} / 1k tokens`;
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

  // Slide-out panel state
  const [selectedConfig, setSelectedConfig] = useState<LLMConfigResponse | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Tenant Model Access state
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [assignmentsMap, setAssignmentsMap] = useState<
    Record<string, TenantLLMAssignmentResponse[]>
  >({});

  // Assignment panel state (popover on cell click)
  const [assignPanel, setAssignPanel] = useState<{
    tenantId: string;
    configId: string;
    rect: { top: number; left: number; width: number };
  } | null>(null);

  // Fallback model per tenant (client-side only — no backend field yet)
  const [fallbackMap, setFallbackMap] = useState<Record<string, string>>({});

  // Runtime Defaults state (local — no backend endpoint yet)
  const [runtimeDefaults, setRuntimeDefaults] = useState({
    maxTokensPerRun: 8000,
    costGuardrailPerRun: 0.5,
    costGuardrailDaily: 500,
  });

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

  // Load tenants + all assignments upfront for the matrix view
  useEffect(() => {
    (async () => {
      setTenantsLoading(true);
      try {
        const data = await getTenants();
        setTenants(data);
        // Load assignments for all tenants in parallel
        const entries = await Promise.all(
          data.map(async (t) => {
            try {
              const a = await getTenantLLMAssignments(t.id);
              return [t.id, a] as const;
            } catch {
              return [t.id, []] as const;
            }
          }),
        );
        setAssignmentsMap(Object.fromEntries(entries));
      } catch {
        // ignore
      } finally {
        setTenantsLoading(false);
      }
    })();
  }, []);

  /* ---- Form helpers ---- */

  function defaultForm(): FormState {
    const providerKeys = Object.keys(providers);
    const firstProvider = providerKeys[0] ?? '';
    const models = providers[firstProvider]?.models ?? [];
    const firstModel = models[0]?.id ?? '';
    const pricing = getDefaultPricing(firstModel);
    return {
      label: '',
      provider: firstProvider,
      apiKey: '',
      model: firstModel,
      showKey: false,
      inputTokenCost: String(pricing.input),
      outputTokenCost: String(pricing.output),
      saveStatus: 'idle',
      saveError: '',
      testStatus: 'idle',
      testError: '',
    };
  }

  function openAdd() {
    setSelectedConfig(null);
    setIsAddMode(true);
    setForm(defaultForm());
    setShowApiKey(false);
  }

  function openEdit(cfg: LLMConfigResponse) {
    setSelectedConfig(cfg);
    setIsAddMode(false);
    setForm({
      label: cfg.label,
      provider: cfg.provider,
      apiKey: cfg.api_key,
      model: cfg.model,
      showKey: false,
      inputTokenCost: String(cfg.input_token_cost),
      outputTokenCost: String(cfg.output_token_cost),
      saveStatus: 'idle',
      saveError: '',
      testStatus: 'idle',
      testError: '',
    });
    setShowApiKey(false);
  }

  function closePanel() {
    setSelectedConfig(null);
    setIsAddMode(false);
    setForm(null);
  }

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  /* ---- LLM Provider actions ---- */

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
    if (!form || !form.apiKey || !form.model) return;
    patchForm({ saveStatus: 'loading', saveError: '' });
    try {
      const inputCost = parseFloat(form.inputTokenCost) || 0;
      const outputCost = parseFloat(form.outputTokenCost) || 0;
      const label = form.label.trim() || `${providers[form.provider]?.name ?? form.provider} — ${providers[form.provider]?.models.find((m) => m.id === form.model)?.name ?? form.model}`;
      if (isAddMode) {
        const created = await createLLMConfig(
          label, form.provider, form.apiKey, form.model, inputCost, outputCost,
        );
        setConfigs((prev) => [...prev, created]);
      } else if (selectedConfig) {
        const updated = await updateLLMConfig(selectedConfig.id, {
          label,
          provider: form.provider,
          api_key: form.apiKey,
          model: form.model,
          input_token_cost: inputCost,
          output_token_cost: outputCost,
        });
        setConfigs((prev) => prev.map((c) => (c.id === selectedConfig.id ? updated : c)));
      }
      closePanel();
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
    setAssignmentsMap((prev) => {
      const next: Record<string, TenantLLMAssignmentResponse[]> = {};
      for (const [tid, assigns] of Object.entries(prev)) {
        next[tid] = assigns.filter((a) => a.llm_config_id !== configId);
      }
      return next;
    });
    if (selectedConfig?.id === configId) closePanel();
  }

  /* ---- Tenant Model Access actions ---- */

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

  /* ---- Status helpers ---- */

  function getStatusBadge(cfg: LLMConfigResponse) {
    const hasKey = cfg.api_key && cfg.api_key.length > 4;
    if (hasKey) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-medium">
          <CheckCircle className="w-3.5 h-3.5" />
          Connected
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
        <AlertCircle className="w-3.5 h-3.5" />
        No Key
      </span>
    );
  }

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading settings...
      </div>
    );
  }

  const panelOpen = isAddMode || selectedConfig !== null;

  return (
    <div className="p-8 min-h-screen">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Settings</h1>
          <p className="text-sm text-gray-600">
            AI Infrastructure — Manage LLM providers, tenant assignments, and runtime policies.
          </p>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Main Content — Left Side */}
          <div className="col-span-8 space-y-6">
            {/* ===== Section 1: LLM Providers ===== */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">LLM Providers</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Configured models and connection status
                  </p>
                </div>
                <button
                  onClick={openAdd}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Provider
                </button>
              </div>

              {configs.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-500">No LLM configurations yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Provider
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Model
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Connection Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Token Cost
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {configs.map((cfg) => {
                        const providerInfo = providers[cfg.provider];
                        return (
                          <tr key={cfg.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-sm font-medium text-gray-900">
                                {providerInfo?.name ?? cfg.provider}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-gray-700">
                                {cfg.model}
                              </code>
                            </td>
                            <td className="px-6 py-4">{getStatusBadge(cfg)}</td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-gray-600 font-mono">
                                {formatTokenCost(cfg)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => openEdit(cfg)}
                                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                                >
                                  Configure
                                </button>
                                <button
                                  onClick={() => handleDelete(cfg.id)}
                                  className="p-1.5 hover:bg-red-50 rounded transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
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
            </div>

            {/* ===== Section 2: Tenant Model Access ===== */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-base font-semibold text-gray-900">Tenant Model Access</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Click a cell to configure model access per tenant
                </p>
              </div>

              {tenantsLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading tenants...
                </div>
              ) : tenants.length === 0 || configs.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-gray-500">
                  {tenants.length === 0
                    ? 'No tenants yet. Create a tenant first.'
                    : 'No LLM configs available. Add a provider above first.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-10">
                          Tenant
                        </th>
                        {configs.map((cfg) => {
                          const pInfo = providers[cfg.provider];
                          return (
                            <th
                              key={cfg.id}
                              className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider min-w-[130px]"
                            >
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-xs font-semibold text-gray-700 normal-case">
                                  {pInfo?.models.find((m) => m.id === cfg.model)?.name ?? cfg.model}
                                </span>
                                <span className="text-[10px] text-gray-400 normal-case font-normal">
                                  {pInfo?.name ?? cfg.provider}
                                </span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {tenants.map((tenant) => {
                        const tenantAssignments = assignmentsMap[tenant.id] ?? [];
                        const assignedConfigIds = new Set(
                          tenantAssignments.map((a) => a.llm_config_id),
                        );

                        return (
                          <tr key={tenant.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 sticky left-0 bg-white z-10">
                              <span className="text-sm font-medium text-gray-900">
                                {tenant.name}
                              </span>
                            </td>
                            {configs.map((cfg) => {
                              const isAssigned = assignedConfigIds.has(cfg.id);
                              const isActive = tenantAssignments.some(
                                (a) => a.llm_config_id === cfg.id && a.is_active,
                              );
                              const isFallback = fallbackMap[tenant.id] === cfg.id;
                              const isSelected =
                                assignPanel?.tenantId === tenant.id &&
                                assignPanel?.configId === cfg.id;

                              return (
                                <td key={cfg.id} className="px-4 py-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      setAssignPanel(
                                        isSelected
                                          ? null
                                          : {
                                              tenantId: tenant.id,
                                              configId: cfg.id,
                                              rect: {
                                                top: rect.bottom + 4,
                                                left: rect.left + rect.width / 2 - 140,
                                                width: 280,
                                              },
                                            },
                                      );
                                    }}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                                      isAssigned
                                        ? isActive
                                          ? 'bg-teal-50 text-teal-700 border-teal-300'
                                          : isFallback
                                            ? 'bg-amber-50 text-amber-700 border-amber-300'
                                            : 'bg-teal-50 text-teal-600 border-teal-200'
                                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                                    } ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                                  >
                                    {isAssigned ? (
                                      <>
                                        {isActive && (
                                          <Star className="w-3 h-3 fill-current" />
                                        )}
                                        {isFallback && !isActive && (
                                          <RotateCcw className="w-3 h-3" />
                                        )}
                                        Enabled
                                      </>
                                    ) : (
                                      'Disabled'
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {tenants.length > 0 && configs.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-200">
                  <p className="text-xs text-gray-500">
                    <Star className="w-3 h-3 inline text-teal-600 fill-teal-600 mr-1 -mt-0.5" />
                    Default &nbsp;
                    <RotateCcw className="w-3 h-3 inline text-amber-600 mr-1 -mt-0.5" />
                    Fallback &nbsp;·&nbsp; When no model is assigned, the system falls back to the{' '}
                    <code className="bg-slate-100 px-1 rounded text-[11px]">CLAUDE_API_KEY</code>{' '}
                    environment variable.
                  </p>
                </div>
              )}
            </div>

            {/* Assignment panel popover */}
            {assignPanel && (() => {
              const { tenantId, configId, rect } = assignPanel;
              const tenant = tenants.find((t) => t.id === tenantId);
              const cfg = configs.find((c) => c.id === configId);
              if (!tenant || !cfg) return null;

              const tenantAssignments = assignmentsMap[tenantId] ?? [];
              const isAssigned = tenantAssignments.some((a) => a.llm_config_id === configId);
              const isActive = tenantAssignments.some(
                (a) => a.llm_config_id === configId && a.is_active,
              );
              const currentFallback = fallbackMap[tenantId] ?? '';
              const pInfo = providers[cfg.provider];
              const modelName = pInfo?.models.find((m) => m.id === cfg.model)?.name ?? cfg.model;

              // Other enabled models for this tenant (for fallback selector)
              const otherEnabled = configs.filter(
                (c) => c.id !== configId && tenantAssignments.some((a) => a.llm_config_id === c.id),
              );

              return (
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setAssignPanel(null)} />
                  <div
                    className="fixed z-50 bg-white rounded-xl border border-slate-200 shadow-xl"
                    style={{ top: rect.top, left: rect.left, width: rect.width }}
                  >
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-500">Tenant: <span className="font-medium text-gray-700">{tenant.name}</span></p>
                          <p className="text-xs text-gray-500">Model: <span className="font-medium text-gray-700">{modelName}</span></p>
                        </div>
                        <button
                          onClick={() => setAssignPanel(null)}
                          className="p-1 hover:bg-slate-100 rounded-md transition-colors"
                        >
                          <X className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Enabled toggle */}
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-gray-700 font-medium">Enabled</label>
                        <button
                          onClick={async () => {
                            await handleToggleAssign(tenantId, configId, isAssigned);
                            if (isAssigned) {
                              // If disabling, clear fallback if it points to this config
                              if (fallbackMap[tenantId] === configId) {
                                setFallbackMap((prev) => {
                                  const next = { ...prev };
                                  delete next[tenantId];
                                  return next;
                                });
                              }
                            }
                          }}
                          className={`relative w-10 h-[22px] rounded-full transition-colors ${
                            isAssigned ? 'bg-teal-500' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              isAssigned ? 'left-[22px]' : 'left-[3px]'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Default model toggle — only if enabled */}
                      {isAssigned && (
                        <div className="flex items-center justify-between">
                          <label className="text-sm text-gray-700 font-medium">Default Model</label>
                          <button
                            onClick={() => {
                              if (!isActive) {
                                handleActivate(tenantId, configId);
                              }
                            }}
                            className={`relative w-10 h-[22px] rounded-full transition-colors ${
                              isActive ? 'bg-teal-500' : 'bg-slate-300'
                            } ${isActive ? 'cursor-default' : 'cursor-pointer'}`}
                          >
                            <span
                              className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                isActive ? 'left-[22px]' : 'left-[3px]'
                              }`}
                            />
                          </button>
                        </div>
                      )}

                      {/* Fallback model selector — only if enabled */}
                      {isAssigned && (
                        <div>
                          <label className="block text-sm text-gray-700 font-medium mb-1.5">
                            Fallback Model
                          </label>
                          <select
                            value={currentFallback}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFallbackMap((prev) =>
                                val ? { ...prev, [tenantId]: val } : (() => {
                                  const next = { ...prev };
                                  delete next[tenantId];
                                  return next;
                                })(),
                              );
                            }}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          >
                            <option value="">None</option>
                            {otherEnabled.map((c) => {
                              const pi = providers[c.provider];
                              const mn = pi?.models.find((m) => m.id === c.model)?.name ?? c.model;
                              return (
                                <option key={c.id} value={c.id}>
                                  {mn}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* ===== Section 3: Runtime Defaults ===== */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-base font-semibold text-gray-900">Runtime Defaults</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Global routing and safety configurations
                </p>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  {/* Max Tokens Per Run */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <Shield className="w-4 h-4 text-emerald-600" />
                      Max Tokens Per Run
                    </label>
                    <input
                      type="number"
                      value={runtimeDefaults.maxTokensPerRun}
                      onChange={(e) =>
                        setRuntimeDefaults((prev) => ({
                          ...prev,
                          maxTokensPerRun: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
                    />
                  </div>

                  {/* Cost Guardrail Per Run */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <DollarSign className="w-4 h-4 text-amber-600" />
                      Cost Guardrail (Per Run)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={runtimeDefaults.costGuardrailPerRun}
                        onChange={(e) =>
                          setRuntimeDefaults((prev) => ({
                            ...prev,
                            costGuardrailPerRun: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <Shield className="w-4 h-4 text-rose-600" />
                    Daily Cost Guardrail
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      step="1"
                      value={runtimeDefaults.costGuardrailDaily}
                      onChange={(e) =>
                        setRuntimeDefaults((prev) => ({
                          ...prev,
                          costGuardrailDaily: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end">
                  <button className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium shadow-sm">
                    <SettingsIcon className="w-4 h-4" />
                    Save Configuration
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side — Cost Snapshot */}
          <div className="col-span-4">
            <div className="bg-gradient-to-br from-blue-600 via-cyan-600 to-teal-600 rounded-xl border border-blue-300 shadow-lg text-white overflow-hidden sticky top-8">
              <div className="px-6 py-4 border-b border-blue-400/30">
                <h2 className="text-base font-semibold">LLM Cost Snapshot</h2>
                <p className="text-xs text-blue-100 mt-0.5">Real-time spending overview</p>
              </div>

              <div className="p-6 space-y-6">
                {/* Today's Cost */}
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase tracking-wide">
                      Today&apos;s Cost
                    </span>
                  </div>
                  <p className="text-3xl font-bold">$47.32</p>
                  <p className="text-xs text-blue-100 mt-1">+12.3% vs yesterday</p>
                </div>

                {/* Monthly Cost */}
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase tracking-wide">
                      Monthly Cost (MTD)
                    </span>
                  </div>
                  <p className="text-3xl font-bold">$1,284.56</p>
                  <p className="text-xs text-blue-100 mt-1">
                    <span className="font-mono">$2,500.00</span> budget
                  </p>
                  <div className="mt-3 bg-white/20 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-white h-full rounded-full transition-all"
                      style={{ width: '51.4%' }}
                    />
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                    <p className="text-xs uppercase tracking-wide mb-1">Providers</p>
                    <p className="text-xl font-bold">{configs.length}</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                    <p className="text-xs uppercase tracking-wide mb-1">Tenants</p>
                    <p className="text-xl font-bold">{tenants.length}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Provider Configuration Slide-out Panel ===== */}
      {panelOpen && form && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={closePanel}
          />

          {/* Panel */}
          <div className="fixed right-0 top-0 bottom-0 w-[500px] bg-white shadow-2xl z-50 overflow-y-auto border-l border-slate-200">
            <div className="sticky top-0 bg-gray-900 text-white px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-semibold">
                  {isAddMode ? 'Add Provider' : 'Configure Provider'}
                </h2>
                {selectedConfig && (
                  <p className="text-sm opacity-80 font-mono">
                    {providers[selectedConfig.provider]?.name ?? selectedConfig.provider} •{' '}
                    {selectedConfig.model}
                  </p>
                )}
              </div>
              <button
                onClick={closePanel}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Connection Status (edit mode only) */}
              {!isAddMode && selectedConfig && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Connection Status
                  </label>
                  <div
                    className={`p-4 rounded-lg border-2 flex items-center gap-3 ${
                      selectedConfig.api_key.length > 4
                        ? 'bg-teal-50 border-teal-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}
                  >
                    {selectedConfig.api_key.length > 4 ? (
                      <CheckCircle className="w-4 h-4 text-teal-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {selectedConfig.api_key.length > 4
                          ? 'API Key Configured'
                          : 'Missing API Key'}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {selectedConfig.api_key.length > 4
                          ? 'Provider is ready to use'
                          : 'Enter a valid API key to connect'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Label */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Label</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => patchForm({ label: e.target.value, saveStatus: 'idle' })}
                  placeholder="e.g. Production Anthropic Key"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              {/* Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => {
                    const newProvider = e.target.value;
                    const newModels = providers[newProvider]?.models ?? [];
                    const newModel = newModels[0]?.id ?? '';
                    const pricing = getDefaultPricing(newModel);
                    patchForm({
                      provider: newProvider,
                      model: newModel,
                      inputTokenCost: String(pricing.input),
                      outputTokenCost: String(pricing.output),
                      saveStatus: 'idle',
                    });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  {Object.entries(providers).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={form.apiKey}
                    autoComplete="off"
                    onChange={(e) =>
                      patchForm({ apiKey: e.target.value, saveStatus: 'idle', testStatus: 'idle' })
                    }
                    placeholder="Enter your API key"
                    className="w-full px-3 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
                <select
                  value={form.model}
                  onChange={(e) => {
                    const newModel = e.target.value;
                    const pricing = getDefaultPricing(newModel);
                    patchForm({
                      model: newModel,
                      inputTokenCost: String(pricing.input),
                      outputTokenCost: String(pricing.output),
                      saveStatus: 'idle',
                    });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  {(providers[form.provider]?.models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Token Pricing */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Token Pricing
                  <span className="font-normal text-gray-400 ml-1">$ per 1k tokens</span>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Input Tokens</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={form.inputTokenCost}
                        onChange={(e) => patchForm({ inputTokenCost: e.target.value })}
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Output Tokens</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={form.outputTokenCost}
                        onChange={(e) => patchForm({ outputTokenCost: e.target.value })}
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Test Connection */}
              <div>
                <button
                  onClick={handleTest}
                  disabled={!form.apiKey || !form.model || form.testStatus === 'loading'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-gray-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200"
                >
                  {form.testStatus === 'loading' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Testing Connection...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Test Connection
                    </>
                  )}
                </button>
                {form.testStatus === 'success' && (
                  <p className="flex items-center gap-1.5 text-xs text-teal-600 mt-2">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connection successful — key is valid
                  </p>
                )}
                {form.testStatus === 'error' && (
                  <p className="flex items-center gap-1.5 text-xs text-red-600 mt-2">
                    <XCircle className="w-3.5 h-3.5" /> {form.testError}
                  </p>
                )}
              </div>

              {/* Tenant default toggle (edit mode only) */}
              {!isAddMode && selectedConfig && tenants.length > 0 && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" />
                    Set as Tenant Default
                  </h3>
                  <div className="space-y-2">
                    {tenants.map((tenant) => {
                      const tenantAssignments = assignmentsMap[tenant.id] ?? [];
                      const isAssigned = tenantAssignments.some(
                        (a) => a.llm_config_id === selectedConfig.id,
                      );
                      const isActive = tenantAssignments.some(
                        (a) => a.llm_config_id === selectedConfig.id && a.is_active,
                      );

                      if (!isAssigned) return null;

                      return (
                        <label
                          key={tenant.id}
                          className="flex items-center gap-3 p-2 rounded hover:bg-white cursor-pointer"
                        >
                          <input
                            type="radio"
                            name="tenant-default"
                            checked={isActive}
                            onChange={() => handleActivate(tenant.id, selectedConfig.id)}
                            className="h-4 w-4 accent-gray-900"
                          />
                          <span className="text-sm text-gray-700">{tenant.name}</span>
                          {isActive && (
                            <span className="text-xs text-teal-600 font-medium ml-auto">
                              Active
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Save / Error status */}
              {form.saveStatus === 'error' && (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <XCircle className="w-3.5 h-3.5" /> {form.saveError}
                </p>
              )}

              {/* Validation hint */}
              {!form.apiKey && form.saveStatus !== 'loading' && (
                <p className="text-xs text-amber-600">
                  API Key is required.
                </p>
              )}

              {/* Save Button */}
              <div className="pt-4 border-t border-slate-200 flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={
                    !form.apiKey || !form.model || form.saveStatus === 'loading'
                  }
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {form.saveStatus === 'loading' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {isAddMode ? 'Add Provider' : 'Save Configuration'}
                </button>
                <button
                  onClick={closePanel}
                  className="px-4 py-3 bg-slate-100 text-gray-700 rounded-lg hover:bg-slate-200 transition-colors text-sm border border-slate-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
