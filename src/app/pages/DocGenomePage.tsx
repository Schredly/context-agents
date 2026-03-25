import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  FileText,
  Plus,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Dna,
  Trash2,
  Layers,
  BookOpen,
} from "lucide-react";

const TENANT = "acme";

interface DocExtraction {
  id: string;
  doc_id: string;
  doc_filename: string;
  doc_size_mb: number;
  doc_type: string;
  application_name: string;
  vendor: string;
  product_area: string;
  module: string;
  status: string;
  page_count: number;
  word_count: number;
  total_tokens: number;
  total_cost: number;
  latency_ms: number;
  created_at: string;
  committed: boolean;
  genome?: any;
}

export default function DocGenomePage() {
  const navigate = useNavigate();
  const [extractions, setExtractions] = useState<DocExtraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchExtractions = () => {
    setLoading(true);
    fetch(`/api/doc-genome/extractions?tenant_id=${TENANT}`)
      .then((r) => r.json())
      .then((data) => {
        setExtractions(Array.isArray(data) ? data : []);
      })
      .catch(() => setExtractions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchExtractions();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this extraction?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/doc-genome/extractions/${id}`, { method: "DELETE" });
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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200">
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

  const docTypeLabel = (t: string) => {
    const map: Record<string, string> = { pdf: "PDF", docx: "DOCX", doc: "DOC", txt: "TXT", md: "Markdown" };
    return map[t] || t.toUpperCase();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Doc Genome</h1>
            <p className="text-sm text-gray-500">Extract application genomes from product documentation using AI analysis</p>
          </div>
        </div>
        <button
          onClick={() => navigate("/genomes/doc/capture")}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Capture Doc Genome
        </button>
      </div>

      {/* Extraction List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : extractions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <Dna className="w-8 h-8 text-indigo-300" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No Doc Genome Extractions Yet</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Upload product documentation (PDF, DOCX, TXT, MD) and our AI pipeline will extract
            the data model, workflows, relationships, and application structure.
          </p>
          <button
            onClick={() => navigate("/genomes/doc/capture")}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Capture Your First Doc Genome
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {extractions.map((ext) => (
            <div
              key={ext.id}
              onClick={() => navigate(`/genomes/doc/${ext.id}`)}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {ext.application_name || ext.doc_filename || "Untitled"}
                      </h3>
                      {statusBadge(ext.status, ext.committed)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                      {ext.vendor && <span className="font-medium text-gray-600">{ext.vendor}</span>}
                      {ext.product_area && <span className="text-gray-500">{ext.product_area}{ext.module ? ` / ${ext.module}` : ""}</span>}
                      <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-medium">{docTypeLabel(ext.doc_type)}</span>
                      <span>{ext.doc_size_mb?.toFixed(1)} MB</span>
                      <span>{new Date(ext.created_at).toLocaleDateString()} {new Date(ext.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div className="flex items-center gap-4 text-[10px] text-gray-400">
                      {ext.page_count > 0 && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" /> {ext.page_count} pages
                        </span>
                      )}
                      {ext.word_count > 0 && (
                        <span>{ext.word_count.toLocaleString()} words</span>
                      )}
                      {ext.genome?.genome_document && (
                        <>
                          <span>{ext.genome.genome_document.objects?.length || 0} objects</span>
                          <span>{ext.genome.genome_document.fields?.length || 0} fields</span>
                          <span>{ext.genome.genome_document.workflows?.length || 0} workflows</span>
                        </>
                      )}
                      {ext.latency_ms > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {(ext.latency_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(ext.id); }}
                    disabled={deleting === ext.id}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    {deleting === ext.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
