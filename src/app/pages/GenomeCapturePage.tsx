import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  X,
  Check,
  Server,
  Cloud,
  Ticket,
  Headset,
  Briefcase,
  Loader2,
  Dna,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  GitBranch,
  Globe,
  Plug,
  Play,
  ChevronRight,
  Plus,
  Circle,
  Search,
  FileCode,
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
  endpoints: Endpoint[];
  connection_status: string;
}

interface Endpoint {
  id: string;
  name: string;
  path: string;
  method: string;
  description: string;
}

interface SnowApplication {
  name: string;
  scope: string;
  vendor: string | null;
  sys_id: string;
}

interface StepState {
  label: string;
  status: "idle" | "running" | "done" | "error";
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const vendorIcons: Record<string, typeof Server> = {
  servicenow: Server,
  salesforce: Cloud,
  jira: Ticket,
  zendesk: Headset,
  workday: Briefcase,
  github: GitBranch,
};

const WIZARD_STEPS = [
  { id: 1, label: "Source Integration" },
  { id: 2, label: "Extraction Target" },
  { id: 3, label: "Genome Scan" },
  { id: 4, label: "Expand & Commit" },
];

const SCAN_DEPTHS = [
  { id: "structure", label: "Structure", description: "Objects, fields, relationships" },
  { id: "config", label: "Config", description: "Structure + configuration details" },
  { id: "full", label: "Full", description: "Structure + config + data samples" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GenomeCapturePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Step 1 — source integration
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [testingSource, setTestingSource] = useState(false);
  const [sourceTestResult, setSourceTestResult] = useState<{ ok: boolean; detail?: string } | null>(null);

  // Step 2 — extraction target
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null);
  const [targetName, setTargetName] = useState("");
  const [scanDepth, setScanDepth] = useState("structure");
  const [addingEndpoint, setAddingEndpoint] = useState(false);
  const [newEpName, setNewEpName] = useState("");
  const [newEpPath, setNewEpPath] = useState("");
  const [newEpDesc, setNewEpDesc] = useState("");
  // Extraction type
  const [extractionType, setExtractionType] = useState<"application" | "service_catalog">("application");
  // Application discovery
  const [applications, setApplications] = useState<SnowApplication[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [appSearch, setAppSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<SnowApplication | null>(null);
  const [appDropdownOpen, setAppDropdownOpen] = useState(false);
  // Catalog discovery
  const [catalogs, setCatalogs] = useState<string[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [selectedCatalog, setSelectedCatalog] = useState<string>("");

  // Step 3 — genome scan (pass 1)
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [scanPipeline, setScanPipeline] = useState<StepState[]>([
    { label: "Integration", status: "idle", message: "Connect to source" },
    { label: "Vendor Adapter", status: "idle", message: "Call extraction endpoint" },
    { label: "Genome Scan Engine", status: "idle", message: "Parse extraction response" },
    { label: "Genome Builder", status: "idle", message: "Build GenomeDocument + GenomeGraph" },
  ]);

  // Step 4 — expand & commit (pass 2)
  const [committing, setCommitting] = useState(false);
  const [commitDone, setCommitDone] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [commitPipeline, setCommitPipeline] = useState<StepState[]>([
    { label: "Vendor Adapter", status: "idle", message: "Expand configuration data" },
    { label: "Genome Builder", status: "idle", message: "Build YAML structure" },
    { label: "GitHub Repo", status: "idle", message: "Commit genome files" },
  ]);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetch(`${API}/integrations/?filter_tenant=all`)
      .then((r) => r.json())
      .then((data: Integration[]) => {
        setIntegrations(data.filter((i) => i.integration_type !== "github"));
      })
      .catch(() => {})
      .finally(() => setLoadingIntegrations(false));
  }, []);

  // Discover applications + catalogs when entering step 2
  useEffect(() => {
    if (step !== 2 || !selectedIntegration) return;
    // Fetch applications
    setLoadingApps(true);
    setApplications([]);
    fetch(`${API}/genomes/discover/applications`)
      .then((r) => r.json())
      .then((data: { applications: SnowApplication[] }) => {
        setApplications(data.applications || []);
      })
      .catch(() => {})
      .finally(() => setLoadingApps(false));
    // Fetch catalogs
    setLoadingCatalogs(true);
    setCatalogs([]);
    fetch(`${API}/genomes/discover/candidates`)
      .then((r) => r.json())
      .then((results: Array<{ candidates: Array<{ name: string; type: string }> }>) => {
        const names: string[] = [];
        for (const disc of results) {
          for (const c of disc.candidates) {
            if (c.type === "catalog" && !names.includes(c.name)) names.push(c.name);
          }
        }
        setCatalogs(names);
      })
      .catch(() => {})
      .finally(() => setLoadingCatalogs(false));
  }, [step, selectedIntegration]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const testSourceConnection = async () => {
    if (!selectedIntegration) return;
    setTestingSource(true);
    setSourceTestResult(null);
    try {
      const r = await fetch(`${API}/integrations/${selectedIntegration.id}/test`, { method: "POST" });
      setSourceTestResult(await r.json());
    } catch {
      setSourceTestResult({ ok: false, detail: "Network error" });
    }
    setTestingSource(false);
  };

  const addEndpoint = async () => {
    if (!selectedIntegration || !newEpName || !newEpPath) return;
    try {
      const r = await fetch(`${API}/integrations/${selectedIntegration.id}/endpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newEpName, path: newEpPath, method: "GET", description: newEpDesc }),
      });
      if (r.ok) {
        const updated = await r.json();
        setSelectedIntegration(updated);
        setIntegrations((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        setAddingEndpoint(false);
        setNewEpName("");
        setNewEpPath("");
        setNewEpDesc("");
      }
    } catch {}
  };

  // ---------------------------------------------------------------------------
  // Pass 1 — Genome Scan
  // ---------------------------------------------------------------------------

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const updateScanStep = (idx: number, update: Partial<StepState>) =>
    setScanPipeline((prev) => prev.map((s, i) => (i === idx ? { ...s, ...update } : s)));

  const runScan = async () => {
    if (!selectedIntegration) return;
    if (extractionType === "application" && !selectedApp) return;
    if (extractionType === "service_catalog" && !selectedCatalog) return;
    const effectiveEndpoint = selectedEndpoint || null;
    const scanTargetName = extractionType === "service_catalog" ? selectedCatalog : (selectedApp?.name || targetName);
    const scanTargetType = extractionType;
    setScanning(true);
    setScanResult(null);
    setScanPipeline([
      { label: "Integration", status: "idle", message: "Connect to source" },
      { label: "Vendor Adapter", status: "idle", message: "Call extraction endpoint" },
      { label: "Genome Scan Engine", status: "idle", message: "Parse extraction response" },
      { label: "Genome Builder", status: "idle", message: "Build GenomeDocument + GenomeGraph" },
    ]);

    // Animate: Integration
    updateScanStep(0, { status: "running", message: `Connecting to ${selectedIntegration.config?.instance_url || selectedIntegration.integration_type}...` });
    await sleep(600);
    updateScanStep(0, { status: "done", message: `Connected to ${selectedIntegration.config?.instance_url || selectedIntegration.integration_type}` });

    // Animate: Vendor Adapter
    const epPath = effectiveEndpoint?.path || `/extract/${(scanTargetName || "app").toLowerCase().replace(/ /g, "_")}`;
    updateScanStep(1, { status: "running", message: `POST ${epPath} (depth: ${scanDepth})...` });

    try {
      const scanBody = {
        integration_id: selectedIntegration.id,
        target_type: scanTargetType,
        target_name: scanTargetName,
        depth: scanDepth,
        scope: selectedApp?.scope || "",
        application: selectedApp?.name || scanTargetName || "",
      };
      console.log("[GenomeCapture] Scan request →", JSON.stringify(scanBody, null, 2));
      const res = await fetch(`${API}/genomes/capture/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanBody),
      });
      const data = await res.json();

      if (data.status !== "ok") {
        updateScanStep(1, { status: "error", message: data.error || "Extraction failed" });
        setScanResult(data);
        setScanning(false);
        return;
      }

      updateScanStep(1, { status: "done", message: `Retrieved ${((data.payload_size || 0) / 1024).toFixed(0)} KB in ${data.latency_ms}ms` });

      // Animate: Genome Scan Engine
      updateScanStep(2, { status: "running", message: "Parsing extraction response..." });
      await sleep(800);
      const summary = data.summary || {};
      updateScanStep(2, { status: "done", message: `${summary.items || 0} items, ${summary.variables || 0} variables, ${summary.choices || 0} choices` });

      // Animate: Genome Builder
      updateScanStep(3, { status: "running", message: "Building GenomeDocument + GenomeGraph..." });
      await sleep(600);
      const objCount = data.genome_document?.objects?.length || 0;
      const wfCount = data.genome_document?.workflows?.length || 0;
      updateScanStep(3, { status: "done", message: `${objCount} objects, ${wfCount} workflows` });

      setScanResult(data);
    } catch (err) {
      updateScanStep(1, { status: "error", message: err instanceof Error ? err.message : "Network error" });
    }
    setScanning(false);
  };

  // ---------------------------------------------------------------------------
  // Pass 2 — Expand & Commit
  // ---------------------------------------------------------------------------

  const updateCommitStep = (idx: number, update: Partial<StepState>) =>
    setCommitPipeline((prev) => prev.map((s, i) => (i === idx ? { ...s, ...update } : s)));

  const runExpandAndCommit = async () => {
    if (!selectedIntegration || !scanResult) return;
    setCommitting(true);
    setCommitResult(null);
    setCommitPipeline([
      { label: "Vendor Adapter", status: "idle", message: "Expand configuration data" },
      { label: "Genome Builder", status: "idle", message: "Build YAML structure" },
      { label: "GitHub Repo", status: "idle", message: "Commit genome files" },
    ]);

    // Animate: Vendor Adapter
    updateCommitStep(0, { status: "running", message: "Expanding configuration and data..." });
    await sleep(500);
    updateCommitStep(0, { status: "done", message: "Configuration expanded from scan result" });

    // Animate: Genome Builder
    updateCommitStep(1, { status: "running", message: "Building YAML + JSON file tree..." });

    try {
      const res = await fetch(`${API}/genomes/capture/expand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integration_id: selectedIntegration.id,
          target_name: selectedApp?.name || selectedCatalog || targetName || "Unknown",
          target_type: extractionType,
          depth: scanDepth,
          raw_extraction: scanResult.raw_vendor_payload || scanResult.raw_extraction || {},
          genome_document: scanResult.genome_document || null,
          genome_graph: scanResult.genome_graph || null,
          normalized_genome: scanResult.normalized_genome || null,
        }),
      });
      const data = await res.json();

      if (data.status !== "ok") {
        updateCommitStep(1, { status: "error", message: data.error || "Expand failed" });
        setCommitResult(data);
        setCommitting(false);
        return;
      }

      updateCommitStep(1, { status: "done", message: `${data.file_count || 0} files generated` });

      // Animate: GitHub Repo
      updateCommitStep(2, { status: "running", message: "Committing to GitHub..." });
      await sleep(400);
      updateCommitStep(2, {
        status: "done",
        message: `${data.files_pushed?.length || 0} files pushed to ${data.repo_url?.replace("https://github.com/", "") || "GitHub"}`,
      });

      setCommitResult(data);
      setCommitDone(true);
    } catch (err) {
      updateCommitStep(1, { status: "error", message: err instanceof Error ? err.message : "Network error" });
    }
    setCommitting(false);
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const canAdvance = () => {
    switch (step) {
      case 1: return selectedIntegration?.enabled;
      case 2:
        return extractionType === "service_catalog" ? !!selectedCatalog : !!selectedApp;
      case 3: return scanResult?.status === "ok";
      default: return false;
    }
  };

  const PipelineStatus = ({ steps }: { steps: StepState[] }) => (
    <div className="bg-gray-50 border border-gray-200 rounded-lg divide-y divide-gray-200">
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <div className="mt-0.5 flex-shrink-0">
            {s.status === "idle" && <Circle className="w-4 h-4 text-gray-300" />}
            {s.status === "running" && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
            {s.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            {s.status === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-medium uppercase tracking-wide ${
              s.status === "done" ? "text-green-700" : s.status === "error" ? "text-red-700" : s.status === "running" ? "text-blue-700" : "text-gray-400"
            }`}>
              {s.label}
            </p>
            <p className={`text-sm mt-0.5 ${
              s.status === "done" ? "text-green-600" : s.status === "error" ? "text-red-600" : s.status === "running" ? "text-blue-600" : "text-gray-400"
            }`}>
              {s.message}
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  const FlowNode = ({ icon: Icon, label, sublabel, active, done, error }: {
    icon: typeof Server; label: string; sublabel?: string; active?: boolean; done?: boolean; error?: boolean;
  }) => (
    <div className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all w-36 ${
      error ? "border-red-400 bg-red-50" : done ? "border-green-400 bg-green-50" : active ? "border-blue-400 bg-blue-50 animate-pulse" : "border-gray-200 bg-white"
    }`}>
      <Icon className={`w-5 h-5 ${error ? "text-red-500" : done ? "text-green-600" : active ? "text-blue-500" : "text-gray-400"}`} />
      <span className="text-[11px] font-medium text-gray-900 text-center leading-tight">{label}</span>
      {sublabel && <span className="text-[9px] text-gray-500 text-center truncate w-full">{sublabel}</span>}
    </div>
  );

  const FlowArrow = ({ done, active }: { done?: boolean; active?: boolean }) => (
    <div className="flex items-center mx-0.5">
      <div className={`w-4 h-0.5 ${done ? "bg-green-400" : active ? "bg-blue-400" : "bg-gray-200"}`} />
      <ChevronRight className={`w-3 h-3 -ml-0.5 ${done ? "text-green-400" : active ? "text-blue-400" : "text-gray-300"}`} />
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loadingIntegrations) {
    return (
      <div className="p-8 text-center py-20">
        <Loader2 className="w-6 h-6 text-gray-400 mx-auto mb-3 animate-spin" />
        <p className="text-sm text-gray-500">Loading integrations...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/genomes")} className="p-2 text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Capture Genome</h1>
              <p className="text-sm text-gray-500 mt-0.5">Extract an application genome from a connected integration</p>
            </div>
          </div>
          <button onClick={() => navigate("/genomes")} className="p-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-8">
          {WIZARD_STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step > s.id ? "bg-green-500 text-white" : step === s.id ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-500"
                }`}>
                  {step > s.id ? <Check className="w-4 h-4" /> : s.id}
                </div>
                <span className={`text-sm ${step >= s.id ? "text-gray-900 font-medium" : "text-gray-400"}`}>{s.label}</span>
              </div>
              {i < WIZARD_STEPS.length - 1 && <div className={`w-8 h-0.5 mx-2 ${step > s.id ? "bg-green-500" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          {/* ============================================================== */}
          {/* STEP 1 — Source Integration                                    */}
          {/* ============================================================== */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Select the source integration to extract from.</p>
              <div className="grid grid-cols-1 gap-3">
                {integrations.map((integ) => {
                  const Icon = vendorIcons[integ.integration_type] || Globe;
                  const sel = selectedIntegration?.id === integ.id;
                  return (
                    <button key={integ.id} onClick={() => { setSelectedIntegration(integ); setSourceTestResult(null); setSelectedEndpoint(null); }}
                      className={`flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-colors ${sel ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${sel ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900 capitalize">{integ.name || integ.integration_type}</span>
                        {integ.config?.instance_url && <p className="text-xs text-gray-500 font-mono mt-0.5">{integ.config.instance_url.replace("https://", "")}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {integ.enabled
                          ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Connected</span>
                          : <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">Not configured</span>}
                        {sel && <Check className="w-5 h-5 text-gray-900" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedIntegration && !selectedIntegration.enabled && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-amber-800">
                    This integration is not configured.{" "}
                    <button onClick={() => navigate(`/integrations/${selectedIntegration.id}`)} className="underline font-medium hover:text-amber-900">Configure it now</button>
                  </p>
                </div>
              )}

              {selectedIntegration?.enabled && (
                <div className="flex items-center gap-3">
                  <button onClick={testSourceConnection} disabled={testingSource}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    {testingSource ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                    Test Connection
                  </button>
                  {sourceTestResult && (
                    <span className={`text-xs flex items-center gap-1 ${sourceTestResult.ok ? "text-green-600" : "text-red-600"}`}>
                      {sourceTestResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      {sourceTestResult.ok ? "Connection successful" : sourceTestResult.detail || "Failed"}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 2 — Extraction Target                                     */}
          {/* ============================================================== */}
          {step === 2 && selectedIntegration && (
            <div className="space-y-5">
              {/* Extraction type toggle */}
              <div>
                <p className="text-sm text-gray-600 mb-3">What do you want to extract?</p>
                <div className="flex gap-2">
                  <button onClick={() => { setExtractionType("application"); setSelectedCatalog(""); setTargetName(""); }}
                    className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 transition-colors ${extractionType === "application" ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <FileCode className={`w-4 h-4 ${extractionType === "application" ? "text-gray-900" : "text-gray-400"}`} />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Application</p>
                      <p className="text-[10px] text-gray-500">Scoped app, tables, scripts</p>
                    </div>
                  </button>
                  <button onClick={() => { setExtractionType("service_catalog"); setSelectedApp(null); setAppSearch(""); setTargetName(""); }}
                    className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 transition-colors ${extractionType === "service_catalog" ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <Globe className={`w-4 h-4 ${extractionType === "service_catalog" ? "text-gray-900" : "text-gray-400"}`} />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Service Catalog</p>
                      <p className="text-[10px] text-gray-500">Catalog items, forms, variables</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Service Catalog selection */}
              {extractionType === "service_catalog" && (
                <div>
                  <p className="text-sm text-gray-600 mb-3">Select a service catalog</p>
                  {loadingCatalogs ? (
                    <div className="flex items-center gap-2 py-4 text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Discovering catalogs from ServiceNow...</span>
                    </div>
                  ) : catalogs.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {catalogs.map((cat) => {
                        const sel = selectedCatalog === cat;
                        return (
                          <button key={cat} onClick={() => { setSelectedCatalog(cat); setTargetName(cat); }}
                            className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ${
                              sel ? "border-teal-600 bg-teal-50" : "border-gray-200 hover:border-gray-300"
                            }`}>
                            <Globe className={`w-4 h-4 flex-shrink-0 ${sel ? "text-teal-600" : "text-gray-400"}`} />
                            <span className="text-sm font-medium text-gray-900">{cat}</span>
                            {sel && <Check className="w-4 h-4 text-teal-600 ml-auto flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs text-amber-700">No catalogs discovered.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Application search typeahead */}
              {extractionType === "application" && (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  Select an application from <span className="font-medium">{selectedIntegration.name || selectedIntegration.integration_type}</span>
                </p>

                {loadingApps ? (
                  <div className="flex items-center gap-2 py-4 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Discovering applications from ServiceNow...</span>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Search input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        value={appSearch}
                        onChange={(e) => { setAppSearch(e.target.value); setAppDropdownOpen(true); }}
                        onFocus={() => setAppDropdownOpen(true)}
                        placeholder={`Search ${applications.length} applications...`}
                        className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      />
                      {selectedApp && (
                        <button onClick={() => { setSelectedApp(null); setAppSearch(""); setTargetName(""); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Selected app badge */}
                    {selectedApp && (
                      <div className="mt-2 flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                        <FileCode className="w-4 h-4 text-teal-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{selectedApp.name}</p>
                          <p className="text-xs text-gray-500 font-mono">{selectedApp.scope}</p>
                        </div>
                        {selectedApp.vendor && (
                          <span className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                            {selectedApp.vendor}
                          </span>
                        )}
                        <CheckCircle2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
                      </div>
                    )}

                    {/* Dropdown results */}
                    {appDropdownOpen && !selectedApp && appSearch.length >= 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                        {(() => {
                          const query = appSearch.toLowerCase();
                          const filtered = applications.filter((a) =>
                            a.name.toLowerCase().includes(query) ||
                            a.scope.toLowerCase().includes(query) ||
                            (a.vendor || "").toLowerCase().includes(query)
                          ).slice(0, 50);

                          if (filtered.length === 0) {
                            return (
                              <div className="p-3 text-sm text-gray-400 text-center">
                                No matching applications
                              </div>
                            );
                          }

                          return filtered.map((a) => (
                            <button
                              key={a.sys_id}
                              onClick={() => {
                                setSelectedApp(a);
                                setAppSearch(a.name);
                                setTargetName(a.name);
                                setAppDropdownOpen(false);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                            >
                              <FileCode className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-900 truncate">{a.name}</p>
                                <p className="text-[10px] text-gray-500 font-mono truncate">{a.scope}</p>
                              </div>
                              {a.vendor && (
                                <span className="text-[10px] text-gray-400 flex-shrink-0">
                                  {a.vendor}
                                </span>
                              )}
                            </button>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* Click outside to close */}
                {appDropdownOpen && (
                  <div className="fixed inset-0 z-0" onClick={() => setAppDropdownOpen(false)} />
                )}
              </div>
              )}

              {/* — end extraction type sections — */}

              {/* Web service endpoint (optional override — application only) */}
              {selectedApp && extractionType === "application" && (
                <div>
                  <p className="text-sm text-gray-600 mb-3">Web service endpoint (optional)</p>
                  <div className="grid grid-cols-1 gap-2">
                    {selectedIntegration.endpoints.map((ep) => {
                      const sel = selectedEndpoint?.id === ep.id;
                      return (
                        <button key={ep.id} onClick={() => setSelectedEndpoint(sel ? null : ep)}
                          className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ${sel ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
                          <Globe className={`w-4 h-4 flex-shrink-0 ${sel ? "text-gray-900" : "text-gray-400"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{ep.name}</p>
                            <p className="text-xs text-gray-500 font-mono truncate">{ep.method} {ep.path}</p>
                          </div>
                          {sel && <Check className="w-4 h-4 text-gray-900 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {!addingEndpoint && (
                    <button onClick={() => setAddingEndpoint(true)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mt-2">
                      <Plus className="w-4 h-4" /> Add endpoint
                    </button>
                  )}

                  {addingEndpoint && (
                    <div className="border border-gray-200 rounded-lg p-4 mt-2 space-y-3">
                      <input value={newEpName} onChange={(e) => setNewEpName(e.target.value)} placeholder="Endpoint name"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                      <input value={newEpPath} onChange={(e) => setNewEpPath(e.target.value)} placeholder="Path (e.g. /api/now/table/...)"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono" />
                      <input value={newEpDesc} onChange={(e) => setNewEpDesc(e.target.value)} placeholder="Description (optional)"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                      <div className="flex gap-2">
                        <button onClick={addEndpoint} disabled={!newEpName || !newEpPath}
                          className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50">Add</button>
                        <button onClick={() => setAddingEndpoint(false)}
                          className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Scan depth */}
              {(selectedApp || selectedCatalog) && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">Scan depth</p>
                  <div className="flex gap-2">
                    {SCAN_DEPTHS.map((d) => (
                      <button key={d.id} onClick={() => setScanDepth(d.id)}
                        className={`flex-1 p-3 rounded-lg border-2 text-center transition-colors ${scanDepth === d.id ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
                        <p className="text-sm font-medium text-gray-900">{d.label}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{d.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Payload preview */}
              {selectedApp && extractionType === "application" && (
                <div>
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Extraction Payload</p>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-auto">
                    <pre className="text-xs font-mono text-emerald-400 whitespace-pre">{JSON.stringify({
                      metadata: { tenant: TENANT, vendor: selectedIntegration.integration_type, application: selectedApp!.scope },
                      target: { type: "application", name: selectedApp!.name, scope: selectedApp!.scope },
                      context: { scan_depth: scanDepth },
                    }, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 3 — Genome Scan (Pass 1)                                  */}
          {/* ============================================================== */}
          {step === 3 && selectedIntegration && (selectedApp || selectedCatalog) && (
            <div className="space-y-6">
              <p className="text-sm text-gray-600">
                Discovery pass — extract genome structure from <strong>{selectedIntegration.name || selectedIntegration.integration_type}</strong> for <strong>{selectedApp?.name || selectedCatalog || targetName || "target"}</strong>.
              </p>

              {/* Pipeline flow diagram */}
              <div className="flex items-center justify-center py-3 overflow-x-auto">
                <FlowNode icon={vendorIcons[selectedIntegration.integration_type] || Globe}
                  label={selectedIntegration.name || selectedIntegration.integration_type}
                  sublabel={selectedIntegration.config?.instance_url?.replace("https://", "")}
                  active={scanPipeline[0].status === "running"} done={scanPipeline[0].status === "done"} error={scanPipeline[0].status === "error"} />
                <FlowArrow done={scanPipeline[1].status === "done"} active={scanPipeline[1].status === "running"} />
                <FlowNode icon={Globe} label="Vendor Adapter" sublabel={selectedEndpoint?.path || `/extract/${(selectedApp?.scope || selectedCatalog || "target").toLowerCase().replace(/ /g, "_")}`}
                  active={scanPipeline[1].status === "running"} done={scanPipeline[1].status === "done"} error={scanPipeline[1].status === "error"} />
                <FlowArrow done={scanPipeline[2].status === "done"} active={scanPipeline[2].status === "running"} />
                <FlowNode icon={Search} label="Genome Scan Engine" sublabel={`depth: ${scanDepth}`}
                  active={scanPipeline[2].status === "running"} done={scanPipeline[2].status === "done"} error={scanPipeline[2].status === "error"} />
                <FlowArrow done={scanPipeline[3].status === "done"} active={scanPipeline[3].status === "running"} />
                <FlowNode icon={Dna} label="Genome Builder"
                  active={scanPipeline[3].status === "running"} done={scanPipeline[3].status === "done"} error={scanPipeline[3].status === "error"} />
              </div>

              {/* Pipeline status */}
              <PipelineStatus steps={scanPipeline} />

              {/* Scan button */}
              {!scanResult && (
                <div className="flex justify-center">
                  <button onClick={runScan} disabled={scanning}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold disabled:opacity-50">
                    {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    {scanning ? "Scanning..." : "Run Genome Scan"}
                  </button>
                </div>
              )}

              {/* Scan result summary */}
              {scanResult?.status === "ok" && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800 font-medium">Genome scan complete</p>
                  <div className="flex gap-6 mt-2 text-xs text-green-700">
                    <span>Objects: {scanResult.genome_document?.objects?.length || 0}</span>
                    <span>Workflows: {scanResult.genome_document?.workflows?.length || 0}</span>
                    <span>Fields: {scanResult.genome_document?.fields?.length || 0}</span>
                    <span>Relationships: {scanResult.genome_document?.relationships?.length || 0}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 4 — Expand & Commit (Pass 2)                              */}
          {/* ============================================================== */}
          {step === 4 && selectedIntegration && scanResult && (
            <div className="space-y-6">
              <p className="text-sm text-gray-600">
                Expand configuration and commit genome to GitHub.
              </p>

              {/* Pipeline flow diagram */}
              <div className="flex items-center justify-center py-3 overflow-x-auto">
                <FlowNode icon={Globe} label="Vendor Adapter" sublabel="Expand config"
                  active={commitPipeline[0].status === "running"} done={commitPipeline[0].status === "done"} error={commitPipeline[0].status === "error"} />
                <FlowArrow done={commitPipeline[1].status === "done"} active={commitPipeline[1].status === "running"} />
                <FlowNode icon={Dna} label="Genome Builder" sublabel="YAML + JSON"
                  active={commitPipeline[1].status === "running"} done={commitPipeline[1].status === "done"} error={commitPipeline[1].status === "error"} />
                <FlowArrow done={commitPipeline[2].status === "done"} active={commitPipeline[2].status === "running"} />
                <FlowNode icon={GitBranch} label="GitHub Repo" sublabel="Commit"
                  active={commitPipeline[2].status === "running"} done={commitPipeline[2].status === "done"} error={commitPipeline[2].status === "error"} />
              </div>

              {/* Pipeline status */}
              <PipelineStatus steps={commitPipeline} />

              {/* Action buttons */}
              {!commitDone && (
                <div className="flex justify-center gap-3">
                  <button onClick={() => navigate("/genomes")}
                    className="px-6 py-2.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium">
                    Cancel
                  </button>
                  <button onClick={runExpandAndCommit} disabled={committing}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-500 font-semibold disabled:opacity-50">
                    {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {committing ? "Executing..." : "Do It!"}
                  </button>
                </div>
              )}

              {/* GitHub result */}
              {commitResult?.status === "ok" && commitResult.repo_url && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-indigo-600" />
                    <a href={commitResult.repo_url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-indigo-700 underline hover:text-indigo-900 font-medium">
                      {commitResult.repo_url.replace("https://github.com/", "")}
                    </a>
                    <span className="text-xs text-indigo-500">— {commitResult.files_pushed?.length || 0} file(s)</span>
                  </div>
                </div>
              )}

              {commitDone && (
                <div className="flex justify-center">
                  <button onClick={() => navigate("/genomes")}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">
                    <Dna className="w-4 h-4" /> View Genomes
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* Navigation footer                                              */}
          {/* ============================================================== */}
          {step < 4 && (
            <div className="flex justify-between items-center pt-6 mt-6 border-t border-gray-100">
              <button onClick={() => step === 1 ? navigate("/genomes") : setStep(step - 1)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                {step === 1 ? "Cancel" : "Back"}
              </button>
              {step < 3 && (
                <button onClick={() => setStep(step + 1)} disabled={!canAdvance()}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50">
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              )}
              {step === 3 && scanResult?.status === "ok" && (
                <button onClick={() => setStep(4)}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                  Expand & Commit <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
