import { useState, useEffect, useRef } from "react";
import {
  Video,
  Upload,
  GitBranch,
  Play,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Dna,
  FileText,
  Save,
  Pencil,
  Eye,
} from "lucide-react";

const TENANT = "acme";
const API = `/api/admin/${TENANT}`;

interface Integration {
  id: string;
  integration_type: string;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
}

interface StepState {
  label: string;
  status: "idle" | "running" | "done" | "error";
  message: string;
}

const WIZARD_STEPS = [
  { id: 1, label: "Upload Video" },
  { id: 2, label: "GitHub Target" },
  { id: 3, label: "Extract Genome" },
  { id: 4, label: "Review & Commit" },
];

export default function VideoGenomePage() {
  const [step, setStep] = useState(1);

  // Step 1 — upload
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 — GitHub target
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [selectedGithub, setSelectedGithub] = useState<Integration | null>(null);
  const [applicationName, setApplicationName] = useState("");

  // Step 3 — extract
  const [extractPipeline, setExtractPipeline] = useState<StepState[]>([
    { label: "Extracting frames from video", status: "idle", message: "" },
    { label: "Analyzing frames with AI vision", status: "idle", message: "" },
    { label: "Building genome document", status: "idle", message: "" },
  ]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [genomeResult, setGenomeResult] = useState<any>(null);
  const [genomeYaml, setGenomeYaml] = useState("");

  // Step 4 — commit
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<any>(null);

  // Load integrations on step 2
  useEffect(() => {
    if (step === 2 && integrations.length === 0) {
      setLoadingIntegrations(true);
      fetch(`${API}/integrations/?filter_tenant=all`)
        .then((r) => r.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setIntegrations(list.filter((i: Integration) => i.integration_type === "github"));
        })
        .catch(() => {})
        .finally(() => setLoadingIntegrations(false));
    }
  }, [step]);

  // ---------------------------------------------------------------------------
  // Step 1: Upload
  // ---------------------------------------------------------------------------

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setVideoId(null);
    setUploadError(null);
  };

  const handleUpload = async () => {
    if (!videoFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", videoFile);
      const res = await fetch("/api/video-genome/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        setUploadError(`Server error ${res.status}: ${text.slice(0, 200)}`);
        setUploading(false);
        return;
      }
      const data = await res.json();
      if (data.status === "ok") {
        setVideoId(data.video_id);
      } else {
        setUploadError(data.detail || data.error || "Upload failed");
      }
    } catch (err) {
      setUploadError(`Network error: ${err instanceof Error ? err.message : "Could not reach server. Is the backend running?"}`);
    }
    setUploading(false);
  };

  // ---------------------------------------------------------------------------
  // Step 3: Extract genome
  // ---------------------------------------------------------------------------

  const updateExtractStep = (idx: number, update: Partial<StepState>) =>
    setExtractPipeline((prev) => prev.map((s, i) => (i === idx ? { ...s, ...update } : s)));

  const runExtraction = async () => {
    setExtracting(true);
    setExtractError(null);
    setGenomeResult(null);
    setGenomeYaml("");
    setExtractPipeline([
      { label: "Extracting frames from video", status: "running", message: "" },
      { label: "Analyzing frames with AI vision", status: "idle", message: "" },
      { label: "Building genome document", status: "idle", message: "" },
    ]);

    updateExtractStep(0, { status: "running" });

    try {
      // Simulate frame extraction step, then AI runs
      setTimeout(() => {
        updateExtractStep(0, { status: "done", message: "Frames extracted" });
        updateExtractStep(1, { status: "running", message: "Sending to LLM..." });
      }, 1500);

      const res = await fetch("/api/video-genome/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, user_notes: userNotes }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json();

      if (data.status === "error") {
        updateExtractStep(0, { status: "done" });
        updateExtractStep(1, { status: "error", message: data.error || "Failed" });
        setExtractError(data.error || "Extraction failed");
        setExtracting(false);
        return;
      }

      updateExtractStep(0, { status: "done", message: "Frames extracted" });
      updateExtractStep(1, { status: "done", message: `${data.input_tokens || 0} input tokens` });
      updateExtractStep(2, { status: "done", message: genomeStats(data.genome) });

      setGenomeResult(data.genome);
      // Convert genome to editable YAML text
      const yamlText = jsonToYaml(data.genome);
      setGenomeYaml(yamlText);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed");
      updateExtractStep(0, { status: "error" });
    }

    setExtracting(false);
  };

  // ---------------------------------------------------------------------------
  // Step 4: Commit
  // ---------------------------------------------------------------------------

  const handleCommit = async () => {
    setCommitting(true);
    setCommitError(null);

    try {
      const res = await fetch("/api/video-genome/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: videoId,
          genome: genomeResult,
          application_name: applicationName,
        }),
      });
      const data = await res.json();
      if (data.status === "error") {
        setCommitError(data.error || "Commit failed");
      } else {
        setCommitResult(data);
      }
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "Commit failed");
    }

    setCommitting(false);
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const genomeStats = (genome: any) => {
    if (!genome?.genome_document) return "Genome built";
    const gd = genome.genome_document;
    return `${gd.objects?.length || 0} objects, ${gd.fields?.length || 0} fields, ${gd.workflows?.length || 0} workflows`;
  };

  const jsonToYaml = (obj: any, indent = 0): string => {
    // Simple JSON-to-readable-text for review (not full YAML, just readable)
    return JSON.stringify(obj, null, 2);
  };

  const canAdvance = () => {
    if (step === 1) return !!videoId;
    if (step === 2) return !!selectedGithub && applicationName.trim().length > 0;
    if (step === 3) return !!genomeResult;
    return false;
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
          <Video className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Video Genome Capture</h1>
          <p className="text-sm text-gray-500">Extract application genome from screen recordings</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {WIZARD_STEPS.map((ws, idx) => (
          <div key={ws.id} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                step === ws.id
                  ? "bg-orange-100 text-orange-700 border border-orange-200"
                  : step > ws.id
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-gray-100 text-gray-400 border border-gray-200"
              }`}
            >
              {step > ws.id ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-white flex items-center justify-center text-[10px] border border-current">
                  {ws.id}
                </span>
              )}
              {ws.label}
            </div>
            {idx < WIZARD_STEPS.length - 1 && (
              <div className={`w-6 h-px ${step > ws.id ? "bg-green-300" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Upload Video */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-orange-500" />
              Upload Screen Recording
            </h2>

            {!videoFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
              >
                <Video className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600 font-medium">Click to select a video file</p>
                <p className="text-xs text-gray-400 mt-1">Accepts .mp4, .mov, .webm (up to 500 MB)</p>
              </div>
            ) : (
              <div className="space-y-4">
                {videoUrl && (
                  <div className="rounded-xl overflow-hidden border border-gray-200 bg-black">
                    <video src={videoUrl} controls className="w-full max-h-[360px] object-contain" />
                  </div>
                )}
                <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-orange-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{videoFile.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(videoFile.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {videoId ? (
                      <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        Uploaded
                      </span>
                    ) : (
                      <button onClick={handleUpload} disabled={uploading}
                        className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2">
                        {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Upload</>}
                      </button>
                    )}
                    <button onClick={() => { setVideoFile(null); setVideoUrl(null); setVideoId(null); }}
                      className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Change</button>
                  </div>
                </div>
                {uploadError && (
                  <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{uploadError}</span>
                  </div>
                )}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".mp4,.mov,.webm" className="hidden" onChange={handleFileSelect} />
          </div>

          {/* Notes */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes (optional)</h3>
            <p className="text-xs text-gray-500 mb-3">Provide context about the software shown in the video.</p>
            <textarea value={userNotes} onChange={(e) => setUserNotes(e.target.value)}
              placeholder="e.g. This is a walkthrough of the ServiceNow ITSM module showing incident management workflows..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 resize-none"
              rows={3} />
          </div>
        </div>
      )}

      {/* Step 2: Select GitHub Target */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-orange-500" />
              Select GitHub Repository
            </h2>
            {loadingIntegrations ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading integrations...
              </div>
            ) : integrations.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No GitHub integrations found.</p>
                <p className="text-xs mt-1">Configure a GitHub integration in Settings first.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {integrations.map((intg) => {
                  const selected = selectedGithub?.id === intg.id;
                  return (
                    <button key={intg.id} onClick={() => setSelectedGithub(intg)}
                      className={`flex items-center gap-4 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                        selected ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selected ? "bg-orange-100" : "bg-gray-100"}`}>
                        <GitBranch className={`w-5 h-5 ${selected ? "text-orange-600" : "text-gray-500"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{intg.name}</p>
                        <p className="text-xs text-gray-500 truncate">{intg.config?.default_repository || intg.config?.org || ""}</p>
                      </div>
                      {selected && <CheckCircle2 className="w-5 h-5 text-orange-500 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Application Name</h3>
            <p className="text-xs text-gray-500 mb-3">Name for the genome folder structure in the repository.</p>
            <input type="text" value={applicationName} onChange={(e) => setApplicationName(e.target.value)}
              placeholder="e.g. ServiceNow ITSM"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300" />
          </div>
        </div>
      )}

      {/* Step 3: Extract Genome */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Dna className="w-5 h-5 text-orange-500" />
              Extract Genome
            </h2>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">Video</p>
                <p className="text-sm font-medium text-gray-900 truncate">{videoFile?.name}</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">Application</p>
                <p className="text-sm font-medium text-gray-900">{applicationName}</p>
              </div>
            </div>

            {/* Extract button */}
            {!extracting && !genomeResult && (
              <button onClick={runExtraction}
                className="w-full py-3 bg-orange-500 text-white font-medium rounded-xl hover:bg-orange-600 transition-colors flex items-center justify-center gap-2">
                <Play className="w-5 h-5" />
                Extract Genome
              </button>
            )}

            {/* Pipeline */}
            {(extracting || genomeResult || extractError) && (
              <div className="space-y-3 mt-4">
                {extractPipeline.map((ps, idx) => (
                  <div key={idx} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    ps.status === "running" ? "border-orange-200 bg-orange-50"
                    : ps.status === "done" ? "border-green-200 bg-green-50"
                    : ps.status === "error" ? "border-red-200 bg-red-50"
                    : "border-gray-200 bg-gray-50"
                  }`}>
                    {ps.status === "running" && <Loader2 className="w-5 h-5 text-orange-500 animate-spin flex-shrink-0" />}
                    {ps.status === "done" && <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />}
                    {ps.status === "error" && <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
                    {ps.status === "idle" && <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />}
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${
                        ps.status === "running" ? "text-orange-700" : ps.status === "done" ? "text-green-700" : ps.status === "error" ? "text-red-700" : "text-gray-400"
                      }`}>{ps.label}</p>
                      {ps.message && <p className="text-xs text-gray-500 mt-0.5">{ps.message}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {extractError && !extracting && (
              <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{extractError}</span>
              </div>
            )}

            {/* Extraction result preview */}
            {genomeResult && !extracting && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">Genome Extracted</span>
                </div>
                <div className="flex gap-4 text-xs text-green-700">
                  <span>{genomeResult.genome_document?.objects?.length || 0} objects</span>
                  <span>{genomeResult.genome_document?.fields?.length || 0} fields</span>
                  <span>{genomeResult.genome_document?.workflows?.length || 0} workflows</span>
                  <span>{genomeResult.genome_document?.relationships?.length || 0} relationships</span>
                </div>
                <p className="text-xs text-green-600 mt-2">Click Next to review and edit before committing.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Review & Commit */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Eye className="w-5 h-5 text-orange-500" />
              Review Extracted Genome
            </h2>

            {/* Genome stats */}
            {genomeResult && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Application", value: genomeResult.application_name || applicationName },
                  { label: "Vendor", value: genomeResult.vendor || "—" },
                  { label: "Objects", value: genomeResult.genome_document?.objects?.length || 0 },
                  { label: "Workflows", value: genomeResult.genome_document?.workflows?.length || 0 },
                ].map((s, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-gray-500">{s.label}</p>
                    <p className="text-sm font-semibold text-gray-900">{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Editable genome JSON */}
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                <Pencil className="w-3 h-3" /> Genome Document (editable)
              </p>
              <span className="text-[10px] text-gray-400">{genomeYaml.length} chars</span>
            </div>
            <textarea
              value={genomeYaml}
              onChange={(e) => {
                setGenomeYaml(e.target.value);
                try {
                  setGenomeResult(JSON.parse(e.target.value));
                } catch { /* keep old result if invalid */ }
              }}
              className="w-full h-80 font-mono text-xs border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 resize-y bg-gray-50"
            />

            {/* Summary */}
            {genomeResult?.summary && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-medium text-blue-800 mb-1">AI Summary</p>
                <p className="text-sm text-blue-700">{genomeResult.summary}</p>
              </div>
            )}
          </div>

          {/* Commit section */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-orange-500" />
              Commit to GitHub
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Commits the genome to <strong>{selectedGithub?.config?.default_repository || selectedGithub?.name}</strong> as <strong>{applicationName}</strong>.
            </p>

            {commitResult ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">Committed Successfully</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-green-600">Files</p>
                    <p className="text-lg font-semibold text-green-900">{commitResult.file_count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-green-600">Files</p>
                    <div className="text-xs text-green-700 mt-1 space-y-0.5">
                      {(commitResult.files_pushed || []).slice(0, 8).map((f: string, i: number) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3" />
                          <span className="font-mono truncate">{f.split("/").pop()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {commitResult.repo_url && (
                  <a href={commitResult.repo_url} target="_blank" rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
                    <GitBranch className="w-4 h-4" /> View in GitHub
                  </a>
                )}
              </div>
            ) : (
              <>
                <button onClick={handleCommit} disabled={committing || !genomeResult}
                  className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {committing ? <><Loader2 className="w-5 h-5 animate-spin" /> Committing...</> : <><Save className="w-5 h-5" /> Commit to GitHub</>}
                </button>
                {commitError && (
                  <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{commitError}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8">
        <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || committing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {step < 4 && (
          <button onClick={() => setStep((s) => Math.min(4, s + 1))} disabled={!canAdvance()}
            className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Next <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
