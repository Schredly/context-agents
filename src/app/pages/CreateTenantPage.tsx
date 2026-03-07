import { useState, useEffect } from "react";
import { X, Check, Loader2, Plus, Trash2, Plug, BookOpen } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import {
  getTenant,
  createTenant,
  getIntegrations,
  getIntegrationCatalog,
  createIntegration,
  deleteIntegration,
  getUseCases,
  deleteUseCase,
  type IntegrationResponse,
  type UseCaseResponse,
} from "../services/api";

const steps = [
  { id: 1, name: "Tenant Details" },
  { id: 2, name: "Integrations" },
  { id: 3, name: "Use Cases" },
  { id: 4, name: "Summary" },
];

export default function CreateTenantPage() {
  const { id: tenantIdParam } = useParams<{ id: string }>();
  const isEditMode = !!tenantIdParam;

  const [currentStep, setCurrentStep] = useState(isEditMode ? 1 : 1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    tenantId: "",
    status: "Draft",
  });

  // Step 2: Integrations
  const [integrations, setIntegrations] = useState<IntegrationResponse[]>([]);
  const [integrationCatalog, setIntegrationCatalog] = useState<
    Record<string, { label: string; config_fields: string[] }>
  >({});
  const [integrationsLoading, setIntegrationsLoading] = useState(false);

  // Step 3: Use Cases
  const [useCases, setUseCases] = useState<UseCaseResponse[]>([]);
  const [useCasesLoading, setUseCasesLoading] = useState(false);

  const navigate = useNavigate();

  // Load existing tenant data in edit mode
  useEffect(() => {
    if (!tenantIdParam) return;
    setLoading(true);
    getTenant(tenantIdParam)
      .then((t) => {
        setFormData({
          name: t.name,
          tenantId: t.id,
          status: t.status.charAt(0).toUpperCase() + t.status.slice(1),
        });
      })
      .catch(() => {
        /* tenant not found — stay in create mode */
      })
      .finally(() => setLoading(false));
  }, [tenantIdParam]);

  // Load integrations when entering step 2
  useEffect(() => {
    const tid = tenantIdParam || formData.tenantId;
    if (currentStep !== 2 || !tid) return;
    setIntegrationsLoading(true);
    Promise.all([getIntegrations(tid), getIntegrationCatalog(tid)])
      .then(([ints, catalog]) => {
        setIntegrations(ints);
        setIntegrationCatalog(catalog);
      })
      .catch(() => {})
      .finally(() => setIntegrationsLoading(false));
  }, [currentStep, tenantIdParam, formData.tenantId]);

  // Load use cases when entering step 3
  useEffect(() => {
    const tid = tenantIdParam || formData.tenantId;
    if (currentStep !== 3 || !tid) return;
    setUseCasesLoading(true);
    getUseCases(tid)
      .then(setUseCases)
      .catch(() => {})
      .finally(() => setUseCasesLoading(false));
  }, [currentStep, tenantIdParam, formData.tenantId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleStep1Continue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditMode) {
      // Create the tenant first so integrations / use-cases can attach to it
      try {
        setLoading(true);
        const created = await createTenant(formData.name);
        setFormData((prev) => ({ ...prev, tenantId: created.id }));
      } catch {
        // tenant might already exist — continue anyway
      } finally {
        setLoading(false);
      }
    }
    setCurrentStep(2);
  };

  const activeTenantId = tenantIdParam || formData.tenantId;

  const handleAddIntegration = async (integrationType: string) => {
    if (!activeTenantId) return;
    try {
      const created = await createIntegration(activeTenantId, integrationType);
      setIntegrations((prev) => [...prev, created]);
    } catch {}
  };

  const handleDeleteIntegration = async (integrationId: string) => {
    if (!activeTenantId) return;
    try {
      await deleteIntegration(activeTenantId, integrationId);
      setIntegrations((prev) => prev.filter((i) => i.id !== integrationId));
    } catch {}
  };

  const handleDeleteUseCase = async (useCaseId: string) => {
    if (!activeTenantId) return;
    try {
      await deleteUseCase(activeTenantId, useCaseId);
      setUseCases((prev) => prev.filter((uc) => uc.id !== useCaseId));
    } catch {}
  };

  if (loading && isEditMode && !formData.name) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading tenant...
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            {isEditMode ? `Configure Tenant — ${formData.name}` : "Create New Tenant"}
          </h1>
          <button
            onClick={() => navigate("/tenants")}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div
                  className="flex items-center cursor-pointer"
                  onClick={() => {
                    // In edit mode, allow clicking any step
                    if (isEditMode) setCurrentStep(step.id);
                  }}
                >
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                      currentStep > step.id
                        ? "bg-green-500 border-green-500 text-white"
                        : currentStep === step.id
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 text-gray-400"
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-sm">{step.id}</span>
                    )}
                  </div>
                  <span
                    className={`ml-2 text-sm ${
                      currentStep >= step.id
                        ? "text-gray-900 font-medium"
                        : "text-gray-400"
                    }`}
                  >
                    {step.name}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-4 ${
                      currentStep > step.id ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          {/* Step 1: Tenant Details */}
          {currentStep === 1 && (
            <form onSubmit={handleStep1Continue} className="space-y-6">
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Tenant Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter tenant name"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  required
                  readOnly={isEditMode}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Tenant ID
                </label>
                <input
                  type="text"
                  name="tenantId"
                  value={formData.tenantId}
                  onChange={handleChange}
                  placeholder="e.g., acme-corp"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono text-sm"
                  required
                  readOnly={isEditMode}
                />
                {isEditMode && (
                  <p className="text-xs text-gray-400 mt-1">Tenant ID cannot be changed</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => navigate("/tenants")}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Continue"}
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Integrations */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Manage integrations for this tenant.
                </p>
              </div>

              {integrationsLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Loading integrations...
                </div>
              ) : (
                <>
                  {/* Existing integrations */}
                  {integrations.length > 0 && (
                    <div className="space-y-2">
                      {integrations.map((intg) => (
                        <div
                          key={intg.id}
                          className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Plug className="w-4 h-4 text-gray-500" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {integrationCatalog[intg.integration_type]?.label || intg.integration_type}
                              </p>
                              <p className="text-xs text-gray-500">
                                {intg.enabled ? "Enabled" : "Disabled"} &middot; {intg.connection_status}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate(`/integrations/${intg.id}`)}
                              className="px-2 py-1 text-xs text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                            >
                              Configure
                            </button>
                            <button
                              onClick={() => handleDeleteIntegration(intg.id)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add integration buttons from catalog */}
                  {Object.keys(integrationCatalog).length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 mt-4">
                        Available Integrations
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(integrationCatalog)
                          .filter(
                            ([type]) =>
                              !integrations.some(
                                (i) => i.integration_type === type
                              )
                          )
                          .map(([type, entry]) => (
                            <button
                              key={type}
                              onClick={() => handleAddIntegration(type)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              {entry.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {integrations.length === 0 &&
                    Object.keys(integrationCatalog).length === 0 && (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        No integration catalog available.
                      </div>
                    )}
                </>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Use Cases */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Manage use cases for this tenant.
                </p>
                <button
                  onClick={() => navigate("/use-cases/create")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Use Case
                </button>
              </div>

              {useCasesLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Loading use cases...
                </div>
              ) : (
                <>
                  {useCases.length > 0 ? (
                    <div className="space-y-2">
                      {useCases.map((uc) => (
                        <div
                          key={uc.id}
                          className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <BookOpen className="w-4 h-4 text-gray-500" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {uc.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {uc.description.length > 80
                                  ? uc.description.slice(0, 80) + "..."
                                  : uc.description}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span
                                  className={`inline-flex px-1.5 py-0.5 rounded text-[10px] ${
                                    uc.status === "active"
                                      ? "bg-green-100 text-green-800"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {uc.status}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  {uc.steps.length} step{uc.steps.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate(`/use-cases/${uc.id}`)}
                              className="px-2 py-1 text-xs text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteUseCase(uc.id)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No use cases configured yet.
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(4)}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Summary */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-green-900 mb-2">
                  {isEditMode ? "Tenant Configured" : "Ready to Activate"}
                </h3>
                <p className="text-sm text-green-700">
                  {isEditMode ? (
                    <>
                      Tenant <strong>{formData.name}</strong> ({formData.tenantId}) is configured
                      with {integrations.length} integration{integrations.length !== 1 ? "s" : ""} and{" "}
                      {useCases.length} use case{useCases.length !== 1 ? "s" : ""}.
                    </>
                  ) : (
                    <>
                      Your tenant <strong>{formData.name}</strong> is ready to be activated.
                    </>
                  )}
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => navigate("/tenants")}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {isEditMode ? "Done" : "Create Tenant"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
