import { useState, useMemo, useEffect, useCallback } from "react";
import {
  ChevronDown,
  X,
  Clock,
  Zap,
  Calendar,
  Loader2,
} from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { useTenants } from "../context/TenantContext";
import {
  getAllUCRuns,
  getUseCases,
  getSkills,
  type UseCaseRunResponse,
  type UseCaseRunStepResponse,
} from "../services/api";

// Flattened trace entry for the table
interface TraceEntry {
  id: string;
  step: number;
  runId: string;
  tenant: string;
  useCase: string;
  skill: string;
  tool: string;
  model: string;
  latency: string;
  tokens: number;
  status: string;
  timestamp: string;
  skillInstructions: string;
  toolRequestPayload: Record<string, unknown> | null;
  toolResponse: Record<string, unknown> | null;
  llmOutput: string;
}

type FilterState = {
  useCase: string;
  skill: string;
  status: string;
  dateRange: string;
};

const statusOptions = ["All", "completed", "running", "failed", "pending"];
const dateRangeOptions = ["All time", "Today", "Yesterday", "Last 7 days"];

export default function ObservabilityPage() {
  const { currentTenantId, currentTenant } = useTenants();
  const [loading, setLoading] = useState(true);
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [useCaseNames, setUseCaseNames] = useState<string[]>([]);
  const [skillNames, setSkillNames] = useState<string[]>([]);

  const [filters, setFilters] = useState<FilterState>({
    useCase: "All",
    skill: "All",
    status: "All",
    dateRange: "All time",
  });
  const [selectedTrace, setSelectedTrace] = useState<TraceEntry | null>(null);

  const formatLatency = (ms: number | null) => {
    if (ms == null || ms === 0) return "—";
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  const fetchData = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const [runs, useCases, skills] = await Promise.all([
        getAllUCRuns(currentTenantId),
        getUseCases(currentTenantId),
        getSkills(currentTenantId),
      ]);

      // Build filter options
      setUseCaseNames(useCases.map((uc) => uc.name));
      setSkillNames(skills.map((sk) => sk.name));

      // Flatten runs into trace entries
      const entries: TraceEntry[] = [];
      for (const run of runs) {
        for (const step of run.steps) {
          entries.push({
            id: `${run.run_id}_${step.step_index}`,
            step: step.step_index + 1,
            runId: run.run_id,
            tenant: currentTenant?.name ?? run.tenant_id,
            useCase: run.use_case_name,
            skill: step.skill_name,
            tool: step.tools.join(", ") || "—",
            model: step.model || "—",
            latency: formatLatency(step.latency_ms),
            tokens: step.tokens,
            status: step.status,
            timestamp: step.started_at
              ? new Date(step.started_at).toLocaleString()
              : new Date(run.started_at).toLocaleString(),
            skillInstructions: step.instructions,
            toolRequestPayload: step.tool_request_payload,
            toolResponse: step.tool_response,
            llmOutput: step.llm_output,
          });
        }
      }
      setTraces(entries);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, currentTenant?.name]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter traces
  const filteredTraces = useMemo(() => {
    return traces.filter((trace) => {
      if (filters.useCase !== "All" && trace.useCase !== filters.useCase)
        return false;
      if (filters.skill !== "All" && trace.skill !== filters.skill)
        return false;
      if (filters.status !== "All" && trace.status !== filters.status)
        return false;
      return true;
    });
  }, [traces, filters]);

  const updateFilter = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            Observability Trace Explorer
          </h1>
          <p className="text-sm text-gray-600">
            Explore and analyze execution traces across all runs and use cases.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-4 gap-4">
              {/* Use Case Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Use Case
                </label>
                <div className="relative">
                  <select
                    value={filters.useCase}
                    onChange={(e) => updateFilter("useCase", e.target.value)}
                    className="appearance-none w-full bg-white border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="All">All</option>
                    {useCaseNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Skill Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Skill
                </label>
                <div className="relative">
                  <select
                    value={filters.skill}
                    onChange={(e) => updateFilter("skill", e.target.value)}
                    className="appearance-none w-full bg-white border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="All">All</option>
                    {skillNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Status
                </label>
                <div className="relative">
                  <select
                    value={filters.status}
                    onChange={(e) => updateFilter("status", e.target.value)}
                    className="appearance-none w-full bg-white border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Date Range Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Date Range
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <select
                    value={filters.dateRange}
                    onChange={(e) => updateFilter("dateRange", e.target.value)}
                    className="appearance-none w-full bg-white border border-gray-200 rounded-lg pl-10 pr-10 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {dateRangeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="mb-4">
          <p className="text-sm text-gray-600">
            Showing {filteredTraces.length} of {traces.length} trace steps
          </p>
        </div>

        {/* Main Table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Step
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Run ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Skill
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tool
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Latency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tokens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTraces.length > 0 ? (
                  filteredTraces.map((trace) => (
                    <tr
                      key={trace.id}
                      onClick={() => setSelectedTrace(trace)}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-gray-900">
                          {trace.step}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <code className="text-sm font-mono text-blue-600">
                          {trace.runId}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">
                          {trace.skill}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">
                          {trace.tool}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        <code className="text-sm font-mono text-gray-600">
                          {trace.latency}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {trace.tokens.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={trace.status as any} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <p className="text-sm text-gray-500">
                        {traces.length === 0
                          ? "No trace data yet. Execute a use case to generate traces."
                          : "No traces match the current filters."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {selectedTrace && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setSelectedTrace(null)}
          />

          {/* Drawer */}
          <div className="fixed right-0 top-0 bottom-0 w-[600px] bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Trace Detail
                </h2>
                <p className="text-sm text-gray-600 font-mono">
                  {selectedTrace.runId} / Step {selectedTrace.step}
                </p>
              </div>
              <button
                onClick={() => setSelectedTrace(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Overview */}
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">
                  Overview
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Tenant</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedTrace.tenant}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Use Case</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedTrace.useCase}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Skill</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedTrace.skill}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Model</span>
                    <code className="text-sm font-mono text-gray-900">
                      {selectedTrace.model}
                    </code>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Timestamp</span>
                    <code className="text-sm font-mono text-gray-600">
                      {selectedTrace.timestamp}
                    </code>
                  </div>
                </div>
              </div>

              {/* Metrics */}
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">
                  Metrics
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-500 uppercase">
                        Latency
                      </span>
                    </div>
                    <code className="text-lg font-semibold font-mono text-gray-900">
                      {selectedTrace.latency}
                    </code>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-500 uppercase">
                        Tokens
                      </span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900">
                      {selectedTrace.tokens.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Skill Instructions */}
              {selectedTrace.skillInstructions && (
                <div>
                  <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">
                    Skill Instructions
                  </h3>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 leading-relaxed">
                    {selectedTrace.skillInstructions}
                  </div>
                </div>
              )}

              {/* Tool Request Payload */}
              {selectedTrace.toolRequestPayload && (
                <div>
                  <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">
                    Tool Request Payload
                  </h3>
                  <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                    {JSON.stringify(selectedTrace.toolRequestPayload, null, 2)}
                  </pre>
                </div>
              )}

              {/* Tool Response */}
              {selectedTrace.toolResponse && (
                <div>
                  <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">
                    Tool Response
                  </h3>
                  <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                    {JSON.stringify(selectedTrace.toolResponse, null, 2)}
                  </pre>
                </div>
              )}

              {/* LLM Output */}
              {selectedTrace.llmOutput && (
                <div>
                  <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">
                    LLM Output
                  </h3>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-gray-900 leading-relaxed">
                    {selectedTrace.llmOutput}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
