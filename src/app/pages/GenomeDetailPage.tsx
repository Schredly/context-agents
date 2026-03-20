import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  Download,
  Trash2,
  Server,
  Cloud,
  Ticket,
  Headset,
  Briefcase,
  ArrowRight,
  TrendingDown,
  Package,
  Workflow as WorkflowIcon,
  Grid3x3,
  Share2,
  ChevronDown,
  ChevronUp,
  Hammer,
  Zap,
  Loader2,
  Copy,
  FileJson,
  Check,
} from "lucide-react";
import {
  getGenome,
  getGenomeGraph,
  type GenomeResponse,
  type GenomeGraphResponse,
} from "../services/api";

const vendorIcons: Record<string, typeof Server> = {
  ServiceNow: Server,
  Salesforce: Cloud,
  Jira: Ticket,
  Zendesk: Headset,
  Workday: Briefcase,
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export default function GenomeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showRawGenome, setShowRawGenome] = useState(false);
  const [showArtifact, setShowArtifact] = useState(false);
  const [artifactCopied, setArtifactCopied] = useState(false);
  const [genome, setGenome] = useState<GenomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<GenomeGraphResponse | null>(null);
  const [showGraph, setShowGraph] = useState(true);
  const [expandedObject, setExpandedObject] = useState<string | null>(null);
  // Editable cost fields
  const [editingCost, setEditingCost] = useState<string | null>(null);
  const [costValue, setCostValue] = useState("");
  const [savingCost, setSavingCost] = useState(false);

  const saveCost = async (field: string, value: number | string) => {
    if (!genome) return;
    setSavingCost(true);
    try {
      const res = await fetch(`/api/admin/acme/genomes/${genome.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const updated = await res.json();
        setGenome(updated);
      }
    } catch {}
    setSavingCost(false);
    setEditingCost(null);
  };

  useEffect(() => {
    if (!id) return;
    getGenome("acme", id)
      .then(setGenome)
      .catch(() => setGenome(null))
      .finally(() => setLoading(false));
    getGenomeGraph("acme", id)
      .then((res) => setGraph(res.graph))
      .catch(() => setGraph(null));
  }, [id]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto text-center py-20">
          <Loader2 className="w-6 h-6 text-gray-400 mx-auto mb-2 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading genome…</p>
        </div>
      </div>
    );
  }

  if (!genome) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Genome not found
          </h2>
          <button
            onClick={() => navigate("/genomes")}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Back to Genomes
          </button>
        </div>
      </div>
    );
  }

  const doc = genome.genome_document;
  const VendorIcon = vendorIcons[genome.vendor] || Package;

  const savingsPercentage = genome.legacy_cost > 0
    ? (((genome.legacy_cost - genome.migrated_cost) / genome.legacy_cost) * 100).toFixed(1)
    : "0.0";

  // Parse relationships into from/to pairs
  const parsedRelationships = doc.relationships.map((r) => {
    const parts = r.split(" → ");
    return { from: parts[0] || r, to: parts[1] || "" };
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate("/genomes")}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Genomes
        </button>

        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                <VendorIcon className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Application Genome
                </p>
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                  {genome.application_name}
                </h1>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">
                    {genome.source_platform}
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                  <span className="font-mono bg-blue-50 px-2 py-1 rounded text-blue-700">
                    {genome.target_platform}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
                <Download className="w-4 h-4" />
                Export Genome
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium">
                <Hammer className="w-4 h-4" />
                Rebuild Application
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete genome "${genome.application_name}"? This cannot be undone.`)) return;
                  try {
                    const res = await fetch(`/api/admin/acme/genomes/${genome.id}`, { method: "DELETE" });
                    if (res.ok || res.status === 204) navigate("/genomes");
                  } catch {}
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium">
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Section 1 - Application Overview */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Application Overview
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                Vendor
              </p>
              <div className="flex items-center gap-2">
                <VendorIcon className="w-5 h-5 text-teal-600" />
                <p className="text-sm font-medium text-gray-900">
                  {genome.vendor}
                </p>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                Application Name
              </p>
              <p className="text-sm font-medium text-gray-900">
                {genome.application_name}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 cursor-pointer hover:border-gray-300 transition-colors"
              onClick={() => { setEditingCost("category"); setCostValue(genome.category || ""); }}>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                Category
              </p>
              {editingCost === "category" ? (
                <input autoFocus type="text" value={costValue}
                  onChange={(e) => setCostValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCost("category", costValue); if (e.key === "Escape") setEditingCost(null); }}
                  onBlur={() => saveCost("category", costValue)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full text-sm font-medium text-gray-900 bg-gray-50 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-900" />
              ) : (
                <p className="text-sm font-medium text-gray-900">
                  {genome.category || <span className="text-gray-400 italic">Click to set</span>}
                </p>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                Source Platform
              </p>
              <p className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-700 inline-block">
                {genome.source_platform}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 cursor-pointer hover:border-gray-300 transition-colors"
              onClick={() => { setEditingCost("target_platform"); setCostValue(genome.target_platform || ""); }}>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                Target Platform
              </p>
              {editingCost === "target_platform" ? (
                <input autoFocus type="text" value={costValue}
                  onChange={(e) => setCostValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCost("target_platform", costValue); if (e.key === "Escape") setEditingCost(null); }}
                  onBlur={() => saveCost("target_platform", costValue)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full text-xs font-mono text-blue-700 bg-gray-50 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-900" />
              ) : (
                <p className="text-xs font-mono bg-blue-50 px-2 py-1 rounded text-blue-700 inline-block">
                  {genome.target_platform || <span className="text-gray-400 italic font-sans">Click to set</span>}
                </p>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                Captured Date
              </p>
              <p className="text-sm font-medium text-gray-900">
                {formatDate(genome.captured_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Section 2 - Cost Profile */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Cost Profile
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {/* Legacy Cost */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 cursor-pointer hover:border-gray-300 transition-colors"
              onClick={() => { setEditingCost("legacy_cost"); setCostValue(String(genome.legacy_cost)); }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Package className="w-4 h-4 text-gray-600" />
                </div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Legacy Cost
                </p>
              </div>
              {editingCost === "legacy_cost" ? (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold text-gray-400">$</span>
                  <input autoFocus type="number" value={costValue}
                    onChange={(e) => setCostValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveCost("legacy_cost", parseFloat(costValue) || 0); if (e.key === "Escape") setEditingCost(null); }}
                    onBlur={() => saveCost("legacy_cost", parseFloat(costValue) || 0)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-2xl font-semibold text-gray-900 font-mono bg-gray-50 border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              ) : (
                <p className="text-2xl font-semibold text-gray-900 font-mono">
                  {formatCurrency(genome.legacy_cost)}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">{editingCost === "legacy_cost" ? "Press Enter to save" : "Annual — click to edit"}</p>
            </div>

            {/* Migrated Cost */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 cursor-pointer hover:border-gray-300 transition-colors"
              onClick={() => { setEditingCost("migrated_cost"); setCostValue(String(genome.migrated_cost)); }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Migrated Cost
                </p>
              </div>
              {editingCost === "migrated_cost" ? (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold text-emerald-400">$</span>
                  <input autoFocus type="number" value={costValue}
                    onChange={(e) => setCostValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveCost("migrated_cost", parseFloat(costValue) || 0); if (e.key === "Escape") setEditingCost(null); }}
                    onBlur={() => saveCost("migrated_cost", parseFloat(costValue) || 0)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-2xl font-semibold text-emerald-600 font-mono bg-gray-50 border border-emerald-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              ) : (
                <p className="text-2xl font-semibold text-emerald-600 font-mono">
                  {formatCurrency(genome.migrated_cost)}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                {editingCost === "migrated_cost" ? (
                  <span className="text-xs text-gray-500">Press Enter to save</span>
                ) : (
                  <>
                    <span className="text-xs text-emerald-600 font-medium">
                      ↓ {savingsPercentage}% savings
                    </span>
                    <span className="text-xs text-gray-500">
                      ({formatCurrency(genome.legacy_cost - genome.migrated_cost)}/year)
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Operational Cost */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 cursor-pointer hover:border-gray-300 transition-colors"
              onClick={() => { setEditingCost("operational_cost"); setCostValue(String(genome.operational_cost)); }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Operational Cost
                </p>
              </div>
              {editingCost === "operational_cost" ? (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold text-blue-400">$</span>
                  <input autoFocus type="number" value={costValue}
                    onChange={(e) => setCostValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveCost("operational_cost", parseFloat(costValue) || 0); if (e.key === "Escape") setEditingCost(null); }}
                    onBlur={() => saveCost("operational_cost", parseFloat(costValue) || 0)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-2xl font-semibold text-blue-600 font-mono bg-gray-50 border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ) : (
                <p className="text-2xl font-semibold text-blue-600 font-mono">
                  {formatCurrency(genome.operational_cost)}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">{editingCost === "operational_cost" ? "Press Enter to save" : "Annual — click to edit"}</p>
            </div>
          </div>
        </div>

        {/* Section 3 - Structural Genome */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Structural Genome
          </h2>
          <div className="grid grid-cols-4 gap-4">
            {/* Objects */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
                <Package className="w-4 h-4 text-slate-600" />
                <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Objects ({doc.objects.length})
                </h3>
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {doc.objects.map((obj, idx) => (
                  <div
                    key={idx}
                    className="text-xs p-2 bg-slate-50 rounded hover:bg-slate-100 transition-colors font-mono text-slate-700"
                  >
                    {obj}
                  </div>
                ))}
              </div>
            </div>

            {/* Workflows */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
                <WorkflowIcon className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Workflows ({doc.workflows.length})
                </h3>
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {doc.workflows.map((wf, idx) => (
                  <div
                    key={idx}
                    className="text-xs p-2 bg-purple-50 rounded hover:bg-purple-100 transition-colors font-mono text-purple-900"
                  >
                    {wf}
                  </div>
                ))}
              </div>
            </div>

            {/* Fields */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
                <Grid3x3 className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Fields ({doc.fields.length})
                </h3>
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {doc.fields.map((field, idx) => (
                  <div
                    key={idx}
                    className="text-xs p-2 bg-blue-50 rounded hover:bg-blue-100 transition-colors font-mono text-blue-900"
                  >
                    {field}
                  </div>
                ))}
              </div>
            </div>

            {/* Relationships */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
                <Share2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Relationships ({doc.relationships.length})
                </h3>
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {parsedRelationships.map((rel, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-emerald-50 rounded hover:bg-emerald-100 transition-colors"
                  >
                    <div className="flex items-center gap-1 text-xs text-emerald-900">
                      <span className="font-mono truncate">{rel.from}</span>
                      <ArrowRight className="w-3 h-3 flex-shrink-0 text-emerald-600" />
                      <span className="font-mono truncate">{rel.to}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 4 - Genome Graph (structured view) */}
        {graph && (
          <div className="mb-6">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowGraph(!showGraph)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    Genome Graph
                  </h2>
                  <span className="text-xs font-mono bg-indigo-50 px-2 py-0.5 rounded text-indigo-600">
                    {graph.objects.length} objects &middot; {graph.relationships.length} relationships &middot; {graph.workflows.length} workflows
                  </span>
                </div>
                {showGraph ? (
                  <ChevronUp className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                )}
              </button>
              {showGraph && (
                <div className="border-t border-gray-200 p-4 space-y-4">
                  {/* Objects with fields */}
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                      Objects &amp; Fields
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {graph.objects.map((obj) => {
                        const isExpanded = expandedObject === obj.id;
                        const objRels = graph.relationships.filter(
                          (r) => obj.relationships.includes(r.id)
                        );
                        return (
                          <div
                            key={obj.id}
                            className={`border rounded-lg transition-all ${
                              obj.type === "virtual"
                                ? "border-amber-200 bg-amber-50/50"
                                : "border-gray-200 bg-white"
                            }`}
                          >
                            <button
                              onClick={() =>
                                setExpandedObject(isExpanded ? null : obj.id)
                              }
                              className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 transition-colors rounded-t-lg"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Package className={`w-3.5 h-3.5 flex-shrink-0 ${
                                  obj.type === "virtual" ? "text-amber-500" : "text-indigo-500"
                                }`} />
                                <span className="text-sm font-medium text-gray-900 truncate">
                                  {obj.name}
                                </span>
                                <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
                                  {obj.type}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                                {obj.fields.length > 0 && (
                                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                    {obj.fields.length}f
                                  </span>
                                )}
                                {obj.workflows.length > 0 && (
                                  <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                                    {obj.workflows.length}w
                                  </span>
                                )}
                                {obj.relationships.length > 0 && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                    {obj.relationships.length}r
                                  </span>
                                )}
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                )}
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="border-t border-gray-100 p-3 space-y-3">
                                {obj.fields.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                                      Fields
                                    </p>
                                    <div className="space-y-1">
                                      {obj.fields.map((f) => (
                                        <div
                                          key={f.id}
                                          className="flex items-center gap-2 text-xs"
                                        >
                                          <Grid3x3 className="w-3 h-3 text-blue-400 flex-shrink-0" />
                                          <span className="font-mono text-gray-700">
                                            {f.name}
                                          </span>
                                          {f.type && (
                                            <span className="text-[10px] text-gray-400">
                                              {f.type}
                                            </span>
                                          )}
                                          {f.required && (
                                            <span className="text-[10px] text-red-500 font-medium">
                                              req
                                            </span>
                                          )}
                                          {f.reference && (
                                            <span className="text-[10px] text-indigo-500">
                                              &rarr; {f.reference}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {obj.workflows.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                                      Workflows
                                    </p>
                                    <div className="space-y-1">
                                      {obj.workflows.map((wfId) => {
                                        const wf = graph.workflows.find(
                                          (w) => w.id === wfId
                                        );
                                        return (
                                          <div
                                            key={wfId}
                                            className="flex items-center gap-2 text-xs"
                                          >
                                            <WorkflowIcon className="w-3 h-3 text-purple-400 flex-shrink-0" />
                                            <span className="font-mono text-gray-700">
                                              {wf ? wf.name : wfId}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {objRels.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                                      Relationships
                                    </p>
                                    <div className="space-y-1">
                                      {objRels.map((r) => (
                                        <div
                                          key={r.id}
                                          className="flex items-center gap-1.5 text-xs"
                                        >
                                          <Share2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                          <span className="font-mono text-gray-600">
                                            {r.source_object}
                                          </span>
                                          <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                          <span className="font-mono text-gray-600">
                                            {r.target_object}
                                          </span>
                                          <span className="text-[10px] text-gray-400">
                                            {r.cardinality}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Relationship summary */}
                  {graph.relationships.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                        All Relationships
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {graph.relationships.map((rel) => (
                          <div
                            key={rel.id}
                            className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg text-xs"
                          >
                            <span className="font-mono text-emerald-900 truncate">
                              {rel.source_object}
                            </span>
                            <ArrowRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                            <span className="font-mono text-emerald-900 truncate">
                              {rel.target_object}
                            </span>
                            <span className="text-[10px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded flex-shrink-0">
                              {rel.cardinality}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Workflow list */}
                  {graph.workflows.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                        All Workflows
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {graph.workflows.map((wf) => (
                          <div
                            key={wf.id}
                            className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg text-xs"
                          >
                            <WorkflowIcon className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                            <span className="font-mono text-purple-900 truncate">
                              {wf.name}
                            </span>
                            {wf.trigger && (
                              <span className="text-[10px] text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                {wf.trigger}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section 5 - Genome Artifact */}
        {genome.artifact && (
          <div className="mb-6">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowArtifact(!showArtifact)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileJson className="w-5 h-5 text-teal-600" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    Genome Artifact
                  </h2>
                  <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">
                    v{genome.artifact.version}
                  </span>
                </div>
                {showArtifact ? (
                  <ChevronUp className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                )}
              </button>
              {showArtifact && (
                <div className="border-t border-gray-200">
                  <div className="flex items-center justify-end gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          JSON.stringify(genome.artifact!.artifact_json, null, 2)
                        );
                        setArtifactCopied(true);
                        setTimeout(() => setArtifactCopied(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      {artifactCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {artifactCopied ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob(
                          [JSON.stringify(genome.artifact!.artifact_json, null, 2)],
                          { type: "application/json" }
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${genome.application_name.toLowerCase().replace(/\s+/g, "-")}-artifact-v${genome.artifact!.version}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download JSON
                    </button>
                  </div>
                  <div className="p-4 bg-gray-900 max-h-[600px] overflow-auto">
                    <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap">
                      {JSON.stringify(genome.artifact.artifact_json, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section 5 - Raw Genome Artifact */}
        <div className="mb-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowRawGenome(!showRawGenome)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <h2 className="text-lg font-semibold text-gray-900">
                Raw Genome Artifact
              </h2>
              {showRawGenome ? (
                <ChevronUp className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              )}
            </button>
            {showRawGenome && (
              <div className="border-t border-gray-200 p-4 bg-gray-900">
                <pre className="text-xs font-mono text-emerald-400 overflow-x-auto">
                  {JSON.stringify(genome, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
