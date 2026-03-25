import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  FileCode2,
  GitBranch,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Save,
  Trash2,
  FolderTree,
  RefreshCw,
  ArrowLeft,
  Brain,
  Database,
  FileText,
  Sparkles,
  Layers,
  X,
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

interface AgentStatus {
  status: "idle" | "running" | "done" | "error";
  data?: Record<string, any>;
}

const AGENTS = [
  { key: "xml_parser", label: "XML Parser", icon: FileCode2, description: "Parse update set XML, count records and components" },
  { key: "genome_extraction", label: "Genome Extraction", icon: Sparkles, description: "Extract entities, catalog, workflows, rules, integrations" },
  { key: "genome_merger", label: "Genome Merger", icon: Database, description: "Deduplicate and merge across update sets into unified genome" },
  { key: "deep_analysis", label: "Deep Analysis", icon: Brain, description: "Extract logic patterns, processes, events for reusable transformation" },
  { key: "platform_transformer", label: "Platform Transformer", icon: Layers, description: "Convert to platform-neutral architecture (React, FastAPI, Postgres)" },
  { key: "genome_validator", label: "Genome Validator", icon: CheckCircle2, description: "Validate completeness, identify gaps and risks" },
];

export default function SNGenomeCapturePage() {
  const navigate = useNavigate();

  // Step 1: Files (multi-select)
  const [xmlFiles, setXmlFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Extract
  const [productArea, setProductArea] = useState("");
  const [module, setModule] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractStatus, setExtractStatus] = useState("");
  const [genomeResult, setGenomeResult] = useState<any>(null);
  const [genomeYaml, setGenomeYaml] = useState<string>("");
  const [genomeFiles, setGenomeFiles] = useState<GenomeFile[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({});

  // Step 3: Refinement
  const [promptText, setPromptText] = useState("");
  const [refining, setRefining] = useState(false);

  // Step 4: GitHub
  const [showGithub, setShowGithub] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [selectedGithub, setSelectedGithub] = useState<Integration | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<any>(null);

  // ── Step 1: Select XML files ──

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (!newFiles.length) return;
    setXmlFiles((prev) => [...prev, ...newFiles]);
    setDocIds([]);
    setGenomeResult(null);
    setGenomeYaml("");
    setGenomeFiles([]);
    setExtractError(null);
    setCommitResult(null);
    setShowGithub(false);
    setAgentStatuses({});
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setXmlFiles((prev) => prev.filter((_, i) => i !== idx));
    setDocIds([]);
  };

  const clearFiles = () => {
    setXmlFiles([]);
    setDocIds([]);
    setGenomeResult(null);
    setGenomeYaml("");
    setGenomeFiles([]);
    setExtractError(null);
    setCommitResult(null);
    setShowGithub(false);
    setAgentStatuses({});
  };

  // ── Step 2: Upload + Extract ──

  const runExtraction = async () => {
    if (!xmlFiles.length) return;
    setExtracting(true);
    setExtractError(null);
    setExtractStatus("Uploading XML files...");
    setAgentStatuses({});

    try {
      // Upload all files
      let ids = docIds;
      if (!ids.length) {
        const formData = new FormData();
        for (const file of xmlFiles) {
          formData.append("files", file);
        }
        let uploadRes: Response;
        try {
          uploadRes = await fetch("/api/sn-genome/upload", { method: "POST", body: formData });
        } catch {
          throw new Error("Cannot reach backend server.");
        }
        if (!uploadRes.ok) {
          const text = await uploadRes.text().catch(() => "");
          throw new Error(`Upload failed (${uploadRes.status}): ${text.slice(0, 200)}`);
        }
        const uploadData = await uploadRes.json();
        if (uploadData.status !== "ok") throw new Error(uploadData.error || "Upload failed");

        ids = (uploadData.files || [])
          .filter((f: any) => f.status === "ok")
          .map((f: any) => f.doc_id);
        if (!ids.length) throw new Error("No files were uploaded successfully");
        setDocIds(ids);
      }

      setExtractStatus("Running ServiceNow genome extraction...");

      const res = await fetch("/api/sn-genome/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_ids: ids, user_notes: userNotes, product_area: productArea, module }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Extraction failed (${res.status}): ${text.slice(0, 300)}`);
      }

      // Read full response then parse SSE events
      const body = await res.text();
      const lines = body.split("\n");
      let gotResult = false;

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.agent) {
            setAgentStatuses((prev) => ({
              ...prev,
              [event.agent]: { status: event.status, data: event },
            }));
          }
          if (event.status === "completed" && event.genome) {
            gotResult = true;
            setGenomeResult(event.genome);
            setGenomeYaml(event.genome_yaml || "");
            setExtractionId(event.extraction_id || null);
            const files = buildGenomeFiles(event.genome, event.genome_yaml || "");
            setGenomeFiles(files);
            setSelectedFileIdx(0);
          }
          if (event.status === "error") {
            throw new Error(event.error || "Extraction failed");
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && !parseErr.message.includes("JSON")) throw parseErr;
        }
      }

      if (!gotResult) {
        throw new Error("No genome was extracted. Check that the XML files contain valid ServiceNow update set data.");
      }

      setExtractStatus("");
      setCommitResult(null);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Failed");
      setExtractStatus("");
    }
    setExtracting(false);
  };

  // ── Step 3: Refinement ──

  const runRefinement = async () => {
    if (!docIds.length || !promptText.trim()) return;
    setRefining(true);
    setExtractError(null);
    setExtractStatus("Re-analyzing with refinement...");
    setAgentStatuses({});

    try {
      const notes = `${userNotes}\n\nRefinement: ${promptText}`;
      const res = await fetch("/api/sn-genome/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_ids: docIds, user_notes: notes, product_area: productArea, module }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);

      const body = await res.text();
      for (const line of body.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.agent) {
            setAgentStatuses((prev) => ({ ...prev, [event.agent]: { status: event.status, data: event } }));
          }
          if (event.status === "completed" && event.genome) {
            setGenomeResult(event.genome);
            setGenomeYaml(event.genome_yaml || "");
            setExtractionId(event.extraction_id || null);
            const files = buildGenomeFiles(event.genome, event.genome_yaml || "");
            setGenomeFiles(files);
            setSelectedFileIdx(0);
            setPromptText("");
            setCommitResult(null);
          }
          if (event.status === "error") throw new Error(event.error || "Refinement failed");
        } catch (parseErr) {
          if (parseErr instanceof Error && !parseErr.message.includes("JSON")) throw parseErr;
        }
      }
      setExtractStatus("");
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Refinement failed");
      setExtractStatus("");
    }
    setRefining(false);
  };

  // ── Step 4: GitHub ──

  useEffect(() => {
    if (showGithub && integrations.length === 0) {
      setLoadingIntegrations(true);
      fetch(`/api/admin/${TENANT}/integrations/?filter_tenant=all`)
        .then((r) => r.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setIntegrations(list.filter((i: Integration) => i.integration_type === "github"));
        })
        .catch(() => {})
        .finally(() => setLoadingIntegrations(false));
    }
  }, [showGithub]);

  const handleCommit = async () => {
    if (!genomeResult || !selectedGithub || !extractionId) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const appName = genomeResult.application?.name || "";
      const res = await fetch("/api/sn-genome/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraction_id: extractionId,
          genome: genomeResult,
          genome_yaml: genomeYaml,
          application_name: appName,
          product_area: productArea,
          module,
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

  // ── Helpers ──

  const buildGenomeFiles = (genome: any, yamlContent: string): GenomeFile[] => {
    const appName = genome.application?.name || "sn_app";
    const slug = appName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const paSlug = productArea ? productArea.toLowerCase().replace(/\s+/g, "_") : "";
    const modSlug = module ? module.toLowerCase().replace(/\s+/g, "_") : "";
    const pathParts = ["genomes/tenants/acme/vendors/servicenow"];
    if (paSlug) pathParts.push(paSlug);
    pathParts.push(modSlug || slug);
    const base = pathParts.join("/");
    const files: GenomeFile[] = [];

    // Primary genome.yaml
    files.push({ path: `${base}/genome.yaml`, content: yamlContent || JSON.stringify(genome, null, 2) });

    // Structure files
    if (genome.entities?.length) files.push({ path: `${base}/structure/entities.json`, content: JSON.stringify(genome.entities, null, 2) });
    if (genome.catalog?.items?.length) files.push({ path: `${base}/structure/catalog.json`, content: JSON.stringify(genome.catalog, null, 2) });
    if (genome.workflows?.length) files.push({ path: `${base}/structure/workflows.json`, content: JSON.stringify(genome.workflows, null, 2) });
    if (genome.business_logic?.rules?.length) files.push({ path: `${base}/structure/business_logic.json`, content: JSON.stringify(genome.business_logic, null, 2) });
    if (genome.data_model?.tables?.length) files.push({ path: `${base}/structure/data_model.json`, content: JSON.stringify(genome.data_model, null, 2) });
    if (genome.ui) files.push({ path: `${base}/structure/ui.json`, content: JSON.stringify(genome.ui, null, 2) });
    if (genome.navigation) files.push({ path: `${base}/structure/navigation.json`, content: JSON.stringify(genome.navigation, null, 2) });
    if (genome.integrations?.length) files.push({ path: `${base}/structure/integrations.json`, content: JSON.stringify(genome.integrations, null, 2) });
    if (genome.logic_patterns?.length) files.push({ path: `${base}/structure/logic_patterns.json`, content: JSON.stringify(genome.logic_patterns, null, 2) });
    if (genome.processes?.length) files.push({ path: `${base}/structure/processes.json`, content: JSON.stringify(genome.processes, null, 2) });
    if (genome.events?.length) files.push({ path: `${base}/structure/events.json`, content: JSON.stringify(genome.events, null, 2) });
    if (genome.portable_genome) files.push({ path: `${base}/portable/portable_genome.json`, content: JSON.stringify(genome.portable_genome, null, 2) });
    if (genome.validation) files.push({ path: `${base}/validation/report.json`, content: JSON.stringify(genome.validation, null, 2) });

    return files;
  };

  const updateFileContent = (idx: number, content: string) =>
    setGenomeFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, content } : f)));

  const removeGenomeFile = (idx: number) => {
    setGenomeFiles((prev) => prev.filter((_, i) => i !== idx));
    if (selectedFileIdx >= idx && selectedFileIdx > 0) setSelectedFileIdx(selectedFileIdx - 1);
  };

  const selectedFile = genomeFiles[selectedFileIdx] || null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/genomes/sn")}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Capture SN Genome</h1>
            <p className="text-sm text-gray-500">Upload update set XMLs, extract genome, review & commit</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-4">

          {/* 1. Select XML files */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">1</span>
              Select Update Set XMLs
            </h2>

            {xmlFiles.length === 0 ? (
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors">
                <FileCode2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-medium">Click to select XML files</p>
                <p className="text-xs text-gray-400 mt-1">One or more ServiceNow update set .xml files</p>
              </div>
            ) : (
              <div className="space-y-2">
                {xmlFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span className="text-xs text-gray-800 truncate">{f.name}</span>
                      <span className="text-[10px] text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                    <button onClick={() => removeFile(i)} className="p-1 text-gray-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">+ Add more files</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={clearFiles} className="text-xs text-gray-400 hover:text-gray-600">Clear all</button>
                </div>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".xml" multiple className="hidden" onChange={handleFileSelect} />
          </div>

          {/* 2. Extract Genome */}
          {xmlFiles.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">2</span>
                Extract Genome
              </h2>

              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Product Area</label>
                    <input type="text" value={productArea} onChange={(e) => setProductArea(e.target.value)}
                      placeholder="e.g. HR Service Delivery"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Module</label>
                    <input type="text" value={module} onChange={(e) => setModule(e.target.value)}
                      placeholder="e.g. Case Management"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Context notes <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea value={userNotes} onChange={(e) => setUserNotes(e.target.value)}
                    placeholder="e.g. Focus on the catalog variables and approval workflows..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 outline-none resize-none" rows={2} />
                </div>
              </div>

              {extracting ? (
                <div className="w-full py-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-700">{extractStatus || "Processing..."}</span>
                  </div>
                  <div className="space-y-2">
                    {AGENTS.map((agent) => {
                      const s = agentStatuses[agent.key];
                      const Icon = agent.icon;
                      const statusColor = !s || s.status === "idle" ? "text-gray-300"
                        : s.status === "running" ? "text-emerald-500"
                        : s.status === "done" ? "text-green-500"
                        : "text-red-500";
                      return (
                        <div key={agent.key} className="flex items-center gap-2.5 py-1.5">
                          <div className={`w-5 h-5 flex items-center justify-center ${statusColor}`}>
                            {s?.status === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : s?.status === "done" ? <CheckCircle2 className="w-3.5 h-3.5" />
                              : s?.status === "error" ? <AlertCircle className="w-3.5 h-3.5" />
                              : <Icon className="w-3.5 h-3.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700">{agent.label}</p>
                            <p className="text-[10px] text-gray-400">
                              {s?.status === "done" && s.data
                                ? Object.entries(s.data).filter(([k]) => !["agent", "status"].includes(k)).map(([k, v]) => `${k}: ${v}`).join(" · ")
                                : agent.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <button onClick={runExtraction} disabled={refining}
                  className="w-full py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <Brain className="w-4 h-4" /> Extract SN Genome
                </button>
              )}

              {extractError && (
                <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
                  {extractError}
                </div>
              )}

              {genomeResult && !extracting && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-xs font-medium text-green-800">
                      {genomeResult.application?.name || "SN App"} — ServiceNow
                    </span>
                  </div>
                  <div className="flex gap-3 text-[10px] text-green-700">
                    <span>{genomeResult.entities?.length || 0} entities</span>
                    <span>{genomeResult.catalog?.items?.length || 0} catalog items</span>
                    <span>{genomeResult.workflows?.length || 0} workflows</span>
                    <span>{genomeResult.business_logic?.rules?.length || 0} rules</span>
                    <span>{genomeResult.logic_patterns?.length || 0} patterns</span>
                    <span>{genomeResult.processes?.length || 0} processes</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Refinement */}
          {genomeFiles.length > 0 && !extracting && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">3</span>
                Refine (optional)
              </h2>
              <p className="text-xs text-gray-500 mb-3">Edit files directly or describe changes to re-extract.</p>
              <div className="flex gap-2">
                <input value={promptText} onChange={(e) => setPromptText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && promptText.trim()) runRefinement(); }}
                  placeholder="e.g. Include more detail on the approval workflow steps..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 outline-none" />
                <button onClick={runRefinement} disabled={refining || !promptText.trim()}
                  className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-40 transition-colors flex items-center gap-1.5 text-sm">
                  {refining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Re-extract
                </button>
              </div>
            </div>
          )}

          {/* 4. GitHub */}
          {genomeFiles.length > 0 && !extracting && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">4</span>
                GitHub Repository
              </h2>

              {!showGithub ? (
                <button onClick={() => setShowGithub(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:border-emerald-300 hover:text-emerald-600 transition-colors">
                  <GitBranch className="w-4 h-4" /> Select GitHub Repository
                </button>
              ) : (
                <div className="space-y-3">
                  {loadingIntegrations ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 py-3 justify-center">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading integrations...
                    </div>
                  ) : integrations.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3">No GitHub integrations configured.</p>
                  ) : (
                    integrations.map((intg) => {
                      const sel = selectedGithub?.id === intg.id;
                      return (
                        <button key={intg.id} onClick={() => setSelectedGithub(intg)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left text-sm transition-all ${
                            sel ? "border-emerald-400 bg-emerald-50" : "border-gray-200 hover:border-gray-300"
                          }`}>
                          <GitBranch className={`w-4 h-4 ${sel ? "text-emerald-600" : "text-gray-400"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-xs">{intg.name}</p>
                            <p className="text-[10px] text-gray-500 truncate">{intg.config?.default_repository || intg.config?.org || ""}</p>
                          </div>
                          {sel && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </button>
                      );
                    })
                  )}

                  {selectedGithub && (
                    <div className="pt-3 border-t border-gray-100">
                      {commitResult ? (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            <span className="text-xs font-semibold text-green-800">Committed — {commitResult.file_count} files</span>
                          </div>
                          <div className="text-[10px] text-green-700 space-y-0.5 mb-2">
                            {(commitResult.files_pushed || []).slice(0, 8).map((f: string, i: number) => (
                              <div key={i} className="flex items-center gap-1"><FileText className="w-2.5 h-2.5" /><span className="font-mono truncate">{f}</span></div>
                            ))}
                          </div>
                          {commitResult.repo_url && (
                            <a href={commitResult.repo_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-green-700 hover:text-green-800 font-medium">
                              <GitBranch className="w-3 h-3" /> View in GitHub
                            </a>
                          )}
                        </div>
                      ) : (
                        <>
                          <button onClick={handleCommit} disabled={committing}
                            className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                            {committing ? <><Loader2 className="w-4 h-4 animate-spin" /> Committing...</> : <><Save className="w-4 h-4" /> Review & Commit</>}
                          </button>
                          {commitError && <p className="mt-2 text-xs text-red-600">{commitError}</p>}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column: Genome files */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: "520px" }}>
          {genomeFiles.length > 0 ? (
            <>
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 flex items-center gap-1 overflow-x-auto">
                <FolderTree className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mr-1" />
                {genomeFiles.map((f, i) => (
                  <button key={i} onClick={() => setSelectedFileIdx(i)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      selectedFileIdx === i ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-white/60"
                    }`}>
                    <FileText className="w-3 h-3" />
                    {f.path.split("/").pop()}
                  </button>
                ))}
              </div>

              {selectedFile && (
                <>
                  <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-gray-400 truncate">{selectedFile.path}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">{selectedFile.content.length} chars</span>
                      <button onClick={() => removeGenomeFile(selectedFileIdx)} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={selectedFile.content}
                    onChange={(e) => updateFileContent(selectedFileIdx, e.target.value)}
                    className="flex-1 px-4 py-3 font-mono text-xs text-gray-800 resize-none focus:outline-none leading-relaxed"
                    spellCheck={false}
                  />
                </>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
              <FolderTree className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Genome Files</p>
              <p className="text-xs text-gray-400 mt-1 text-center">
                {xmlFiles.length ? 'Click "Extract SN Genome" to analyze update sets.' : "Select XML files to get started."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
