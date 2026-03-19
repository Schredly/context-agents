import { useState, useRef, useEffect } from "react";
import {
  Video,
  Upload,
  GitBranch,
  Play,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Dna,
  FileText,
  Save,
  Trash2,
  FolderTree,
  RefreshCw,
  Send,
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

export default function VideoGenomePage() {
  // Step 1: Video (local only)
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Extract
  const [userNotes, setUserNotes] = useState("");
  const [applicationName, setApplicationName] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractStatus, setExtractStatus] = useState("");
  const [genomeResult, setGenomeResult] = useState<any>(null);
  const [genomeFiles, setGenomeFiles] = useState<GenomeFile[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);

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

  // ── Step 1: Select video locally (no server call) ──

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    // Reset downstream state
    setVideoId(null);
    setGenomeResult(null);
    setGenomeFiles([]);
    setExtractError(null);
    setCommitResult(null);
    setShowGithub(false);
    setExtractStatus("");
  };

  const clearVideo = () => {
    setVideoFile(null);
    setVideoUrl(null);
    setVideoId(null);
    setGenomeResult(null);
    setGenomeFiles([]);
    setExtractError(null);
    setCommitResult(null);
    setShowGithub(false);
    setExtractStatus("");
  };

  // ── Step 2: Upload + Extract in one action ──

  const runExtraction = async () => {
    if (!videoFile) return;
    setExtracting(true);
    setExtractError(null);
    setExtractStatus("Uploading video...");

    try {
      // Upload first (if not already uploaded)
      let vid = videoId;
      if (!vid) {
        const formData = new FormData();
        formData.append("file", videoFile);
        let uploadRes: Response;
        try {
          uploadRes = await fetch("/api/video-genome/upload", {
            method: "POST",
            body: formData,
          });
        } catch {
          throw new Error("Cannot reach backend server. Make sure the backend is running (uvicorn main:app --port 8000).");
        }
        if (!uploadRes.ok) {
          const text = await uploadRes.text().catch(() => "");
          throw new Error(`Upload failed (${uploadRes.status}): ${text.slice(0, 200)}`);
        }
        const uploadData = await uploadRes.json();
        if (uploadData.status !== "ok") {
          throw new Error(uploadData.error || "Upload failed");
        }
        vid = uploadData.video_id;
        setVideoId(vid);
      }

      // Now extract — this can take a while (frame extraction + LLM vision call)
      setExtractStatus("Processing — extracting frames and analyzing with AI...");
      let res: Response;
      try {
        res = await fetch("/api/video-genome/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_id: vid, user_notes: userNotes }),
        });
      } catch {
        throw new Error("Cannot reach backend server. The extraction request may have timed out — try a shorter video or check the backend logs.");
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Extraction failed (${res.status}): ${text.slice(0, 300)}`);
      }
      const data = await res.json();
      if (data.status === "error") {
        let msg = data.error || "Extraction failed";
        if (data.raw_response) msg += `\n\nRaw: ${data.raw_response.slice(0, 500)}`;
        throw new Error(msg);
      }

      setGenomeResult(data.genome);
      if (!applicationName && data.genome?.application_name) {
        setApplicationName(data.genome.application_name);
      }
      const files = buildGenomeFiles(data.genome, applicationName || data.genome?.application_name || "app");
      setGenomeFiles(files);
      setSelectedFileIdx(0);
      setExtractStatus("");
      setCommitResult(null);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Failed");
      setExtractStatus("");
    }
    setExtracting(false);
  };

  // ── Step 3: Prompt refinement (re-extract with extra instructions) ──

  const runRefinement = async () => {
    if (!videoId || !promptText.trim()) return;
    setRefining(true);
    setExtractError(null);
    setExtractStatus("Re-analyzing with refinement...");

    try {
      const notes = `${userNotes}\n\nRefinement: ${promptText}`;
      const res = await fetch("/api/video-genome/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, user_notes: notes }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      if (data.status === "error") throw new Error(data.error || "Refinement failed");

      setGenomeResult(data.genome);
      if (data.genome?.application_name) setApplicationName(data.genome.application_name);
      const files = buildGenomeFiles(data.genome, applicationName || data.genome?.application_name || "app");
      setGenomeFiles(files);
      setSelectedFileIdx(0);
      setPromptText("");
      setExtractStatus("");
      setCommitResult(null);
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
      const res = await fetch("/api/video-genome/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: videoId,
          genome: genomeResult,
          application_name: applicationName || genomeResult.application_name || "app",
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
    const vendor = genome.vendor || "unknown";
    const slug = (appName || "app").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const base = `genomes/tenants/acme/vendors/${vendor}/${slug}`;
    const files: GenomeFile[] = [];

    files.push({ path: `${base}/genome.yaml`, content: toYaml({
      application_name: genome.application_name || appName,
      vendor: genome.vendor, source_platform: genome.source_platform || "Video Capture",
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

  // ── Render ──

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
          <Video className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Video Genome</h1>
          <p className="text-sm text-gray-500">Upload a video walkthrough, extract the genome, refine, and commit to GitHub</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══ Left column ═══ */}
        <div className="space-y-4">

          {/* ── 1. Select video ── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold">1</span>
              Select Video
            </h2>

            {!videoFile ? (
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-colors">
                <Video className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-medium">Click to select a video</p>
                <p className="text-xs text-gray-400 mt-1">.mp4, .mov, .webm</p>
              </div>
            ) : (
              <div className="space-y-3">
                {videoUrl && (
                  <div className="rounded-xl overflow-hidden border border-gray-200 bg-black">
                    <video src={videoUrl} controls className="w-full max-h-[260px] object-contain" />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Video className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    <span className="text-xs text-gray-700 truncate">{videoFile.name}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{(videoFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                  </div>
                  <button onClick={clearVideo} className="text-xs text-gray-400 hover:text-gray-600">Change</button>
                </div>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".mp4,.mov,.webm" className="hidden" onChange={handleFileSelect} />
          </div>

          {/* ── 2. Extract Genome ── */}
          {videoFile && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold">2</span>
                Extract Genome
              </h2>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Application Name (optional)</label>
                  <input type="text" value={applicationName} onChange={(e) => setApplicationName(e.target.value)}
                    placeholder="Auto-detected from video, or enter here"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Context notes (optional)</label>
                  <textarea value={userNotes} onChange={(e) => setUserNotes(e.target.value)}
                    placeholder="e.g. This is ServiceNow ITSM showing incident management workflows..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none resize-none" rows={2} />
                </div>
              </div>

              {extracting ? (
                <div className="w-full py-4 bg-orange-50 border border-orange-200 rounded-xl">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <Loader2 className="w-5 h-5 animate-spin text-orange-600" />
                    <span className="text-sm font-semibold text-orange-700">Processing</span>
                  </div>
                  <p className="text-xs text-orange-600 text-center">{extractStatus || "Analyzing video..."}</p>
                  <p className="text-[10px] text-orange-400 text-center mt-1">This may take a minute depending on video length</p>
                </div>
              ) : (
                <button onClick={runExtraction} disabled={refining}
                  className="w-full py-2.5 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <Dna className="w-4 h-4" /> Extract Genome
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
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold">3</span>
                Refine (optional)
              </h2>
              <p className="text-xs text-gray-500 mb-3">Edit files directly on the right, or describe changes and re-extract.</p>
              <div className="flex gap-2">
                <input value={promptText} onChange={(e) => setPromptText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && promptText.trim()) runRefinement(); }}
                  placeholder="e.g. Add the approval workflow steps I showed at 2:30..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none" />
                <button onClick={runRefinement} disabled={refining || !promptText.trim()}
                  className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center gap-1.5 text-sm">
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
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold">4</span>
                GitHub Repository
              </h2>

              {!showGithub ? (
                <button onClick={() => setShowGithub(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:border-orange-300 hover:text-orange-600 transition-colors">
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
                            sel ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:border-gray-300"
                          }`}>
                          <GitBranch className={`w-4 h-4 ${sel ? "text-orange-600" : "text-gray-400"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-xs">{intg.name}</p>
                            <p className="text-[10px] text-gray-500 truncate">{intg.config?.default_repository || intg.config?.org || ""}</p>
                          </div>
                          {sel && <CheckCircle2 className="w-4 h-4 text-orange-500" />}
                        </button>
                      );
                    })
                  )}

                  {/* Commit */}
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
              {/* File tabs */}
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 flex items-center gap-1 overflow-x-auto">
                <FolderTree className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mr-1" />
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
                {videoFile ? 'Click "Extract Genome" to analyze the video.' : "Select a video to get started."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
