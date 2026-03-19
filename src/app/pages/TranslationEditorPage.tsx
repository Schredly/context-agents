import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useTenants } from "../context/TenantContext";

interface TranslationForm {
  name: string;
  description: string;
  source_vendor: string;
  source_type: string;
  target_platform: string;
  instructions: string;
  output_structure: string; // JSON string for editing
  status: "active" | "draft";
}

const EMPTY_FORM: TranslationForm = {
  name: "",
  description: "",
  source_vendor: "",
  source_type: "",
  target_platform: "",
  instructions: "",
  output_structure: "{}",
  status: "draft",
};

const VENDORS = ["ServiceNow", "Salesforce", "Jira", "Zendesk", "Workday", "GitHub"];
const PLATFORMS = ["replit", "github", "salesforce", "azure-devops", "freshdesk", "custom"];

export default function TranslationEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentTenantId } = useTenants();
  const isNew = !id || id === "create";

  const [form, setForm] = useState<TranslationForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (!isNew && currentTenantId && id) {
      setLoading(true);
      fetch(`/api/admin/${currentTenantId}/translations/${id}`)
        .then((r) => r.json())
        .then((data) => {
          setForm({
            name: data.name || "",
            description: data.description || "",
            source_vendor: data.source_vendor || "",
            source_type: data.source_type || "",
            target_platform: data.target_platform || "",
            instructions: data.instructions || "",
            output_structure: JSON.stringify(data.output_structure || {}, null, 2),
            status: data.status || "draft",
          });
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [id, currentTenantId, isNew]);

  const handleSave = async () => {
    if (!currentTenantId || !form.name) return;
    setSaving(true);

    let outputStructure = {};
    try {
      outputStructure = JSON.parse(form.output_structure);
    } catch { /* keep empty */ }

    const payload = {
      name: form.name,
      description: form.description,
      source_vendor: form.source_vendor,
      source_type: form.source_type,
      target_platform: form.target_platform,
      instructions: form.instructions,
      output_structure: outputStructure,
      status: form.status,
    };

    const url = isNew
      ? `/api/admin/${currentTenantId}/translations`
      : `/api/admin/${currentTenantId}/translations/${id}`;
    const method = isNew ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (res.ok) {
      navigate("/genomes/translations");
    }
  };

  const update = (field: keyof TranslationForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/genomes/translations")} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-4 h-4 text-gray-500" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {isNew ? "New Translation" : "Edit Translation"}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Define a reusable recipe for transforming genomes into target platform formats.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {/* Name + Description */}
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. ServiceNow Catalog → Replit App"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <input
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="What does this translation produce?"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              />
            </div>
          </div>

          {/* Source + Target */}
          <div className="p-5 grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Source Vendor</label>
              <select
                value={form.source_vendor}
                onChange={(e) => update("source_vendor", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
              >
                <option value="">Select...</option>
                {VENDORS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Source Type</label>
              <input
                value={form.source_type}
                onChange={(e) => update("source_type", e.target.value)}
                placeholder="e.g. service_catalog"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Target Platform</label>
              <select
                value={form.target_platform}
                onChange={(e) => update("target_platform", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
              >
                <option value="">Select...</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Instructions */}
          <div className="p-5">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Instructions <span className="text-gray-400 font-normal">(LLM prompt recipe)</span>
            </label>
            <textarea
              value={form.instructions}
              onChange={(e) => update("instructions", e.target.value)}
              rows={10}
              placeholder="Describe how the LLM should transform the genome content into the target format..."
              className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-y"
            />
          </div>

          {/* Output Structure */}
          <div className="p-5">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Output Structure <span className="text-gray-400 font-normal">(JSON)</span>
            </label>
            <textarea
              value={form.output_structure}
              onChange={(e) => update("output_structure", e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-y"
            />
          </div>

          {/* Status + Save */}
          <div className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value as "active" | "draft")}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !form.name}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isNew ? "Create Translation" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
