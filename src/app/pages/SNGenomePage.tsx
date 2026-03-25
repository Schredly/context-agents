import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  FileCode2,
  Plus,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Dna,
  Trash2,
  Database,
} from "lucide-react";

const TENANT = "acme";

interface SNExtraction {
  id: string;
  doc_ids: string[];
  doc_filenames: string[];
  total_size_mb: number;
  application_name: string;
  vendor: string;
  product_area: string;
  module: string;
  status: string;
  file_count: number;
  latency_ms: number;
  created_at: string;
  committed: boolean;
  genome?: any;
}

export default function SNGenomePage() {
  const navigate = useNavigate();
  const [extractions, setExtractions] = useState<SNExtraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sn-genome/extractions?tenant_id=${TENANT}`)
      .then((r) => r.json())
      .then((data) => setExtractions(Array.isArray(data) ? data : []))
      .catch(() => setExtractions([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this extraction?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/sn-genome/extractions/${id}`, { method: "DELETE" });
      setExtractions((prev) => prev.filter((e) => e.id !== id));
    } catch {}
    setDeleting(null);
  };

  const statusBadge = (status: string, committed: boolean) => {
    if (committed) return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
        <CheckCircle2 className="w-3 h-3" /> Committed
      </span>
    );
    switch (status) {
      case "completed": return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
          <CheckCircle2 className="w-3 h-3" /> Completed
        </span>
      );
      case "processing": return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Loader2 className="w-3 h-3 animate-spin" /> Processing
        </span>
      );
      case "error": return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
          <AlertCircle className="w-3 h-3" /> Error
        </span>
      );
      default: return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-600 border border-gray-200">
          <Clock className="w-3 h-3" /> {status}
        </span>
      );
    }
  };

  const countElements = (genome: any) => {
    if (!genome) return {};
    return {
      entities: genome.entities?.length || 0,
      catalog: genome.catalog?.items?.length || 0,
      workflows: genome.workflows?.length || 0,
      rules: genome.business_logic?.rules?.length || 0,
      tables: genome.data_model?.tables?.length || 0,
    };
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">SN Genome</h1>
            <p className="text-sm text-gray-500">Extract application genomes from ServiceNow update set XMLs</p>
          </div>
        </div>
        <button
          onClick={() => navigate("/genomes/sn/capture")}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-600 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Capture SN Genome
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : extractions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <Dna className="w-8 h-8 text-emerald-300" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No SN Genome Extractions Yet</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Upload one or more ServiceNow update set XML files and our AI pipeline will extract
            the application genome — entities, catalog items, workflows, business rules, and integrations.
          </p>
          <button
            onClick={() => navigate("/genomes/sn/capture")}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Capture Your First SN Genome
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {extractions.map((ext) => {
            const counts = countElements(ext.genome);
            return (
              <div
                key={ext.id}
                onClick={() => navigate(`/genomes/sn/${ext.id}`)}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:border-emerald-300 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <FileCode2 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {ext.application_name || ext.doc_filenames?.[0] || "Untitled"}
                        </h3>
                        {statusBadge(ext.status, ext.committed)}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                        <span className="font-medium text-gray-600">ServiceNow</span>
                        {ext.product_area && <span>{ext.product_area}{ext.module ? ` / ${ext.module}` : ""}</span>}
                        <span>{ext.file_count} XML file{ext.file_count !== 1 ? "s" : ""}</span>
                        <span>{new Date(ext.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-gray-400">
                        {counts.entities > 0 && <span>{counts.entities} entities</span>}
                        {counts.catalog > 0 && <span>{counts.catalog} catalog items</span>}
                        {counts.workflows > 0 && <span>{counts.workflows} workflows</span>}
                        {counts.rules > 0 && <span>{counts.rules} rules</span>}
                        {counts.tables > 0 && <span>{counts.tables} tables</span>}
                        {ext.latency_ms > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {(ext.latency_ms / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(ext.id); }}
                    disabled={deleting === ext.id}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-3"
                  >
                    {deleting === ext.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
