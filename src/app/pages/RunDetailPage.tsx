import { useParams, useNavigate } from "react-router";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Hash, Calendar, Loader2 } from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { TraceStep } from "../components/TraceStep";
import { CancelRunButton } from "../components/CancelRunButton";
import { useTenants } from "../context/TenantContext";
import { getUCRun, cancelUCRun, type UseCaseRunResponse } from "../services/api";

export default function RunDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentTenantId } = useTenants();
  const [run, setRun] = useState<UseCaseRunResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRun = useCallback(async () => {
    if (!currentTenantId || !id) return;
    setLoading(true);
    try {
      const data = await getUCRun(currentTenantId, id);
      setRun(data);
    } catch {
      // Run not found
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, id]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  const formatLatency = (ms: number | null) => {
    if (ms == null || ms === 0) return "—";
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <div className="max-w-[1600px] mx-auto">
          <button
            onClick={() => navigate("/runs")}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Runs
          </button>
          <p className="text-sm text-gray-500">Run not found.</p>
        </div>
      </div>
    );
  }

  const handleCancelRun = async () => {
    if (!currentTenantId || !run) return;
    try {
      await cancelUCRun(currentTenantId, run.run_id);
      fetchRun();
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-[1600px] mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate("/runs")}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Runs
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-semibold text-gray-900 font-mono">
                  {run.run_id}
                </h1>
                <StatusBadge status={run.status === "queued" ? "pending" : run.status} />
              </div>
              <p className="text-sm text-gray-600">{run.use_case_name}</p>
            </div>
            {/* Cancel Run Button - Only show if run is active */}
            {(run.status === "running" || run.status === "queued") && (
              <CancelRunButton onCancel={handleCancelRun} />
            )}
          </div>

          {/* Metadata Row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Hash className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Tenant
                </p>
              </div>
              <p className="text-sm font-medium text-gray-900">
                {run.tenant_id}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Started
                </p>
              </div>
              <p className="text-sm text-gray-900 font-mono">
                {formatDate(run.started_at)}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Completed
                </p>
              </div>
              <p className="text-sm text-gray-900 font-mono">
                {formatDate(run.completed_at)}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Hash className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Use Case
                </p>
              </div>
              <p className="text-sm font-medium text-gray-900">
                {run.use_case_name}
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-4 gap-6">
          {/* Main Section - Execution Timeline */}
          <div className="col-span-3">
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 mb-6">
                Execution Timeline
              </h2>

              {run.steps.length > 0 ? (
                <div className="relative space-y-4">
                  {run.steps.map((step, index) => (
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
                      isLast={index === run.steps.length - 1}
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
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">
                  No execution steps recorded.
                </p>
              )}
            </div>
          </div>

          {/* Right Sidebar - Run Summary */}
          <div className="col-span-1">
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm sticky top-8">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                Run Summary
              </h2>

              <div className="space-y-4">
                {/* Total Steps */}
                <div className="pb-4 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1 tracking-wide">
                    Total Steps
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {run.steps.length}
                  </p>
                </div>

                {/* Total Latency */}
                <div className="pb-4 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1 tracking-wide">
                    Total Latency
                  </p>
                  <p className="text-2xl font-semibold text-gray-900 font-mono">
                    {formatLatency(run.total_latency_ms)}
                  </p>
                </div>

                {/* Total Tokens */}
                <div className="pb-4 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1 tracking-wide">
                    Total Tokens
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {run.total_tokens.toLocaleString()}
                  </p>
                </div>

                {/* Final Result */}
                {run.final_result && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2 tracking-wide">
                      Final Result
                    </p>
                    <div className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-200">
                      {run.final_result}
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
