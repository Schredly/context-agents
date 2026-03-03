import { ArrowUpRight, ArrowDownRight, Minus, AlertCircle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useTenants } from '../context/TenantContext';
import {
  getObservabilitySummary,
  getObservabilityTrends,
  getObservabilityRuns,
  type ObservabilitySummaryResponse,
  type ObservabilityTrendPoint,
  type ObservabilityTrendsResponse,
  type RunTelemetryResponse,
} from '../services/api';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SparklineProps {
  data: number[];
  color?: string;
}

function Sparkline({ data, color = '#3b82f6' }: SparklineProps) {
  if (data.length < 2) return null;
  const width = 120;
  const height = 32;
  const padding = 2;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  change?: { value: string; trend: 'up' | 'down' | 'neutral' };
  subtext?: string;
  sparklineData?: number[];
  sparklineColor?: string;
}

function MetricCard({ label, value, change, subtext, sparklineData, sparklineColor }: MetricCardProps) {
  const getTrendIcon = () => {
    if (!change) return null;
    switch (change.trend) {
      case 'up':
        return <ArrowUpRight className="w-3 h-3" />;
      case 'down':
        return <ArrowDownRight className="w-3 h-3" />;
      case 'neutral':
        return <Minus className="w-3 h-3" />;
    }
  };

  const getTrendColor = () => {
    if (!change) return '';
    switch (change.trend) {
      case 'up':
        return 'text-green-600 bg-green-50';
      case 'down':
        return 'text-red-600 bg-red-50';
      case 'neutral':
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="bg-white border border-border rounded-lg p-6 shadow-sm">
      <div className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">{label}</div>
      <div className="flex items-baseline gap-3 mb-2">
        <div className="text-3xl">{value}</div>
        {change && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${getTrendColor()}`}>
            {getTrendIcon()}
            {change.value}
          </span>
        )}
      </div>
      {sparklineData && sparklineData.length >= 2 && (
        <div className="mb-2">
          <Sparkline data={sparklineData} color={sparklineColor} />
        </div>
      )}
      {subtext && <div className="text-xs text-muted-foreground">{subtext}</div>}
    </div>
  );
}

function MetricCardSkeleton() {
  return (
    <div className="bg-white border border-border rounded-lg p-6 shadow-sm animate-pulse">
      <div className="h-3 w-24 bg-gray-200 rounded mb-3" />
      <div className="h-8 w-20 bg-gray-200 rounded mb-2" />
      <div className="h-4 w-28 bg-gray-100 rounded" />
    </div>
  );
}

interface CompactMetricProps {
  label: string;
  value: string;
}

function CompactMetric({ label, value }: CompactMetricProps) {
  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">{label}</div>
      <div className="text-2xl tabular-nums">{value}</div>
    </div>
  );
}

interface CorrelationCellProps {
  label: string;
  percentage: string;
  shade: 'high' | 'medium' | 'low' | 'lowest';
}

function CorrelationCell({ label, percentage, shade }: CorrelationCellProps) {
  const getShadeColor = () => {
    switch (shade) {
      case 'high':
        return 'bg-green-50 border-green-200';
      case 'medium':
        return 'bg-blue-50 border-blue-200';
      case 'low':
        return 'bg-yellow-50 border-yellow-200';
      case 'lowest':
        return 'bg-red-50 border-red-200';
    }
  };

  return (
    <div className={`border rounded-lg p-4 ${getShadeColor()}`}>
      <div className="text-2xl mb-1 tabular-nums">{percentage}</div>
      <div className="text-xs text-muted-foreground leading-snug">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, suffix = '', decimals = 1): string {
  if (n == null) return '--';
  return `${Number(n.toFixed(decimals))}${suffix}`;
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '--';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '--';
  return `${(n * 100).toFixed(1)}%`;
}

function trendVal(p: ObservabilityTrendPoint, key: string): number | null {
  switch (key) {
    case 'runs': return p.runs;
    case 'success_rate': return p.success_rate ?? null;
    case 'avg_confidence': return p.avg_confidence ?? null;
    case 'fallback_rate': return p.fallback_rate ?? null;
    case 'doc_hit_rate': return p.doc_hit_rate ?? null;
    case 'avg_duration_ms': return p.avg_duration_ms ?? null;
    default: return null;
  }
}

function computeChange(
  trendPoints: ObservabilityTrendPoint[],
  key: string,
): { value: string; trend: 'up' | 'down' | 'neutral' } | undefined {
  if (!trendPoints || trendPoints.length < 4) return undefined;
  const mid = Math.floor(trendPoints.length / 2);
  const firstHalf = trendPoints.slice(0, mid);
  const secondHalf = trendPoints.slice(mid);

  const avg = (arr: ObservabilityTrendPoint[]) => {
    const vals = arr.map((p) => trendVal(p, key)).filter((v): v is number => v != null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const a = avg(firstHalf);
  const b = avg(secondHalf);
  if (a == null || b == null) return undefined;
  const diff = b - a;
  const pct = a !== 0 ? (diff / Math.abs(a)) * 100 : 0;
  const sign = pct >= 0 ? '+' : '';
  const trend = pct > 1 ? 'up' : pct < -1 ? 'down' : 'neutral';
  return { value: `${sign}${pct.toFixed(1)}%`, trend };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ObservabilityPage() {
  const { currentTenantId } = useTenants();
  const [dateRange, setDateRange] = useState<'7' | '30'>('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<ObservabilitySummaryResponse | null>(null);
  const [trends, setTrends] = useState<ObservabilityTrendsResponse | null>(null);
  const [runs, setRuns] = useState<RunTelemetryResponse[]>([]);

  const fetchData = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, t, r] = await Promise.all([
        getObservabilitySummary(currentTenantId),
        getObservabilityTrends(currentTenantId),
        getObservabilityRuns(currentTenantId, 50),
      ]);
      setSummary(s);
      setTrends(t);
      setRuns(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load observability data');
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived trend points for the selected window
  const trendPoints = trends ? (dateRange === '7' ? trends.last_7d : trends.last_30d) : [];

  // Sparkline extractors
  const sparkline = (key: string): number[] =>
    trendPoints
      .map((p) => trendVal(p, key))
      .filter((v): v is number => v != null);

  const runSparkline = trendPoints.map((p) => p.runs);

  // Correlation matrix — derive from runs list
  const feedbackRuns = runs.filter((r) => r.confidence != null);
  const totalFb = feedbackRuns.length || 1;
  const hiConfPos = feedbackRuns.filter((r) => (r.confidence ?? 0) >= 0.7 && r.status === 'completed').length;
  const hiConfNeg = feedbackRuns.filter((r) => (r.confidence ?? 0) >= 0.7 && r.status === 'failed').length;
  const loConfPos = feedbackRuns.filter((r) => (r.confidence ?? 0) < 0.7 && r.status === 'completed').length;
  const loConfNeg = feedbackRuns.filter((r) => (r.confidence ?? 0) < 0.7 && r.status === 'failed').length;

  // Recent errors
  const recentErrors = runs
    .filter((r) => r.status === 'failed')
    .slice(0, 3);

  // No tenant selected
  if (!currentTenantId) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <p className="text-muted-foreground">Select a tenant to view observability data.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl mb-1">Observability</h1>
          <p className="text-sm text-muted-foreground">
            AI Agent utilization, quality, and performance signals
          </p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as '7' | '30')}
          className="px-3 py-2 border border-border rounded-md text-sm bg-white hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white border border-border rounded-lg p-6 shadow-sm animate-pulse">
              <div className="h-4 w-28 bg-gray-200 rounded mb-4" />
              <div className="h-6 w-16 bg-gray-200 rounded mb-4" />
              <div className="h-6 w-16 bg-gray-200 rounded" />
            </div>
            <div className="bg-white border border-border rounded-lg p-6 shadow-sm animate-pulse">
              <div className="h-4 w-28 bg-gray-200 rounded mb-4" />
              <div className="h-6 w-16 bg-gray-200 rounded mb-4" />
              <div className="h-6 w-16 bg-gray-200 rounded" />
            </div>
          </div>
        </>
      ) : summary ? (
        <>
          {/* Section 1 — Impact Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              label="Total Runs"
              value={(dateRange === '7' ? summary.runs_last_7d : summary.runs_last_30d).toLocaleString()}
              change={computeChange(trendPoints, 'runs')}
              sparklineData={runSparkline}
              sparklineColor="#3b82f6"
            />
            <MetricCard
              label="Avg Confidence"
              value={fmtPct(summary.avg_confidence)}
              change={computeChange(trendPoints, 'avg_confidence')}
              subtext="Across completed runs"
              sparklineData={sparkline('avg_confidence')}
              sparklineColor="#8b5cf6"
            />
            <MetricCard
              label="Avg Resolution Time"
              value={fmtMs(summary.avg_duration_ms)}
              change={computeChange(trendPoints, 'avg_duration_ms')}
              subtext="End-to-end run duration"
              sparklineData={sparkline('avg_duration_ms')}
              sparklineColor="#06b6d4"
            />
            <MetricCard
              label="Writeback Success"
              value={fmtPct(summary.writeback_success_rate)}
              subtext="ServiceNow updates"
              sparklineColor="#10b981"
            />
          </div>

          {/* Section 2 — Quality Signals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white border border-border rounded-lg p-6 shadow-sm">
              <h2 className="text-sm mb-4">Quality Signals</h2>
              <div>
                <CompactMetric label="Fallback Rate" value={fmtPct(summary.fallback_rate)} />
                <CompactMetric label="Doc Hit Rate" value={fmtPct(summary.doc_hit_rate)} />
              </div>
            </div>
            <div className="bg-white border border-border rounded-lg p-6 shadow-sm">
              <h2 className="text-sm mb-4">Performance</h2>
              <div>
                <CompactMetric label="Avg Duration" value={fmtMs(summary.avg_duration_ms)} />
                <CompactMetric label="P95 Duration" value={fmtMs(summary.p95_duration_ms)} />
              </div>
            </div>
          </div>

          {/* Section 3 — Model & Outcome Correlation */}
          <div className="bg-white border border-border rounded-lg p-6 shadow-sm mb-6">
            <h2 className="text-sm mb-4">Model & Outcome Correlation</h2>
            <div className="grid grid-cols-2 gap-4">
              <CorrelationCell
                label="High Confidence + Completed"
                percentage={fmt((hiConfPos / totalFb) * 100, '%', 1)}
                shade="high"
              />
              <CorrelationCell
                label="High Confidence + Failed"
                percentage={fmt((hiConfNeg / totalFb) * 100, '%', 1)}
                shade="lowest"
              />
              <CorrelationCell
                label="Low Confidence + Completed"
                percentage={fmt((loConfPos / totalFb) * 100, '%', 1)}
                shade="low"
              />
              <CorrelationCell
                label="Low Confidence + Failed"
                percentage={fmt((loConfNeg / totalFb) * 100, '%', 1)}
                shade="medium"
              />
            </div>
          </div>

          {/* Section 4 — Top Classification Paths */}
          <div className="bg-white border border-border rounded-lg p-6 shadow-sm mb-6">
            <h2 className="text-sm mb-4">Top Classification Paths</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-muted-foreground text-left border-b border-border">
                    <th className="pb-3">Classification Path</th>
                    <th className="pb-3 text-right">Runs</th>
                    <th className="pb-3 text-right">Success Rate</th>
                    <th className="pb-3 text-right">Avg Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.top_classification_paths.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No classification data yet.
                      </td>
                    </tr>
                  ) : (
                    summary.top_classification_paths.slice(0, 5).map((item) => (
                      <tr
                        key={item.path}
                        className="border-b border-border last:border-0 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="py-3 text-sm">{item.path}</td>
                        <td className="py-3 text-sm text-right tabular-nums text-muted-foreground">
                          {item.count.toLocaleString()}
                        </td>
                        <td className="py-3 text-sm text-right tabular-nums text-muted-foreground">
                          {fmtPct(item.success_rate)}
                        </td>
                        <td className="py-3 text-sm text-right tabular-nums text-muted-foreground">
                          {fmtPct(item.avg_confidence)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5 — Recent Errors */}
          <div className="bg-white border border-border rounded-lg p-6 shadow-sm">
            <h2 className="text-sm mb-4">Recent Errors</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-muted-foreground text-left border-b border-border">
                    <th className="pb-3">Timestamp</th>
                    <th className="pb-3">Skill</th>
                    <th className="pb-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {recentErrors.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                        No recent errors.
                      </td>
                    </tr>
                  ) : (
                    recentErrors.map((r) => {
                      const failedSkill = r.skills.find((s) => s.status === 'failed');
                      return (
                        <tr key={r.run_id} className="border-b border-border last:border-0">
                          <td className="py-3 text-sm text-muted-foreground tabular-nums">
                            {new Date(r.started_at).toLocaleString()}
                          </td>
                          <td className="py-3 text-sm">
                            {failedSkill ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                                {failedSkill.skill_id}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </td>
                          <td className="py-3 text-sm text-red-600">
                            Run failed{failedSkill ? ` at ${failedSkill.skill_id}` : ''}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {/* Empty state when not loading and no data */}
      {!loading && !error && summary && summary.total_runs === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No runs recorded yet. Create and complete a run to see observability data.
        </div>
      )}
    </div>
  );
}
