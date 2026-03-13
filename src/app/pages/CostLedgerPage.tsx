import { useState, useMemo, useEffect } from "react";
import {
  DollarSign,
  Coins,
  TrendingUp,
  Trophy,
  ChevronDown,
  X,
  Clock,
} from "lucide-react";
import { useTenants } from "../context/TenantContext";
import { TenantFilter, type TenantFilterValue } from "../components/TenantFilter";
import { getLLMUsageLedger, getLLMUsageSummary } from "../services/api";
import type { LLMUsageRow, LLMUsageSummary } from "../services/api";

type TimeFilter = "1h" | "24h" | "7d" | "30d" | "custom";
type GroupBy = "none" | "model" | "useCase" | "tenant" | "skill";

export default function CostLedgerPage() {
  const { currentTenantId } = useTenants();
  const [filterTenant, setFilterTenant] = useState<TenantFilterValue>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("24h");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [selectedExecution, setSelectedExecution] = useState<LLMUsageRow | null>(null);
  const [ledgerData, setLedgerData] = useState<LLMUsageRow[]>([]);
  const [summaryMetrics, setSummaryMetrics] = useState<LLMUsageSummary>({
    totalCost: 0,
    totalTokens: 0,
    avgCostPerRun: 0,
    executionCount: 0,
    uniqueRuns: 0,
    avgTokensPerExecution: 0,
    mostExpensiveUseCase: "N/A",
    mostExpensiveUseCaseCost: 0,
  });

  useEffect(() => {
    const tenantId = currentTenantId || "acme";
    getLLMUsageLedger(tenantId, timeFilter, groupBy, filterTenant)
      .then(setLedgerData)
      .catch(() => setLedgerData([]));
    getLLMUsageSummary(tenantId, timeFilter, filterTenant)
      .then(setSummaryMetrics)
      .catch(() => {});
  }, [currentTenantId, filterTenant, timeFilter, groupBy]);

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            Cost Ledger
          </h1>
          <p className="text-sm text-gray-600">
            Financial transaction ledger showing LLM usage and cost across the
            system.
          </p>
          <div className="mt-2">
            <TenantFilter value={filterTenant} onChange={setFilterTenant} />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          {/* Total Cost (24h) */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-green-50 rounded-lg">
                <DollarSign className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase">
                Total Cost ({timeFilter})
              </span>
            </div>
            <p className="text-3xl font-semibold text-gray-900">
              ${summaryMetrics.totalCost.toFixed(4)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {summaryMetrics.executionCount} executions
            </p>
          </div>

          {/* Total Tokens */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Coins className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase">
                Total Tokens ({timeFilter})
              </span>
            </div>
            <p className="text-3xl font-semibold text-gray-900">
              {summaryMetrics.totalTokens.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {summaryMetrics.avgTokensPerExecution.toLocaleString()} avg per execution
            </p>
          </div>

          {/* Average Cost Per Run */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-purple-50 rounded-lg">
                <TrendingUp className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase">
                Avg Cost Per Run
              </span>
            </div>
            <p className="text-3xl font-semibold text-gray-900">
              ${summaryMetrics.avgCostPerRun.toFixed(4)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {summaryMetrics.uniqueRuns} unique runs
            </p>
          </div>

          {/* Most Expensive Use Case */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Trophy className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase">
                Most Expensive Use Case
              </span>
            </div>
            <p className="text-base font-semibold text-gray-900 mb-1 truncate">
              {summaryMetrics.mostExpensiveUseCase}
            </p>
            <p className="text-xs text-gray-500">
              ${summaryMetrics.mostExpensiveUseCaseCost.toFixed(4)} total
            </p>
          </div>
        </div>

        {/* Time Filters */}
        <div className="mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 mr-2">
                Time Range:
              </span>
              {(["1h", "24h", "7d", "30d", "custom"] as TimeFilter[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeFilter(tf)}
                  className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                    timeFilter === tf
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {tf === "1h" ? "Last Hour" : tf === "24h" ? "24 Hours" : tf === "7d" ? "7 Days" : tf === "30d" ? "30 Days" : "Custom Range"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grouping Controls */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Group by:</span>
            <div className="relative">
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="none">None</option>
                <option value="model">Model</option>
                <option value="useCase">Use Case</option>
                <option value="tenant">Tenant</option>
                <option value="skill">Skill</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <p className="text-sm text-gray-600">
            {ledgerData.length}{" "}
            {groupBy === "none" ? "transactions" : "groups"}
          </p>
        </div>

        {/* Ledger Table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Use Case
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Skill
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tokens
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Latency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Run ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ledgerData.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-500">
                      No LLM usage data yet. Run an agent query to generate cost data.
                    </td>
                  </tr>
                )}
                {ledgerData.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => !item.isGroup && setSelectedExecution(item)}
                    className={`transition-colors ${
                      item.isGroup
                        ? "bg-gray-50 font-medium cursor-default"
                        : "hover:bg-gray-50 cursor-pointer"
                    }`}
                  >
                    <td className="px-6 py-4">
                      <code className="text-xs font-mono text-gray-600">
                        {item.timestamp}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">
                        {item.tenant}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">
                        {item.useCase}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">
                        {item.skill}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">
                        {item.model}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-mono text-gray-900">
                        {item.tokens.toLocaleString()}
                        {item.isGroup && item.count && (
                          <span className="text-xs text-gray-500 ml-1">
                            ({item.count})
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-semibold font-mono text-gray-900">
                        ${item.cost.toFixed(4)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-sm font-mono text-gray-600">
                        {item.latency}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs font-mono text-blue-600">
                        {item.runId}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Execution Detail Drawer */}
      {selectedExecution && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setSelectedExecution(null)}
          />

          {/* Drawer */}
          <div className="fixed right-0 top-0 bottom-0 w-[600px] bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Execution Trace
                </h2>
                <p className="text-sm text-gray-600 font-mono">
                  {selectedExecution.runId}
                </p>
              </div>
              <button
                onClick={() => setSelectedExecution(null)}
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
                    <span className="text-sm text-gray-600">Timestamp</span>
                    <code className="text-sm font-mono text-gray-900">
                      {selectedExecution.timestamp}
                    </code>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Tenant</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedExecution.tenant}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Use Case</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedExecution.useCase}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Skill</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedExecution.skill}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Model</span>
                    <code className="text-sm font-mono text-gray-900">
                      {selectedExecution.model}
                    </code>
                  </div>
                </div>
              </div>

              {/* Cost & Performance Metrics */}
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">
                  Cost & Performance
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-500 uppercase">
                        Cost
                      </span>
                    </div>
                    <p className="text-lg font-semibold font-mono text-gray-900">
                      ${selectedExecution.cost.toFixed(4)}
                    </p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Coins className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-500 uppercase">
                        Tokens
                      </span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900">
                      {selectedExecution.tokens.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-500 uppercase">
                        Latency
                      </span>
                    </div>
                    <code className="text-lg font-semibold font-mono text-gray-900">
                      {selectedExecution.latency}
                    </code>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-500 uppercase">
                        Cost/Token
                      </span>
                    </div>
                    <p className="text-lg font-semibold font-mono text-gray-900">
                      ${selectedExecution.tokens > 0
                        ? (selectedExecution.cost / selectedExecution.tokens).toFixed(6)
                        : "0.000000"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">
                  Additional Information
                </h3>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
                  <p className="mb-2">
                    This execution was part of the{" "}
                    <span className="font-semibold">
                      {selectedExecution.useCase}
                    </span>{" "}
                    workflow.
                  </p>
                  <p className="mb-2">
                    The <span className="font-semibold">{selectedExecution.skill}</span> skill
                    was executed using the{" "}
                    <code className="bg-white px-1 py-0.5 rounded text-xs font-mono">
                      {selectedExecution.model}
                    </code>{" "}
                    model.
                  </p>
                  <p>
                    Total processing time:{" "}
                    <code className="font-mono">{selectedExecution.latency}</code>
                  </p>
                </div>
              </div>

              {/* Pricing Breakdown */}
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">
                  Pricing Breakdown
                </h3>
                <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-gray-200">
                        <td className="px-4 py-3 text-gray-600">Model</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">
                          {selectedExecution.model}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-4 py-3 text-gray-600">Token Count</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">
                          {selectedExecution.tokens.toLocaleString()}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-4 py-3 text-gray-600">
                          Rate per Token
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">
                          ${selectedExecution.tokens > 0
                            ? (selectedExecution.cost / selectedExecution.tokens).toFixed(6)
                            : "0.000000"}
                        </td>
                      </tr>
                      <tr className="bg-gray-100">
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          Total Cost
                        </td>
                        <td className="px-4 py-3 text-right font-semibold font-mono text-gray-900">
                          ${selectedExecution.cost.toFixed(4)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
