import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  Search,
  Calendar,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { useTenants } from "../context/TenantContext";
import { getAllUCRuns, type UseCaseRunResponse } from "../services/api";

type StatusFilter = "all" | "completed" | "running" | "failed";
type DateFilter = "all" | "today" | "yesterday" | "last7days";

export default function RunsPage() {
  const navigate = useNavigate();
  const { currentTenantId } = useTenants();
  const [runs, setRuns] = useState<UseCaseRunResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const fetchRuns = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const data = await getAllUCRuns(currentTenantId);
      setRuns(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Filter runs
  const filteredRuns = useMemo(() => {
    let filtered = runs;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (run) =>
          run.run_id.toLowerCase().includes(query) ||
          run.use_case_name.toLowerCase().includes(query) ||
          run.tenant_id.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((run) => run.status === statusFilter);
    }

    if (dateFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter((run) => {
        const runDate = new Date(run.started_at);
        const diffDays = Math.floor(
          (now.getTime() - runDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        switch (dateFilter) {
          case "today":
            return diffDays === 0;
          case "yesterday":
            return diffDays === 1;
          case "last7days":
            return diffDays <= 7;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [runs, searchQuery, statusFilter, dateFilter]);

  // Status counts
  const statusCounts = useMemo(() => {
    return {
      all: runs.length,
      completed: runs.filter((r) => r.status === "completed").length,
      running: runs.filter((r) => r.status === "running" || r.status === "queued").length,
      failed: runs.filter((r) => r.status === "failed").length,
    };
  }, [runs]);

  const formatLatency = (ms: number) => {
    if (!ms) return "—";
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
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
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Runs</h1>
          <p className="text-sm text-gray-600">
            Execution history of all agent runs across tenants and use cases.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          {/* Search and Date Filter Row */}
          <div className="flex gap-4">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by run ID, tenant, or use case..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Date Filter */}
            <div className="relative min-w-[180px]">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                className="appearance-none w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last7days">Last 7 days</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                statusFilter === "all"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              All
              <span className="ml-2 text-xs opacity-75">
                {statusCounts.all}
              </span>
            </button>
            <button
              onClick={() => setStatusFilter("completed")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                statusFilter === "completed"
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Completed
              <span className="ml-2 text-xs opacity-75">
                {statusCounts.completed}
              </span>
            </button>
            <button
              onClick={() => setStatusFilter("running")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                statusFilter === "running"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Running
              <span className="ml-2 text-xs opacity-75">
                {statusCounts.running}
              </span>
            </button>
            <button
              onClick={() => setStatusFilter("failed")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                statusFilter === "failed"
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Failed
              <span className="ml-2 text-xs opacity-75">
                {statusCounts.failed}
              </span>
            </button>
          </div>
        </div>

        {/* Results count */}
        <div className="mb-4">
          <p className="text-sm text-gray-600">
            Showing {filteredRuns.length} of {runs.length} runs
          </p>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Run ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Use Case
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Steps
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Started
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRuns.length > 0 ? (
                filteredRuns.map((run) => (
                  <tr
                    key={run.run_id}
                    onClick={() => navigate(`/runs/${run.run_id}`)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <code className="text-sm font-mono text-gray-900">
                        {run.run_id}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">{run.use_case_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={run.status === "queued" ? "pending" : run.status} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{run.steps.length}</span>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-sm font-mono text-gray-600">
                        {formatLatency(run.total_latency_ms)}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 font-mono">
                        {formatDate(run.started_at)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-gray-400" />
                      </div>
                      <h3 className="text-sm font-medium text-gray-900 mb-1">
                        No runs found
                      </h3>
                      <p className="text-sm text-gray-500">
                        {runs.length === 0
                          ? "Execute a use case from the Agent Console to create runs."
                          : "Try adjusting your search or filters"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
