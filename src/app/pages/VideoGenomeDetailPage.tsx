import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import {
  Video,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Layers,
  Mic,
  Palette,
  FileText,
  FolderTree,
  GitBranch,
  Save,
  Trash2,
  Code,
  Eye,
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

export default function VideoGenomeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [extraction, setExtraction] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // File viewer
  const [genomeFiles, setGenomeFiles] = useState<GenomeFile[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<"files" | "screens" | "audio">("files");

  // Commit
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [selectedGithub, setSelectedGithub] = useState<Integration | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/video-genome/extractions/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Not found (${r.status})`);
        return r.json();
      })
      .then((data) => {
        setExtraction(data);
        if (data.genome) {
          const files = buildGenomeFiles(data.genome, data.design_tokens, data.ui_analysis);
          setGenomeFiles(files);
        }
        if (data.commit_result?.status === "ok") {
          setCommitResult(data.commit_result);
        }
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
      const appName = extraction.application_name || genome.application_name || "app";
      const res = await fetch("/api/video-genome/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: extraction.video_id,
          genome,
          application_name: appName,
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

  const buildGenomeFiles = (genome: any, designTokens?: any, uiAnalysis?: any[]): GenomeFile[] => {
    const appName = genome.application_name || "app";
    const vendor = genome.vendor || "unknown";
    const slug = appName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
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

    if (designTokens && Object.keys(designTokens).length > 0) {
      files.push({ path: `${base}/design/tokens.json`, content: JSON.stringify(designTokens, null, 2) });
    }
    if (genome.structured_objects?.length) {
      files.push({ path: `${base}/structure/objects_detailed.json`, content: JSON.stringify(genome.structured_objects, null, 2) });
    }
    if (genome.structured_workflows?.length) {
      files.push({ path: `${base}/structure/workflows_detailed.json`, content: JSON.stringify(genome.structured_workflows, null, 2) });
    }
    if (genome.structured_relationships?.length) {
      files.push({ path: `${base}/structure/relationships_detailed.json`, content: JSON.stringify(genome.structured_relationships, null, 2) });
    }
    if (uiAnalysis?.length) {
      for (const screen of uiAnalysis) {
        if (screen.html_skeleton) {
          files.push({ path: `${base}/screens/screen_${screen.screen_index}.html`, content: screen.html_skeleton });
        }
      }
    }
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

  const selectedFile = genomeFiles[selectedFileIdx] || null;
  const genome = extraction?.genome;
  const uiAnalysis = extraction?.ui_analysis || [];
  const audioTranscript = extraction?.audio_transcript;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !extraction) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <button onClick={() => navigate("/genomes/video")} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Video Genomes
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-700">{error || "Extraction not found"}</p>
        </div>
      </div>
    );
  }

  const gd = genome?.genome_document || {};

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/genomes/video")}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <Video className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {extraction.application_name || genome?.application_name || extraction.video_filename || "Video Genome"}
            </h1>
            <p className="text-sm text-gray-500">
              {extraction.vendor || genome?.vendor || ""} · {extraction.video_filename} · {extraction.video_size_mb?.toFixed(1)} MB
            </p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-gray-500 uppercase">Screens</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{extraction.unique_screens || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-gray-500 uppercase">Objects</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{gd.objects?.length || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Code className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-gray-500 uppercase">Fields</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{gd.fields?.length || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Palette className="w-4 h-4 text-pink-500" />
            <span className="text-xs text-gray-500 uppercase">Colors</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{genome?.design_tokens?.colors?.length || extraction.design_tokens?.colors?.length || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500 uppercase">Latency</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{extraction.latency_ms > 0 ? `${(extraction.latency_ms / 1000).toFixed(1)}s` : "—"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Tabs for different views */}
        <div className="lg:col-span-1 space-y-4">
          {/* Tab buttons */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(["files", "screens", "audio"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                {tab === "files" ? "Files" : tab === "screens" ? `Screens (${uiAnalysis.length})` : "Audio"}
              </button>
            ))}
          </div>

          {activeTab === "files" && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {genomeFiles.map((f, i) => (
                <button key={i} onClick={() => setSelectedFileIdx(i)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs border-b border-gray-100 last:border-0 transition-colors ${
                    selectedFileIdx === i ? "bg-orange-50 text-orange-700" : "text-gray-600 hover:bg-gray-50"
                  }`}>
                  <FileText className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate font-mono">{f.path.split("/").pop()}</span>
                </button>
              ))}
            </div>
          )}

          {activeTab === "screens" && (
            <div className="space-y-2">
              {uiAnalysis.map((screen: any, i: number) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-3">
                  <p className="text-xs font-medium text-gray-900 mb-1">Screen {screen.screen_index}</p>
                  <p className="text-[10px] text-gray-500 mb-2">{screen.screen_description}</p>
                  {screen.color_palette?.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-2">
                      {screen.color_palette.slice(0, 8).map((c: any, ci: number) => (
                        <div key={ci} className="flex items-center gap-1" title={c.usage || c.hex}>
                          <div className="w-4 h-4 rounded border border-gray-200" style={{ backgroundColor: c.hex }} />
                          <span className="text-[9px] text-gray-400 font-mono">{c.hex}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 text-[10px] text-gray-400">
                    <span>{screen.components?.length || 0} components</span>
                    <span>{screen.text_labels?.length || 0} labels</span>
                    <span>{screen.interactive_elements?.length || 0} interactive</span>
                  </div>
                </div>
              ))}
              {uiAnalysis.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No screen analysis available</p>
              )}
            </div>
          )}

          {activeTab === "audio" && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              {audioTranscript?.has_audio ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Mic className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-medium text-gray-700">
                      {audioTranscript.duration_sec?.toFixed(1)}s transcribed
                    </span>
                  </div>
                  {audioTranscript.full_text ? (
                    <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                      {audioTranscript.full_text}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Audio detected but no transcription available (requires OpenAI API key)</p>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <Mic className="w-6 h-6 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No audio track detected</p>
                </div>
              )}
            </div>
          )}

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
                    className="text-xs text-green-700 hover:text-green-800 font-medium">
                    View in GitHub
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {loadingIntegrations ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 justify-center py-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                  </div>
                ) : integrations.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center">No GitHub integrations configured</p>
                ) : (
                  integrations.map((intg) => {
                    const sel = selectedGithub?.id === intg.id;
                    return (
                      <button key={intg.id} onClick={() => setSelectedGithub(intg)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                          sel ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:border-gray-300"
                        }`}>
                        <GitBranch className={`w-3.5 h-3.5 ${sel ? "text-orange-600" : "text-gray-400"}`} />
                        <span className="font-medium text-gray-900">{intg.name}</span>
                        {sel && <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 ml-auto" />}
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

        {/* Right: File content viewer */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col" style={{ minHeight: "600px" }}>
          {selectedFile ? (
            <>
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderTree className="w-3.5 h-3.5 text-orange-500" />
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
