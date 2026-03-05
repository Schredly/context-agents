import { useParams, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, Settings2, Loader2, Play, Trash2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTenants } from "../context/TenantContext";
import * as api from "../services/api";

interface WorkflowStep {
  id: string;
  skillId: string;
  name: string;
  inputMapping: string;
  outputMapping: string;
}

export default function UseCaseBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentTenantId } = useTenants();
  const isCreate = !id;

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [skills, setSkills] = useState<api.SkillResponse[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "active">("draft");
  const [triggers, setTriggers] = useState("");
  const [workflow, setWorkflow] = useState<WorkflowStep[]>([]);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentTenantId) return;
    try {
      const tenantSkills = await api.getSkills(currentTenantId);
      setSkills(tenantSkills);

      if (id) {
        setLoading(true);
        const uc = await api.getUseCase(currentTenantId, id);
        setName(uc.name);
        setDescription(uc.description);
        setStatus(uc.status);
        setTriggers(uc.triggers.join(", "));
        setWorkflow(
          uc.steps.map((s, i) => ({
            id: String(i + 1),
            skillId: s.skill_id,
            name: s.name || tenantSkills.find((sk) => sk.id === s.skill_id)?.name || s.skill_id,
            inputMapping: s.input_mapping,
            outputMapping: s.output_mapping,
          })),
        );
      }
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addStep = () => {
    if (skills.length === 0) {
      toast.error("Create skills first before adding steps");
      return;
    }
    const firstSkill = skills[0];
    setWorkflow([
      ...workflow,
      {
        id: String(Date.now()),
        skillId: firstSkill.id,
        name: firstSkill.name,
        inputMapping: "",
        outputMapping: "",
      },
    ]);
  };

  const removeStep = (stepId: string) => {
    setWorkflow(workflow.filter((s) => s.id !== stepId));
    if (selectedStep === stepId) setSelectedStep(null);
  };

  const updateStepSkill = (stepId: string, skillId: string) => {
    const skill = skills.find((s) => s.id === skillId);
    setWorkflow(
      workflow.map((s) =>
        s.id === stepId
          ? { ...s, skillId, name: skill?.name || skillId }
          : s,
      ),
    );
  };

  const updateStepMapping = (
    stepId: string,
    field: "inputMapping" | "outputMapping",
    value: string,
  ) => {
    setWorkflow(
      workflow.map((s) => (s.id === stepId ? { ...s, [field]: value } : s)),
    );
  };

  const handleSave = async () => {
    if (!currentTenantId || !name.trim()) return;
    setSaving(true);
    try {
      const steps: api.UseCaseStepResponse[] = workflow.map((s, i) => ({
        step_id: String(i + 1),
        skill_id: s.skillId,
        name: s.name,
        input_mapping: s.inputMapping,
        output_mapping: s.outputMapping,
      }));
      const triggerList = triggers
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        name: name.trim(),
        description: description.trim(),
        status,
        triggers: triggerList,
        steps,
      };

      if (isCreate) {
        await api.createUseCase(currentTenantId, payload);
        toast.success("Use case created");
      } else {
        await api.updateUseCase(currentTenantId, id!, payload);
        toast.success("Use case saved");
      }
      navigate("/use-cases");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save use case",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    if (!currentTenantId || !id) return;
    setRunning(true);
    try {
      const result = await api.runUseCase(currentTenantId, id);
      toast.success(`Execution plan created: ${result.run_id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to run use case",
      );
    } finally {
      setRunning(false);
    }
  };

  const selectedStepData = workflow.find((s) => s.id === selectedStep);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate("/use-cases")}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Use Cases
        </button>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            {isCreate ? "Create Use Case" : "Edit Use Case"}
          </h1>
          <p className="text-sm text-gray-600">
            Build a workflow by connecting skills together.
          </p>
        </div>

        {/* Name / Description / Status / Triggers bar */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., IT Incident Resolution"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "draft" | "active")
                }
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Triggers
              </label>
              <input
                type="text"
                value={triggers}
                onChange={(e) => setTriggers(e.target.value)}
                placeholder="Comma-separated triggers"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workflow Builder - Main area */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
              <h2 className="text-sm font-semibold text-gray-900 mb-6">
                Workflow Steps
              </h2>

              {/* Horizontal workflow */}
              <div className="flex items-center gap-4 overflow-x-auto pb-4">
                {workflow.map((step, index) => (
                  <div key={step.id} className="flex items-center gap-4">
                    <button
                      onClick={() => setSelectedStep(step.id)}
                      className={`flex-shrink-0 w-48 p-4 rounded-lg border-2 transition-all relative group ${
                        selectedStep === step.id
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStep(step.id);
                        }}
                        className="absolute top-1 right-1 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div className="text-xs text-gray-500 mb-1">
                        Step {index + 1}
                      </div>
                      <div className="text-sm font-medium text-gray-900">
                        {step.name}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400 truncate">
                          {step.skillId}
                        </span>
                        <Settings2 className="w-3 h-3 text-gray-400" />
                      </div>
                    </button>

                    {index < workflow.length - 1 && (
                      <ArrowRight className="flex-shrink-0 w-5 h-5 text-gray-400" />
                    )}
                  </div>
                ))}

                {/* Add step button */}
                <button
                  onClick={addStep}
                  className="flex-shrink-0 w-48 h-24 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center justify-center text-sm text-gray-500"
                >
                  + Add Step
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => navigate("/use-cases")}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Use Case
                </button>
                {!isCreate && (
                  <button
                    onClick={handleRun}
                    disabled={running || workflow.length === 0}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {running ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Run
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Step configuration panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sticky top-8">
              {selectedStepData ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-900 mb-4">
                    Step Configuration
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Select Skill
                      </label>
                      <select
                        value={selectedStepData.skillId}
                        onChange={(e) =>
                          updateStepSkill(selectedStepData.id, e.target.value)
                        }
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
                      >
                        {skills.length === 0 ? (
                          <option value="">No skills available</option>
                        ) : (
                          skills.map((skill) => (
                            <option key={skill.id} value={skill.id}>
                              {skill.name}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Input Mapping
                      </label>
                      <textarea
                        value={selectedStepData.inputMapping}
                        onChange={(e) =>
                          updateStepMapping(
                            selectedStepData.id,
                            "inputMapping",
                            e.target.value,
                          )
                        }
                        placeholder="Map inputs from previous steps..."
                        rows={4}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-mono resize-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Use JSON format to map data
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Output Mapping
                      </label>
                      <textarea
                        value={selectedStepData.outputMapping}
                        onChange={(e) =>
                          updateStepMapping(
                            selectedStepData.id,
                            "outputMapping",
                            e.target.value,
                          )
                        }
                        placeholder="Define outputs for next steps..."
                        rows={4}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-mono resize-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Specify which outputs to pass forward
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <Settings2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">
                    Select a step to configure
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
