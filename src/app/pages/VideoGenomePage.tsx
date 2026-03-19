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
} from "lucide-react";

const TENANT = "acme";
const API = `/api/admin/${TENANT}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Integration {
  id: string;
  integration_type: string;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
  connection_status: string;
}

interface StepState {
  label: string;
  status: "idle" | "running" | "done" | "error";
  message: string;
}

interface ExtractResult {
  genome: any;
  objects_found: number;
  fields_found: number;
  workflows_found: number;
  frames_extracted: number;
}

interface CommitResult {
  file_count: number;
  repo_url: string;
  branch: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIZARD_STEPS = [
  { id: 1, label: "Upload Video" },
  { id: 2, label: "GitHub Target" },
  { id: 3, label: "Extract & Commit" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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

  // Step 3 — extract & commit
  const [pipeline, setPipeline] = useState<StepState[]>([
    { label: "Extracting frames", status: "idle", message: "" },
    { label: "Analyzing with AI", status: "idle", message: "" },
    { label: "Building genome", status: "idle", message: "" },
    { label: "Committing to GitHub", status: "idle", message: "" },
  ]);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // Load integrations when entering step 2
  useEffect(() => {
    if (step === 2 && integrations.length === 0) {
      fetchIntegrations();
    }
  }, [step]);

  const fetchIntegrations = async () => {
    setLoadingIntegrations(true);
    try {
      const res = await fetch(`${API}/integrations/?filter_tenant=all`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.integrations || [];
      setIntegrations(list.filter((i: Integration) => i.integration_type === "github"));
    } catch {
      setIntegrations([]);
    }
    setLoadingIntegrations(false);
  };

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
      const res = await fetch("/api/video-genome/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.status === "ok") {
        setVideoId(data.video_id);
      } else {
        setUploadError(data.error || "Upload failed");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    }
    setUploading(false);
  };

  // ---------------------------------------------------------------------------
  // Step 3: Extract & Commit pipeline
  // ---------------------------------------------------------------------------

  const updatePipeline = (index: number, update: Partial<StepState>) => {
    setPipeline((prev) => prev.map((s, i) => (i === index ? { ...s, ...update } : s)));
  };

  const runPipeline = async () => {
    setPipelineRunning(true);
    setPipelineError(null);
    setExtractResult(null);
    setCommitResult(null);

    // Reset pipeline
    setPipeline([
      { label: "Extracting frames", status: "running", message: "" },
      { label: "Analyzing with AI", status: "idle", message: "" },
      { label: "Building genome", status: "idle", message: "" },
      { label: "Committing to GitHub", status: "idle", message: "" },
    ]);

    try {
      // Step 1: Extract frames + AI analysis
      updatePipeline(0, { status: "running" });
      updatePipeline(1, { status: "running" });

      const extractRes = await fetch("/api/video-genome/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, user_notes: userNotes }),
      });
      const extractData = await extractRes.json();

      if (extractData.status === "error") {
        updatePipeline(0, { status: "error", message: extractData.error || "Extraction failed" });
        updatePipeline(1, { status: "error" });
        setPipelineError(extractData.error || "Extraction failed");
        setPipelineRunning(false);
        return;
      }

      updatePipeline(0, { status: "done", message: `${extractData.frames_extracted || 0} frames extracted` });
      updatePipeline(1, { status: "done", message: "AI analysis complete" });
      updatePipeline(2, { status: "done", message: `${extractData.objects_found || 0} objects, ${extractData.fields_found || 0} fields, ${extractData.workflows_found || 0} workflows` });

      setExtractResult(extractData);

      // Step 2: Commit to GitHub
      updatePipeline(3, { status: "running" });

      const commitRes = await fetch("/api/video-genome/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genome: extractData.genome,
          application_name: applicationName,
          integration_id: selectedGithub?.id,
        }),
      });
      const commitData = await commitRes.json();

      if (commitData.status === "error") {
        updatePipeline(3, { status: "error", message: commitData.error || "Commit failed" });
        setPipelineError(commitData.error || "Commit failed");
        setPipelineRunning(false);
        return;
      }

      updatePipeline(3, { status: "done", message: `${commitData.file_count || 0} files committed` });
      setCommitResult(commitData);
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : "Pipeline failed");
    }

    setPipelineRunning(false);
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const canAdvance = () => {
    if (step === 1) return !!videoId;
    if (step === 2) return !!selectedGithub && applicationName.trim().length > 0;
    return false;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                step === ws.id
                  ? "bg-orange-100 text-orange-700 border border-orange-200"
                  : step > ws.id
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-gray-100 text-gray-400 border border-gray-200"
              }`}
            >
              {step > ws.id ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-xs border border-current">
                  {ws.id}
                </span>
              )}
              {ws.label}
            </div>
            {idx < WIZARD_STEPS.length - 1 && (
              <div className={`w-8 h-px ${step > ws.id ? "bg-green-300" : "bg-gray-200"}`} />
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
                <p className="text-xs text-gray-400 mt-1">Accepts .mp4, .mov, .webm</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Video preview */}
                {videoUrl && (
                  <div className="rounded-xl overflow-hidden border border-gray-200 bg-black">
                    <video
                      src={videoUrl}
                      controls
                      className="w-full max-h-[360px] object-contain"
                    />
                  </div>
                )}

                {/* File info */}
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
                      <button
                        onClick={handleUpload}
                        disabled={uploading}
                        className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            Upload
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setVideoFile(null);
                        setVideoUrl(null);
                        setVideoId(null);
                      }}
                      className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                    >
                      Change
                    </button>
                  </div>
                </div>

                {uploadError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {uploadError}
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mov,.webm"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Notes */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes (optional)</h3>
            <p className="text-xs text-gray-500 mb-3">
              Provide any context about the software shown in the video — application name, vendor, purpose, etc.
            </p>
            <textarea
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="e.g. This is a walkthrough of the ServiceNow ITSM module showing incident management workflows..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 resize-none"
              rows={3}
            />
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
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading integrations...
              </div>
            ) : integrations.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No GitHub integrations found.</p>
                <p className="text-xs mt-1">Configure a GitHub integration first.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {integrations.map((intg) => {
                  const selected = selectedGithub?.id === intg.id;
                  const repoName = intg.config?.repo || intg.config?.repository || intg.name;
                  return (
                    <button
                      key={intg.id}
                      onClick={() => setSelectedGithub(intg)}
                      className={`flex items-center gap-4 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                        selected
                          ? "border-orange-400 bg-orange-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selected ? "bg-orange-100" : "bg-gray-100"}`}>
                        <GitBranch className={`w-5 h-5 ${selected ? "text-orange-600" : "text-gray-500"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{intg.name}</p>
                        <p className="text-xs text-gray-500 truncate">{repoName}</p>
                      </div>
                      {selected && <CheckCircle2 className="w-5 h-5 text-orange-500 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Application Name */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Application Name</h3>
            <p className="text-xs text-gray-500 mb-3">
              Name of the application being captured (used for folder structure in the repo).
            </p>
            <input
              type="text"
              value={applicationName}
              onChange={(e) => setApplicationName(e.target.value)}
              placeholder="e.g. ServiceNow ITSM"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
            />
          </div>
        </div>
      )}

      {/* Step 3: Extract & Commit */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Dna className="w-5 h-5 text-orange-500" />
              Extract Genome
            </h2>

            {/* Summary of selections */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">Video</p>
                <p className="text-sm font-medium text-gray-900 truncate">{videoFile?.name}</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">Target Repo</p>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {selectedGithub?.config?.repo || selectedGithub?.name}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">Application</p>
                <p className="text-sm font-medium text-gray-900">{applicationName}</p>
              </div>
              {userNotes && (
                <div className="bg-gray-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 truncate">{userNotes}</p>
                </div>
              )}
            </div>

            {/* Start button */}
            {!pipelineRunning && !extractResult && (
              <button
                onClick={runPipeline}
                className="w-full py-3 bg-orange-500 text-white font-medium rounded-xl hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" />
                Extract Genome
              </button>
            )}

            {/* Pipeline steps */}
            {(pipelineRunning || extractResult || pipelineError) && (
              <div className="space-y-3 mt-4">
                {pipeline.map((ps, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                      ps.status === "running"
                        ? "border-orange-200 bg-orange-50"
                        : ps.status === "done"
                        ? "border-green-200 bg-green-50"
                        : ps.status === "error"
                        ? "border-red-200 bg-red-50"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    {ps.status === "running" && <Loader2 className="w-5 h-5 text-orange-500 animate-spin flex-shrink-0" />}
                    {ps.status === "done" && <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />}
                    {ps.status === "error" && <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
                    {ps.status === "idle" && (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        ps.status === "running" ? "text-orange-700" :
                        ps.status === "done" ? "text-green-700" :
                        ps.status === "error" ? "text-red-700" :
                        "text-gray-400"
                      }`}>
                        {ps.label}
                      </p>
                      {ps.message && (
                        <p className="text-xs text-gray-500 mt-0.5">{ps.message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {pipelineError && !pipelineRunning && (
              <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {pipelineError}
              </div>
            )}

            {/* Results */}
            {commitResult && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-green-800 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Genome Captured Successfully
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-green-600 mb-0.5">Files Committed</p>
                    <p className="text-lg font-semibold text-green-900">{commitResult.file_count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-green-600 mb-0.5">Branch</p>
                    <p className="text-sm font-medium text-green-900">{commitResult.branch}</p>
                  </div>
                  {extractResult && (
                    <>
                      <div>
                        <p className="text-xs text-green-600 mb-0.5">Objects Found</p>
                        <p className="text-lg font-semibold text-green-900">{extractResult.objects_found || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-green-600 mb-0.5">Fields Found</p>
                        <p className="text-lg font-semibold text-green-900">{extractResult.fields_found || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-green-600 mb-0.5">Workflows Found</p>
                        <p className="text-lg font-semibold text-green-900">{extractResult.workflows_found || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-green-600 mb-0.5">Frames Extracted</p>
                        <p className="text-lg font-semibold text-green-900">{extractResult.frames_extracted || 0}</p>
                      </div>
                    </>
                  )}
                </div>
                {commitResult.repo_url && (
                  <a
                    href={commitResult.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <GitBranch className="w-4 h-4" />
                    View in GitHub
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-8">
        <button
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        {step < 3 && (
          <button
            onClick={() => setStep((s) => Math.min(3, s + 1))}
            disabled={!canAdvance()}
            className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
