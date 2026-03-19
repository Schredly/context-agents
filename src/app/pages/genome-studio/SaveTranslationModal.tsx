import { useState } from "react";
import { X, Loader2, Sparkles, Save, Languages } from "lucide-react";

const VENDORS = ["ServiceNow", "Salesforce", "Jira", "Zendesk", "Workday", "GitHub"];
const PLATFORMS = ["replit", "github", "salesforce", "azure-devops", "freshdesk", "custom"];

interface SaveTranslationModalProps {
  sourceVendor: string;
  onGenerate: (vendor: string, target: string) => Promise<any>;
  onSave: (recipe: {
    name: string;
    description?: string;
    source_vendor?: string;
    source_type?: string;
    target_platform?: string;
    instructions: string;
    output_structure?: Record<string, any>;
  }) => Promise<any>;
  onClose: () => void;
  hasOutputFiles: boolean;
}

export function SaveTranslationModal({ sourceVendor, onGenerate, onSave, onClose, hasOutputFiles }: SaveTranslationModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState(sourceVendor || "");
  const [sourceType, setSourceType] = useState("");
  const [targetPlatform, setTargetPlatform] = useState("");
  const [instructions, setInstructions] = useState("");
  const [outputStructure, setOutputStructure] = useState("{}");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    const result = await onGenerate(vendor, targetPlatform);
    if (result?.status === "ok" || result?.instructions) {
      setInstructions(result.instructions || "");
      if (result.output_structure && Object.keys(result.output_structure).length > 0) {
        setOutputStructure(JSON.stringify(result.output_structure, null, 2));
      }
      if (result.suggested_description && !description) {
        setDescription(result.suggested_description);
      }
      setGenerated(true);
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    let parsedOutput = {};
    try { parsedOutput = JSON.parse(outputStructure); } catch { /* keep empty */ }

    await onSave({
      name: name.trim(),
      description,
      source_vendor: vendor,
      source_type: sourceType,
      target_platform: targetPlatform,
      instructions,
      output_structure: parsedOutput,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-[680px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2.5">
            <Languages className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">Save as Translation</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Meta fields */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ServiceNow Catalog → Replit App"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this translation produce?"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Source Vendor</label>
              <select value={vendor} onChange={(e) => setVendor(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white">
                <option value="">Select...</option>
                {VENDORS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Source Type</label>
              <input value={sourceType} onChange={(e) => setSourceType(e.target.value)}
                placeholder="e.g. service_catalog"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Target Platform</label>
              <select value={targetPlatform} onChange={(e) => setTargetPlatform(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white">
                <option value="">Select...</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Generate button */}
          {hasOutputFiles && (
            <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Auto-generate instructions</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Use AI to analyze your current transformation (source content, output files, and chat history) and generate reusable LLM instructions automatically.
                  </p>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
                  >
                    {generating ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing transformation...</>
                    ) : generated ? (
                      <><Sparkles className="w-3.5 h-3.5" /> Re-generate</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5" /> Generate Instructions</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Instructions <span className="text-gray-400 font-normal">(LLM prompt recipe)</span>
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={8}
              placeholder={hasOutputFiles
                ? 'Click "Generate Instructions" above to auto-create, or write manually...'
                : "Describe how the LLM should transform the genome content..."
              }
              className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-y"
            />
          </div>

          {/* Output Structure */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Output Structure <span className="text-gray-400 font-normal">(JSON — folders and files the recipe produces)</span>
            </label>
            <textarea
              value={outputStructure}
              onChange={(e) => setOutputStructure(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-y"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Translation
          </button>
        </div>
      </div>
    </div>
  );
}
