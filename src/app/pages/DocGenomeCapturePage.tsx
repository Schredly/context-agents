import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  FileText,
  Upload,
  GitBranch,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Dna,
  Save,
  Trash2,
  FolderTree,
  RefreshCw,
  ArrowLeft,
  Brain,
  BookOpen,
  Layers,
  Sparkles,
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
  { key: "document_parser", label: "Document Parser", icon: FileText, description: "Extract text, sections, and structure from document" },
  { key: "structure_extraction", label: "Structure Extraction", icon: Layers, description: "Identify objects, fields, workflows, relationships" },
  { key: "synthesis", label: "Synthesis & Validation", icon: Sparkles, description: "Validate, compute confidence scoring" },
];

export default function DocGenomeCapturePage() {
  const navigate = useNavigate();

  // Step 1: Document
  const [docFile, setDocFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Extract — taxonomy fields
  const [vendor, setVendor] = useState("");
  const [productArea, setProductArea] = useState("");
  const [module, setModule] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [applicationName, setApplicationName] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractStatus, setExtractStatus] = useState("");
  const [genomeResult, setGenomeResult] = useState<any>(null);
  const [genomeFiles, setGenomeFiles] = useState<GenomeFile[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [docId, setDocId] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({});

  // Step 3: Prompt refinement
  const [promptText, setPromptText] = useState("");
  const [refining, setRefining] = useState(false);

  // Step 4: GitHub & Commit
  const [showGithub, setShowGithub] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [selectedGithub, setSelectedGithub] = useState<Integration | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<any>(null);

  // ── Step 1: Select document ──

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocFile(file);
    setDocId(null);
    setGenomeResult(null);
    setGenomeFiles([]);
    setExtractError(null);
    setCommitResult(null);
    setShowGithub(false);
    setExtractStatus("");
    setAgentStatuses({});
  };

  const clearDoc = () => {
    setDocFile(null);
    setDocId(null);
    setGenomeResult(null);
    setGenomeFiles([]);
    setExtractError(null);
    setCommitResult(null);
    setShowGithub(false);
    setExtractStatus("");
    setAgentStatuses({});
  };

  // ── Step 2: Upload + Extract ──

  const runExtraction = async () => {
    if (!docFile) return;
    setExtracting(true);
    setExtractError(null);
    setExtractStatus("Uploading document...");
    setAgentStatuses({});

    try {
      let did = docId;
      if (!did) {

        const formData = new FormData();
        formData.append("file", docFile);
        let uploadRes: Response;
        try {
          uploadRes = await fetch("/api/doc-genome/upload", {
            method: "POST",
            body: formData,
          });
        } catch {
          throw new Error("Cannot reach backend server. Make sure the backend is running.");
        }

        if (!uploadRes.ok) {
          const text = await uploadRes.text().catch(() => "");
          throw new Error(`Upload failed (${uploadRes.status}): ${text.slice(0, 200)}`);
        }
        const uploadData = await uploadRes.json();

        if (uploadData.status !== "ok") {
          throw new Error(uploadData.error || "Upload failed");
        }
        did = uploadData.doc_id;
        setDocId(did);
      }

      setExtractStatus("Running genome extraction pipeline...");

      const res = await fetch("/api/doc-genome/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id: did, user_notes: userNotes, vendor, product_area: productArea, module }),
      });


      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Extraction failed (${res.status}): ${text.slice(0, 300)}`);
      }

      // Read the full response body as text, then parse SSE events
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
            if (!applicationName && event.genome?.application_name) {
              setApplicationName(event.genome.application_name);
            }
            const files = buildGenomeFiles(
              event.genome,
              applicationName || event.genome?.application_name || "app",
            );
            setGenomeFiles(files);
            setSelectedFileIdx(0);
          }
          if (event.status === "error") {
            throw new Error(event.error || "Extraction failed");
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.includes("Extraction failed")) throw parseErr;
          if (parseErr instanceof Error && parseErr.message !== "Unexpected") throw parseErr;
          // Ignore JSON parse errors
        }
      }

      if (!gotResult) {
        throw new Error("No genome was extracted from the document. Check that the document has readable text content.");
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
    if (!docId || !promptText.trim()) return;
    setRefining(true);
    setExtractError(null);
    setExtractStatus("Re-analyzing with refinement...");
    setAgentStatuses({});

    try {
      const notes = `${userNotes}\n\nRefinement: ${promptText}`;
      const res = await fetch("/api/doc-genome/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id: docId, user_notes: notes, vendor, product_area: productArea, module }),
      });

      if (!res.ok) throw new Error(`Failed (${res.status})`);

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.agent) {
                  setAgentStatuses((prev) => ({
                    ...prev,
                    [event.agent]: { status: event.status, data: event },
                  }));
                }
                if (event.status === "completed" && event.genome) {
                  setGenomeResult(event.genome);
                  if (event.genome?.application_name) setApplicationName(event.genome.application_name);
                  const files = buildGenomeFiles(
                    event.genome,
                    applicationName || event.genome?.application_name || "app",
                  );
                  setGenomeFiles(files);
                  setSelectedFileIdx(0);
                  setPromptText("");
                  setCommitResult(null);
                }
                if (event.status === "error") throw new Error(event.error || "Refinement failed");
              } catch {}
            }
          }
        }
      } else {
        const data = await res.json();
        if (data.status === "error") throw new Error(data.error || "Refinement failed");
        setGenomeResult(data.genome);
        if (data.genome?.application_name) setApplicationName(data.genome.application_name);
        const files = buildGenomeFiles(
          data.genome,
          applicationName || data.genome?.application_name || "app",
        );
        setGenomeFiles(files);
        setSelectedFileIdx(0);
        setPromptText("");
        setCommitResult(null);
      }

      setExtractStatus("");
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Refinement failed");
      setExtractStatus("");
    }
    setRefining(false);
  };

  // ── Step 4: GitHub & Commit ──

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
    if (!genomeResult || !selectedGithub) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const res = await fetch("/api/doc-genome/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_id: docId,
          genome: genomeResult,
          application_name: applicationName || genomeResult.application_name || "app",
          vendor,
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

  const buildGenomeFiles = (genome: any, appName: string): GenomeFile[] => {
    const vendorSlug = (vendor || genome.vendor || "unknown").toLowerCase().replace(/\s+/g, "_");
    const slug = (appName || "app").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const paSlug = productArea ? productArea.toLowerCase().replace(/\s+/g, "_") : "";
    const modSlug = module ? module.toLowerCase().replace(/\s+/g, "_") : "";
    const pathParts = [`genomes/tenants/acme/vendors/${vendorSlug}`];
    if (paSlug) pathParts.push(paSlug);
    pathParts.push(modSlug || slug);
    const base = pathParts.join("/");
    const files: GenomeFile[] = [];

    files.push({ path: `${base}/genome.yaml`, content: toYaml({
      application_name: genome.application_name || appName,
      vendor: genome.vendor, source_platform: genome.source_platform || "Documentation",
      category: genome.category || "", confidence: genome.confidence,
      genome_document: genome.genome_document,
    })});

    if (genome.summary) {
      files.push({ path: `${base}/summary.md`, content: `# ${genome.application_name || appName}\n\n${genome.summary}\n` });
    }
    const gd = genome.genome_document || {};
    if (gd.objects?.length) files.push({ path: `${base}/structure/objects.json`, content: JSON.stringify(gd.objects, null, 2) });
    if (gd.fields?.length) files.push({ path: `${base}/structure/fields.json`, content: JSON.stringify(gd.fields, null, 2) });
    if (gd.workflows?.length) files.push({ path: `${base}/structure/workflows.json`, content: JSON.stringify(gd.workflows, null, 2) });
    if (gd.relationships?.length) files.push({ path: `${base}/structure/relationships.json`, content: JSON.stringify(gd.relationships, null, 2) });

    return files;
  };

  const toYaml = (obj: any, indent = 0): string => {
    const pad = "  ".repeat(indent);
    let out = "";
    for (const [k, v] of Object.entries(obj)) {
      if (v == null) continue;
      if (typeof v === "object" && !Array.isArray(v)) {
        out += `${pad}${k}:\n${toYaml(v, indent + 1)}`;
      } else if (Array.isArray(v)) {
        out += `${pad}${k}:\n`;
        for (const item of v) out += `${pad}  - ${typeof item === "object" ? JSON.stringify(item) : item}\n`;
      } else {
        out += `${pad}${k}: ${v}\n`;
      }
    }
    return out;
  };

  const updateFileContent = (idx: number, content: string) =>
    setGenomeFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, content } : f)));

  const removeFile = (idx: number) => {
    setGenomeFiles((prev) => prev.filter((_, i) => i !== idx));
    if (selectedFileIdx >= idx && selectedFileIdx > 0) setSelectedFileIdx(selectedFileIdx - 1);
  };

  const selectedFile = genomeFiles[selectedFileIdx] || null;

  const docTypeLabel = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const map: Record<string, string> = { pdf: "PDF", docx: "DOCX", doc: "DOC", txt: "TXT", md: "Markdown" };
    return map[ext] || ext.toUpperCase();
  };

  // ── Render ──

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/genomes/doc")}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Capture Doc Genome</h1>
            <p className="text-sm text-gray-500">Upload documentation, extract genome, review & commit</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══ Left column ═══ */}
        <div className="space-y-4">

          {/* ── 1. Select document ── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">1</span>
              Select Document
            </h2>

            {!docFile ? (
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
                <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-medium">Click to select a document</p>
                <p className="text-xs text-gray-400 mt-1">.pdf, .docx, .txt, .md</p>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate font-medium">{docFile.name}</p>
                    <p className="text-[10px] text-gray-500">{(docFile.size / (1024 * 1024)).toFixed(1)} MB · {docTypeLabel(docFile.name)}</p>
                  </div>
                </div>
                <button onClick={clearDoc} className="text-xs text-gray-400 hover:text-gray-600 ml-3">Change</button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md,.markdown" className="hidden" onChange={handleFileSelect} />
          </div>

          {/* ── 2. Extract Genome ── */}
          {docFile && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">2</span>
                Extract Genome
              </h2>

              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Vendor <span className="text-red-400">*</span></label>
                    <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)}
                      placeholder="e.g. ServiceNow"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Product Area <span className="text-red-400">*</span></label>
                    <input type="text" value={productArea} onChange={(e) => setProductArea(e.target.value)}
                      placeholder="e.g. Service Catalog"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Module <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" value={module} onChange={(e) => setModule(e.target.value)}
                    placeholder="e.g. Technical Catalog, HR Catalog"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Application Name <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" value={applicationName} onChange={(e) => setApplicationName(e.target.value)}
                    placeholder="Auto-detected from document, or enter here"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Context notes <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea value={userNotes} onChange={(e) => setUserNotes(e.target.value)}
                    placeholder="e.g. Focus on the data model and approval workflows described in sections 3-5..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none resize-none" rows={2} />
                </div>
              </div>

              {extracting ? (
                <div className="space-y-3">
                  <div className="w-full py-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      <span className="text-sm font-semibold text-indigo-700">{extractStatus || "Processing..."}</span>
                    </div>

                    <div className="space-y-2">
                      {AGENTS.map((agent) => {
                        const s = agentStatuses[agent.key];
                        const Icon = agent.icon;
                        const statusColor = !s || s.status === "idle" ? "text-gray-300"
                          : s.status === "running" ? "text-indigo-500"
                          : s.status === "done" ? "text-green-500"
                          : "text-red-500";
                        return (
                          <div key={agent.key} className="flex items-center gap-2.5 py-1.5">
                            <div className={`w-5 h-5 flex items-center justify-center ${statusColor}`}>
                              {s?.status === "running" ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : s?.status === "done" ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : s?.status === "error" ? (
                                <AlertCircle className="w-3.5 h-3.5" />
                              ) : (
                                <Icon className="w-3.5 h-3.5" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700">{agent.label}</p>
                              <p className="text-[10px] text-gray-400">
                                {s?.status === "done" && s.data
                                  ? Object.entries(s.data)
                                      .filter(([k]) => !["agent", "status"].includes(k))
                                      .map(([k, v]) => `${k}: ${v}`)
                                      .join(" · ")
                                  : agent.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <button onClick={runExtraction} disabled={refining || !vendor.trim() || !productArea.trim()}
                  className="w-full py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <Brain className="w-4 h-4" /> Extract Genome from Document
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
                    <span className="text-xs font-medium text-green-800">{genomeResult.application_name || "App"} — {genomeResult.vendor || "?"}</span>
                  </div>
                  <div className="flex gap-3 text-[10px] text-green-700">
                    <span>{genomeResult.genome_document?.objects?.length || 0} objects</span>
                    <span>{genomeResult.genome_document?.fields?.length || 0} fields</span>
                    <span>{genomeResult.genome_document?.workflows?.length || 0} workflows</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 3. Prompt refinement ── */}
          {genomeFiles.length > 0 && !extracting && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">3</span>
                Refine (optional)
              </h2>
              <p className="text-xs text-gray-500 mb-3">Edit files directly on the right, or describe changes and re-extract.</p>
              <div className="flex gap-2">
                <input value={promptText} onChange={(e) => setPromptText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && promptText.trim()) runRefinement(); }}
                  placeholder="e.g. Focus more on the approval workflows in section 4..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none" />
                <button onClick={runRefinement} disabled={refining || !promptText.trim()}
                  className="px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors flex items-center gap-1.5 text-sm">
                  {refining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Re-extract
                </button>
              </div>
            </div>
          )}

          {/* ── 4. GitHub & Commit ── */}
          {genomeFiles.length > 0 && !extracting && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">4</span>
                GitHub Repository
              </h2>

              {!showGithub ? (
                <button onClick={() => setShowGithub(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                  <GitBranch className="w-4 h-4" /> Select GitHub Repository
                </button>
              ) : (
                <div className="space-y-3">
                  {loadingIntegrations ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 py-3 justify-center">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading integrations...
                    </div>
                  ) : integrations.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3">No GitHub integrations configured. Add one in Settings &rarr; Integrations.</p>
                  ) : (
                    integrations.map((intg) => {
                      const sel = selectedGithub?.id === intg.id;
                      return (
                        <button key={intg.id} onClick={() => setSelectedGithub(intg)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left text-sm transition-all ${
                            sel ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300"
                          }`}>
                          <GitBranch className={`w-4 h-4 ${sel ? "text-indigo-600" : "text-gray-400"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-xs">{intg.name}</p>
                            <p className="text-[10px] text-gray-500 truncate">{intg.config?.default_repository || intg.config?.org || ""}</p>
                          </div>
                          {sel && <CheckCircle2 className="w-4 h-4 text-indigo-500" />}
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
                            {(commitResult.files_pushed || []).slice(0, 6).map((f: string, i: number) => (
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

        {/* ═══ Right column: Genome files ═══ */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: "520px" }}>
          {genomeFiles.length > 0 ? (
            <>
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 flex items-center gap-1 overflow-x-auto">
                <FolderTree className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mr-1" />
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
                      <button onClick={() => removeFile(selectedFileIdx)} className="p-1 text-gray-300 hover:text-red-500" title="Remove">
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
                {docFile ? 'Click "Extract Genome from Document" to analyze.' : "Select a document to get started."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
