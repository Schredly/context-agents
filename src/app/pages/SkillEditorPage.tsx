import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTenants } from "../context/TenantContext";
import * as api from "../services/api";

const INTEGRATION_LABELS: Record<string, string> = {
  servicenow: "ServiceNow",
  "google-drive": "Google Drive",
  salesforce: "Salesforce",
  slack: "Slack",
  github: "GitHub",
  jira: "Jira",
};

export default function SkillEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentTenantId } = useTenants();
  const isCreate = !id;

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [toolsCatalog, setToolsCatalog] = useState<api.ToolsResponse | null>(
    null,
  );
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    model: "",
    selectedTools: [] as string[],
    instructions: "",
  });

  // Fetch tools catalog + existing skill (edit mode)
  const fetchData = useCallback(async () => {
    if (!currentTenantId) return;
    try {
      const catalog = await api.getToolsCatalog(currentTenantId);
      setToolsCatalog(catalog);

      if (id) {
        setLoading(true);
        const skill = await api.getSkill(currentTenantId, id);
        setFormData({
          name: skill.name,
          description: skill.description,
          model: skill.model,
          selectedTools: skill.tools,
          instructions: skill.instructions,
        });
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

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const toggleTool = (toolId: string) => {
    setFormData({
      ...formData,
      selectedTools: formData.selectedTools.includes(toolId)
        ? formData.selectedTools.filter((t) => t !== toolId)
        : [...formData.selectedTools, toolId],
    });
  };

  const handleSave = async () => {
    if (!currentTenantId || !formData.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        model: formData.model,
        instructions: formData.instructions,
        tools: formData.selectedTools,
      };

      if (isCreate) {
        await api.createSkill(currentTenantId, payload);
        toast.success("Skill created");
      } else {
        await api.updateSkill(currentTenantId, id!, payload);
        toast.success("Skill saved");
      }
      navigate("/skills");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  // Group tools by integration_type
  const toolGroups = toolsCatalog
    ? Object.entries(toolsCatalog.by_integration)
    : [];

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
          onClick={() => navigate("/skills")}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Skills
        </button>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            {isCreate ? "Create Skill" : "Edit Skill"}
          </h1>
          <p className="text-sm text-gray-600">
            Configure AI capabilities and tool usage.
          </p>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column - Configuration */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                Skill Configuration
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Skill Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g., Knowledge Search"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Brief description of this skill"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Model
                  </label>
                  <select
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <option value="">Select a model...</option>
                    <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gemini-pro">Gemini Pro</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                Allowed Tools
              </h2>
              <p className="text-xs text-gray-600 mb-4">
                Select which tools this skill can use
              </p>

              <div className="space-y-4 max-h-96 overflow-y-auto">
                {toolGroups.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No tools available. Add and enable integrations first.
                  </p>
                ) : (
                  toolGroups.map(([intType, tools]) => (
                    <div key={intType}>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        {INTEGRATION_LABELS[intType] ?? intType}
                      </div>
                      <div className="space-y-1">
                        {tools.map((tool) => (
                          <label
                            key={tool.tool_id}
                            className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData.selectedTools.includes(
                                tool.tool_id,
                              )}
                              onChange={() => toggleTool(tool.tool_id)}
                              className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                            />
                            <div>
                              <span className="text-sm font-mono text-gray-700">
                                {tool.tool_id}
                              </span>
                              <p className="text-xs text-gray-400">
                                {tool.description}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right column - Prompt editor */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 h-fit lg:sticky lg:top-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              Instructions
            </h2>
            <p className="text-xs text-gray-600 mb-4">
              Define how the agent should use tools to solve the task
            </p>

            <textarea
              name="instructions"
              value={formData.instructions}
              onChange={handleChange}
              placeholder="Enter detailed instructions for this skill..."
              rows={20}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono text-sm resize-none"
            />

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => navigate("/skills")}
                className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name.trim()}
                className="flex-1 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Skill
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
