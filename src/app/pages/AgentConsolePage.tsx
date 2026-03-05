import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import {
  ChevronDown,
  Play,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { RunCard } from "../components/RunCard";
import { TraceStep } from "../components/TraceStep";
import { CancelRunButton } from "../components/CancelRunButton";
import { useTenants } from "../context/TenantContext";
import {
  getUseCases,
  runUseCase,
  getAllUCRuns,
  connectUCRunEvents,
  cancelUCRun,
  type UseCaseResponse,
  type UseCaseRunResponse,
  type UseCaseRunStepResponse,
} from "../services/api";

type RunMode = "use-case" | "ask-agent";

export default function AgentConsolePage() {
  const { tenants, currentTenantId, setCurrentTenantId } = useTenants();
  const navigate = useNavigate();

  const [runMode, setRunMode] = useState<RunMode>("use-case");
  const [useCases, setUseCases] = useState<UseCaseResponse[]>([]);
  const [selectedUseCaseId, setSelectedUseCaseId] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [recentRuns, setRecentRuns] = useState<UseCaseRunResponse[]>([]);
  const [traceSteps, setTraceSteps] = useState<UseCaseRunStepResponse[]>([]);
  const [activeRunStatus, setActiveRunStatus] = useState<string>("");
  const activeRunIdRef = useRef<string | null>(null);

  // Fetch use cases when tenant changes
  const fetchUseCases = useCallback(async () => {
    if (!currentTenantId) return;
    try {
      const ucs = await getUseCases(currentTenantId);
      setUseCases(ucs);
      if (ucs.length > 0 && !selectedUseCaseId) {
        setSelectedUseCaseId(ucs[0].id);
      }
    } catch {
      // ignore
    }
  }, [currentTenantId, selectedUseCaseId]);

  // Fetch recent runs when tenant changes
  const fetchRecentRuns = useCallback(async () => {
    if (!currentTenantId) return;
    try {
      const runs = await getAllUCRuns(currentTenantId);
      setRecentRuns(runs.slice(0, 5));
    } catch {
      // ignore
    }
  }, [currentTenantId]);

  useEffect(() => {
    fetchUseCases();
    fetchRecentRuns();
  }, [fetchUseCases, fetchRecentRuns]);

  const handleRunUseCase = async () => {
    if (!currentTenantId || !selectedUseCaseId) return;
    setIsExecuting(true);
    setTraceSteps([]);
    setActiveRunStatus("running");

    try {
      const run = await runUseCase(currentTenantId, selectedUseCaseId);
      activeRunIdRef.current = run.run_id;

      // Subscribe to SSE events
      connectUCRunEvents(
        currentTenantId,
        run.run_id,
        (step) => {
          setTraceSteps((prev) => [...prev, step]);
        },
        (completedRun) => {
          setActiveRunStatus(completedRun.status);
          setIsExecuting(false);
          activeRunIdRef.current = null;
          fetchRecentRuns();
        },
        (cancelledRun) => {
          setActiveRunStatus("cancelled");
          setIsExecuting(false);
          activeRunIdRef.current = null;
          fetchRecentRuns();
        },
      );
    } catch {
      setIsExecuting(false);
      setActiveRunStatus("failed");
      activeRunIdRef.current = null;
    }
  };

  const handleCancelRun = async () => {
    if (!currentTenantId || !activeRunIdRef.current) return;
    try {
      await cancelUCRun(currentTenantId, activeRunIdRef.current);
    } catch {
      // SSE will handle the state update
    }
  };

  const handleAskAgent = () => {
    // For now, same as run use case
    handleRunUseCase();
  };

  const formatLatency = (ms: number | null) => {
    if (ms == null) return "—";
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="p-8 h-screen flex flex-col bg-gray-50">
      <div className="max-w-[1800px] mx-auto w-full flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">
            Agent Console
          </h1>

          {/* Controls */}
          <div className="flex items-center gap-4">
            {/* Tenant Selector */}
            <div className="relative">
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5 tracking-wide">
                Tenant
              </label>
              <div className="relative">
                <select
                  value={currentTenantId ?? ""}
                  onChange={(e) => setCurrentTenantId(e.target.value)}
                  className="appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[200px] shadow-sm"
                >
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Run Mode Selector */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5 tracking-wide">
                Run Mode
              </label>
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                <button
                  onClick={() => setRunMode("use-case")}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    runMode === "use-case"
                      ? "bg-gray-900 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Use Case
                </button>
                <button
                  onClick={() => setRunMode("ask-agent")}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    runMode === "ask-agent"
                      ? "bg-gray-900 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Ask Agent
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="flex-1 grid grid-cols-5 gap-6 min-h-0">
          {/* LEFT PANEL - 40% (2 columns) */}
          <div className="col-span-2 flex flex-col space-y-4">
            {/* Execution Input Card */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                Execution Input
              </h2>

              <div className="space-y-4">
                {/* Use Case Dropdown */}
                {runMode === "use-case" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Select Use Case
                    </label>
                    <div className="relative">
                      <select
                        value={selectedUseCaseId}
                        onChange={(e) => setSelectedUseCaseId(e.target.value)}
                        className="appearance-none w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                      >
                        {useCases.length === 0 && (
                          <option value="">No use cases configured</option>
                        )}
                        {useCases.map((uc) => (
                          <option key={uc.id} value={uc.id}>
                            {uc.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Optional Prompt Input */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {runMode === "use-case"
                      ? "Optional Prompt (Override)"
                      : "Agent Query"}
                  </label>
                  <textarea
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder={
                      runMode === "use-case"
                        ? "Add custom instructions or override use case prompt..."
                        : "Ask the agent anything..."
                    }
                    className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none shadow-sm"
                    rows={4}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  {runMode === "use-case" ? (
                    <button
                      onClick={handleRunUseCase}
                      disabled={isExecuting || !selectedUseCaseId}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Run Use Case
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleAskAgent}
                      disabled={isExecuting || !promptInput.trim()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4" />
                          Ask Agent
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Runs Card */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm flex-1 overflow-hidden flex flex-col">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                Recent Runs
              </h2>
              <div className="space-y-2 overflow-y-auto">
                {recentRuns.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No runs yet. Execute a use case to get started.
                  </p>
                ) : (
                  recentRuns.map((run) => (
                    <RunCard
                      key={run.run_id}
                      runId={run.run_id}
                      useCase={run.use_case_name}
                      status={run.status as any}
                      duration={formatLatency(run.total_latency_ms)}
                      timestamp={new Date(run.started_at).toLocaleString()}
                      onClick={() => navigate(`/runs/${run.run_id}`)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL - 60% (3 columns) */}
          <div className="col-span-3 flex flex-col">
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm flex-1 overflow-hidden flex flex-col">
              <h2 className="text-sm font-semibold text-gray-900 mb-6">
                Execution Trace
              </h2>

              {/* Timeline */}
              <div className="flex-1 overflow-y-auto">
                {traceSteps.length > 0 ? (
                  <div className="relative">
                    <div className="space-y-4">
                      {traceSteps.map((step, index) => (
                        <TraceStep
                          key={step.step_index}
                          step={step.step_index + 1}
                          skillName={step.skill_name}
                          model={step.model || "—"}
                          tools={step.tools}
                          latency={formatLatency(step.latency_ms)}
                          tokens={step.tokens}
                          status={step.status as any}
                          resultSummary={step.result_summary}
                          skillInstructions={step.instructions}
                          toolRequestPayload={step.tool_request_payload}
                          toolResponse={step.tool_response}
                          llmOutput={step.llm_output}
                          isLast={index === traceSteps.length - 1}
                          toolCalls={step.tool_calls?.map((tc) => ({
                            name: tc.name,
                            status: tc.status === "not_implemented" ? "pending" as const : tc.status as any,
                            latency: tc.latency_ms < 1000 ? `${tc.latency_ms}ms` : `${(tc.latency_ms / 1000).toFixed(1)}s`,
                            request: tc.request,
                            response: tc.response,
                          }))}
                        />
                      ))}
                    </div>

                    {/* Running indicator + cancel button */}
                    {isExecuting && (
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Executing next step...
                        </div>
                        <CancelRunButton onCancel={handleCancelRun} />
                      </div>
                    )}

                    {/* Completed indicator */}
                    {activeRunStatus === "completed" && !isExecuting && (
                      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                        Execution completed successfully.
                      </div>
                    )}

                    {/* Cancelled indicator */}
                    {activeRunStatus === "cancelled" && !isExecuting && (
                      <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                        Execution was cancelled.
                      </div>
                    )}

                    {/* Failed indicator */}
                    {activeRunStatus === "failed" && !isExecuting && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                        Execution failed.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-center">
                    <div>
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Play className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-500">
                        Run a use case or ask the agent to see execution trace
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
