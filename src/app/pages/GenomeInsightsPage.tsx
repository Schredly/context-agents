import { useState, useEffect } from "react";
import {
  TrendingDown,
  Package,
  Workflow as WorkflowIcon,
  Trophy,
  Loader2,
} from "lucide-react";
import { getGenomes, type GenomeResponse } from "../services/api";

const vendorColors: Record<string, string> = {
  ServiceNow: "bg-teal-500",
  Salesforce: "bg-blue-500",
  Jira: "bg-indigo-500",
  Zendesk: "bg-amber-500",
  Workday: "bg-purple-500",
};

const vendorChartColors: Record<string, string> = {
  ServiceNow: "#14b8a6",
  Salesforce: "#3b82f6",
  Jira: "#6366f1",
  Zendesk: "#f59e0b",
  Workday: "#a855f7",
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

export default function GenomeInsightsPage() {
  const [genomes, setGenomes] = useState<GenomeResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGenomes("acme")
      .then(setGenomes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center py-20">
        <Loader2 className="w-6 h-6 text-gray-400 mx-auto mb-2 animate-spin" />
        <p className="text-sm text-gray-500">Loading insights...</p>
      </div>
    );
  }

  if (genomes.length === 0) {
    return (
      <div className="p-8 text-center py-20">
        <p className="text-sm text-gray-500">No genomes captured yet. Capture one to see insights.</p>
      </div>
    );
  }

  // Compute all metrics from live data
  const totalObjects = genomes.reduce((s, g) => s + g.object_count, 0);
  const totalWorkflows = genomes.reduce((s, g) => s + g.workflow_count, 0);
  const totalLegacy = genomes.reduce((s, g) => s + g.legacy_cost, 0);
  const totalMigrated = genomes.reduce((s, g) => s + g.migrated_cost, 0);

  const genomesWithCosts = genomes.filter((g) => g.legacy_cost > 0);
  const avgSavings = genomesWithCosts.length > 0
    ? genomesWithCosts.reduce((s, g) => s + ((g.legacy_cost - g.migrated_cost) / g.legacy_cost) * 100, 0) / genomesWithCosts.length
    : 0;

  const largest = [...genomes].sort((a, b) => b.object_count - a.object_count)[0];

  // Vendor distribution
  const vendorCounts: Record<string, number> = {};
  genomes.forEach((g) => { vendorCounts[g.vendor] = (vendorCounts[g.vendor] || 0) + 1; });
  const vendorEntries = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1]);

  // Workflow complexity buckets
  const complexityBuckets = [
    { label: "Simple (< 30)", min: 0, max: 30, color: "bg-emerald-500" },
    { label: "Moderate (30–60)", min: 30, max: 60, color: "bg-amber-500" },
    { label: "Complex (60+)", min: 60, max: Infinity, color: "bg-red-500" },
  ];
  const complexityCounts = complexityBuckets.map((bucket) => ({
    ...bucket,
    count: genomes.filter((g) => g.workflow_count >= bucket.min && g.workflow_count < bucket.max).length,
  }));
  const maxComplexity = Math.max(...complexityCounts.map((b) => b.count), 1);

  // Migration savings by app (only those with cost data)
  const savingsByApp = genomesWithCosts
    .map((g) => ({
      name: g.application_name,
      savings: ((g.legacy_cost - g.migrated_cost) / g.legacy_cost) * 100,
      saved: g.legacy_cost - g.migrated_cost,
    }))
    .sort((a, b) => b.savings - a.savings);
  const maxSavings = Math.max(...savingsByApp.map((s) => s.savings), 1);

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-[1800px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Genome Insights</h1>
          <p className="text-sm text-gray-600">
            Live analytics across {genomes.length} captured application genome{genomes.length !== 1 ? "s" : ""}.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <TrendingDown className="w-4 h-4 text-emerald-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase">Avg Migration Savings</span>
            </div>
            <p className="text-3xl font-semibold text-emerald-600">{avgSavings.toFixed(1)}%</p>
            <p className="text-xs text-gray-500 mt-1">{formatCurrency(totalLegacy - totalMigrated)} total saved</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Package className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase">Total Objects</span>
            </div>
            <p className="text-3xl font-semibold text-gray-900">{totalObjects.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">across {genomes.length} genomes</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-purple-50 rounded-lg">
                <WorkflowIcon className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase">Total Workflows</span>
            </div>
            <p className="text-3xl font-semibold text-gray-900">{totalWorkflows.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">{genomes.length > 0 ? (totalWorkflows / genomes.length).toFixed(0) : 0} avg per genome</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Trophy className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase">Largest Application</span>
            </div>
            <p className="text-base font-semibold text-gray-900 mb-1 truncate">{largest.application_name}</p>
            <p className="text-xs text-gray-500">{largest.object_count} objects &middot; {largest.workflow_count} workflows</p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* Vendor Distribution */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Vendor Distribution</h2>
            <div className="flex items-center gap-6">
              <div className="relative w-32 h-32 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-full h-full">
                  {(() => {
                    const total = vendorEntries.reduce((s, [, c]) => s + c, 0);
                    let offset = 0;
                    return vendorEntries.map(([vendor, count]) => {
                      const pct = (count / total) * 100;
                      const circle = (
                        <circle key={vendor} cx="18" cy="18" r="15.915" fill="none"
                          stroke={vendorChartColors[vendor] || "#9ca3af"} strokeWidth="3.5"
                          strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={`${-offset}`} strokeLinecap="round" />
                      );
                      offset += pct;
                      return circle;
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-lg font-semibold text-gray-900">{genomes.length}</p>
                    <p className="text-[10px] text-gray-500">genomes</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 flex-1">
                {vendorEntries.map(([vendor, count]) => (
                  <div key={vendor} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${vendorColors[vendor] || "bg-gray-400"}`} />
                      <span className="text-sm text-gray-700">{vendor}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Workflow Complexity */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Workflow Complexity</h2>
            <div className="space-y-4 mt-2">
              {complexityCounts.map((bucket) => (
                <div key={bucket.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-gray-700">{bucket.label}</span>
                    <span className="text-sm font-semibold text-gray-900">{bucket.count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div className={`${bucket.color} h-3 rounded-full transition-all`}
                      style={{ width: `${(bucket.count / maxComplexity) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">Based on workflow count per genome</p>
          </div>

          {/* Migration Savings */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Migration Savings by Application</h2>
            {savingsByApp.length > 0 ? (
              <div className="space-y-4 mt-2">
                {savingsByApp.map((app) => (
                  <div key={app.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-700 truncate mr-2">{app.name}</span>
                      <span className="text-sm font-semibold text-emerald-600 whitespace-nowrap">{app.savings.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div className="bg-emerald-500 h-3 rounded-full transition-all"
                        style={{ width: `${(app.savings / maxSavings) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">{formatCurrency(app.saved)} saved annually</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">Add cost data to genomes to see savings</p>
            )}
          </div>
        </div>

        {/* Cost Comparison Table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Cost Comparison by Application</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Application</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Legacy Cost</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Migrated Cost</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Savings</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Objects</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Workflows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {genomes.map((g) => {
                const pct = g.legacy_cost > 0
                  ? (((g.legacy_cost - g.migrated_cost) / g.legacy_cost) * 100).toFixed(1)
                  : "0.0";
                return (
                  <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{g.application_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{g.vendor}</td>
                    <td className="px-6 py-4 text-right text-sm font-mono text-gray-900">{formatCurrency(g.legacy_cost)}</td>
                    <td className="px-6 py-4 text-right text-sm font-mono text-gray-900">{formatCurrency(g.migrated_cost)}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-semibold text-emerald-600">{pct}%</span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-mono text-gray-900">{g.object_count.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-sm font-mono text-gray-900">{g.workflow_count}</td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-medium">
                <td className="px-6 py-4 text-sm font-semibold text-gray-900">Total</td>
                <td className="px-6 py-4 text-sm text-gray-600">{vendorEntries.length} vendors</td>
                <td className="px-6 py-4 text-right text-sm font-mono font-semibold text-gray-900">{formatCurrency(totalLegacy)}</td>
                <td className="px-6 py-4 text-right text-sm font-mono font-semibold text-gray-900">{formatCurrency(totalMigrated)}</td>
                <td className="px-6 py-4 text-right">
                  <span className="text-sm font-semibold text-emerald-600">
                    {totalLegacy > 0 ? (((totalLegacy - totalMigrated) / totalLegacy) * 100).toFixed(1) : "0.0"}%
                  </span>
                </td>
                <td className="px-6 py-4 text-right text-sm font-mono font-semibold text-gray-900">{totalObjects.toLocaleString()}</td>
                <td className="px-6 py-4 text-right text-sm font-mono font-semibold text-gray-900">{totalWorkflows}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
