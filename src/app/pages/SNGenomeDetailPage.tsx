import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import {
  FileCode2,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Database,
  FileText,
  FolderTree,
  GitBranch,
  Save,
  Code,
  Workflow,
  Layers,
} from "lucide-react";

const TENANT = "acme";

interface Integration {
  id: string;
  integration_type: string;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
}

interface GenomeFile {
  path: string;
  content: string;
}

export default function SNGenomeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [extraction, setExtraction] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [genomeFiles, setGenomeFiles] = useState<GenomeFile[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [selectedGithub, setSelectedGithub] = useState<Integration | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/sn-genome/extractions/${id}`)
      .then((r) => { if (!r.ok) throw new Error(`Not found (${r.status})`); return r.json(); })
      .then((data) => {
        setExtraction(data);
        if (data.genome) {
          const files = buildGenomeFiles(data.genome, data.genome_yaml || "", data);
          setGenomeFiles(files);
        }
        if (data.commit_result?.status === "ok") setCommitResult(data.commit_result);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (selectedGithub || integrations.length > 0) return;
    setLoadingIntegrations(true);
    fetch(`/api/admin/${TENANT}/integrations/?filter_tenant=all`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setIntegrations(list.filter((i: Integration) => i.integration_type === "github"));
      })
      .catch(() => {})
      .finally(() => setLoadingIntegrations(false));
  }, []);

  const handleCommit = async () => {
    if (!extraction?.genome || !selectedGithub) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const genome = extraction.genome;
      const appName = extraction.application_name || genome.application?.name || "app";
      const res = await fetch("/api/sn-genome/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraction_id: extraction.id,
          genome,
          genome_yaml: extraction.genome_yaml || "",
          application_name: appName,
          product_area: extraction.product_area,
          module: extraction.module,
        }),
      });
      const data = await res.json();
      if (data.status === "error") throw new Error(data.error || "Commit failed");
      setCommitResult(data);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "Commit failed");
    }
    setCommitting(false);
  };

  const buildGenomeFiles = (genome: any, yamlContent: string, ext: any): GenomeFile[] => {
    const appName = genome.application?.name || "sn_app";
    const slug = appName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const paSlug = ext.product_area ? ext.product_area.toLowerCase().replace(/\s+/g, "_") : "";
    const modSlug = ext.module ? ext.module.toLowerCase().replace(/\s+/g, "_") : "";
    const pathParts = ["genomes/tenants/acme/vendors/servicenow"];
    if (paSlug) pathParts.push(paSlug);
    pathParts.push(modSlug || slug);
    const base = pathParts.join("/");
    const files: GenomeFile[] = [];

    files.push({ path: `${base}/genome.yaml`, content: yamlContent || JSON.stringify(genome, null, 2) });
    if (genome.entities?.length) files.push({ path: `${base}/structure/entities.json`, content: JSON.stringify(genome.entities, null, 2) });
    if (genome.catalog?.items?.length) files.push({ path: `${base}/structure/catalog.json`, content: JSON.stringify(genome.catalog, null, 2) });
    if (genome.workflows?.length) files.push({ path: `${base}/structure/workflows.json`, content: JSON.stringify(genome.workflows, null, 2) });
    if (genome.business_logic?.rules?.length) files.push({ path: `${base}/structure/business_logic.json`, content: JSON.stringify(genome.business_logic, null, 2) });
    if (genome.data_model?.tables?.length) files.push({ path: `${base}/structure/data_model.json`, content: JSON.stringify(genome.data_model, null, 2) });
    if (genome.ui) files.push({ path: `${base}/structure/ui.json`, content: JSON.stringify(genome.ui, null, 2) });
    if (genome.integrations?.length) files.push({ path: `${base}/structure/integrations.json`, content: JSON.stringify(genome.integrations, null, 2) });
    if (genome.logic_patterns?.length) files.push({ path: `${base}/structure/logic_patterns.json`, content: JSON.stringify(genome.logic_patterns, null, 2) });
    if (genome.processes?.length) files.push({ path: `${base}/structure/processes.json`, content: JSON.stringify(genome.processes, null, 2) });
    if (genome.events?.length) files.push({ path: `${base}/structure/events.json`, content: JSON.stringify(genome.events, null, 2) });
    if (genome.portable_genome) files.push({ path: `${base}/portable/portable_genome.json`, content: JSON.stringify(genome.portable_genome, null, 2) });
    if (genome.validation) files.push({ path: `${base}/validation/report.json`, content: JSON.stringify(genome.validation, null, 2) });
    return files;
  };

  const selectedFile = genomeFiles[selectedFileIdx] || null;
  const genome = extraction?.genome;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  if (error || !extraction) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <button onClick={() => navigate("/genomes/sn")} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to SN Genomes
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-700">{error || "Extraction not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/genomes/sn")}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <Database className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {extraction.application_name || genome?.application?.name || "SN Genome"}
          </h1>
          <p className="text-sm text-gray-500">
            ServiceNow · {extraction.file_count} XML file{extraction.file_count !== 1 ? "s" : ""} · {extraction.total_size_mb?.toFixed(1)} MB
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1"><Layers className="w-3.5 h-3.5 text-emerald-500" /><span className="text-[10px] text-gray-500 uppercase">Entities</span></div>
          <p className="text-xl font-semibold text-gray-900">{genome?.entities?.length || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1"><FileText className="w-3.5 h-3.5 text-blue-500" /><span className="text-[10px] text-gray-500 uppercase">Catalog</span></div>
          <p className="text-xl font-semibold text-gray-900">{genome?.catalog?.items?.length || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1"><Workflow className="w-3.5 h-3.5 text-purple-500" /><span className="text-[10px] text-gray-500 uppercase">Workflows</span></div>
          <p className="text-xl font-semibold text-gray-900">{genome?.workflows?.length || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1"><Code className="w-3.5 h-3.5 text-orange-500" /><span className="text-[10px] text-gray-500 uppercase">Rules</span></div>
          <p className="text-xl font-semibold text-gray-900">{genome?.business_logic?.rules?.length || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1"><Database className="w-3.5 h-3.5 text-teal-500" /><span className="text-[10px] text-gray-500 uppercase">Tables</span></div>
          <p className="text-xl font-semibold text-gray-900">{genome?.data_model?.tables?.length || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1"><Clock className="w-3.5 h-3.5 text-gray-500" /><span className="text-[10px] text-gray-500 uppercase">Latency</span></div>
          <p className="text-xl font-semibold text-gray-900">{extraction.latency_ms > 0 ? `${(extraction.latency_ms / 1000).toFixed(1)}s` : "\u2014"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: File list + commit */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {genomeFiles.map((f, i) => (
              <button key={i} onClick={() => setSelectedFileIdx(i)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs border-b border-gray-100 last:border-0 transition-colors ${
                  selectedFileIdx === i ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-50"
                }`}>
                <FileText className="w-3 h-3 flex-shrink-0" />
                <span className="truncate font-mono">{f.path.split("/").pop()}</span>
              </button>
            ))}
          </div>

          {/* GitHub Commit */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5" /> GitHub Commit
            </h3>
            {commitResult?.status === "ok" ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs font-medium text-green-800">Committed — {commitResult.file_count} files</span>
                </div>
                {commitResult.repo_url && (
                  <a href={commitResult.repo_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-green-700 hover:text-green-800 font-medium">View in GitHub</a>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {loadingIntegrations ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 justify-center py-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading...</div>
                ) : integrations.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center">No GitHub integrations configured</p>
                ) : (
                  integrations.map((intg) => {
                    const sel = selectedGithub?.id === intg.id;
                    return (
                      <button key={intg.id} onClick={() => setSelectedGithub(intg)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                          sel ? "border-emerald-400 bg-emerald-50" : "border-gray-200 hover:border-gray-300"
                        }`}>
                        <GitBranch className={`w-3.5 h-3.5 ${sel ? "text-emerald-600" : "text-gray-400"}`} />
                        <span className="font-medium text-gray-900">{intg.name}</span>
                        {sel && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-auto" />}
                      </button>
                    );
                  })
                )}
                {selectedGithub && (
                  <button onClick={handleCommit} disabled={committing}
                    className="w-full py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">
                    {committing ? <><Loader2 className="w-3 h-3 animate-spin" /> Committing...</> : <><Save className="w-3 h-3" /> Commit to GitHub</>}
                  </button>
                )}
                {commitError && <p className="text-xs text-red-600">{commitError}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Right: File viewer */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col" style={{ minHeight: "600px" }}>
          {selectedFile ? (
            <>
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderTree className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-mono text-gray-600 truncate">{selectedFile.path}</span>
                </div>
                <span className="text-[10px] text-gray-400">{selectedFile.content.length} chars</span>
              </div>
              <pre className="flex-1 px-4 py-3 font-mono text-xs text-gray-800 overflow-auto whitespace-pre-wrap leading-relaxed">
                {selectedFile.content}
              </pre>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <p className="text-sm">Select a file to view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
