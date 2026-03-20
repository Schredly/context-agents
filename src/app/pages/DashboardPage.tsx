import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Building2, Plug, Wrench, Sparkles, Workflow, Zap, Dna, Activity,
  TrendingUp, ArrowRight, DollarSign, Clock, CheckCircle2, AlertCircle,
} from "lucide-react";

interface DashboardData {
  tenants: number;
  integrations: { total: number; enabled: number };
  tools: number;
  skills: number;
  useCases: number;
  actions: number;
  genomes: number;
  llmUsage: { totalCost: number; totalTokens: number; executionCount: number };
}

const API = "/api/admin/acme";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/tenants").then((r) => r.json()),
      fetch(`${API}/integrations/?filter_tenant=all`).then((r) => r.json()),
      fetch(`${API}/tools/catalog`).then((r) => r.json()),
      fetch(`${API}/skills/?filter_tenant=all`).then((r) => r.json()),
      fetch(`${API}/use-cases/?filter_tenant=all`).then((r) => r.json()),
      fetch(`${API}/actions?filter_tenant=all`).then((r) => r.json()),
      fetch(`${API}/genomes`).then((r) => r.json()),
      fetch(`${API}/llm-usage/summary?time_filter=24h`).then((r) => r.json()),
    ])
      .then(([tenants, integrations, tools, skills, useCases, actions, genomes, llm]) => {
        const intList = Array.isArray(integrations) ? integrations : [];
        setData({
          tenants: Array.isArray(tenants) ? tenants.length : 0,
          integrations: {
            total: intList.length,
            enabled: intList.filter((i: any) => i.enabled).length,
          },
          tools: tools?.tools?.length || 0,
          skills: Array.isArray(skills) ? skills.length : 0,
          useCases: Array.isArray(useCases) ? useCases.length : 0,
          actions: Array.isArray(actions) ? actions.length : 0,
          genomes: Array.isArray(genomes) ? genomes.length : 0,
          llmUsage: {
            totalCost: llm?.totalCost || 0,
            totalTokens: llm?.totalTokens || 0,
            executionCount: llm?.executionCount || 0,
          },
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center py-20">
        <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading dashboard...</p>
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    { label: "Tenants", value: data.tenants, icon: Building2, href: "/tenants", color: "text-blue-600 bg-blue-50" },
    { label: "Integrations", value: `${data.integrations.enabled}/${data.integrations.total}`, icon: Plug, href: "/integrations", color: "text-green-600 bg-green-50", sub: "enabled" },
    { label: "Tools", value: data.tools, icon: Wrench, href: "/tools", color: "text-purple-600 bg-purple-50" },
    { label: "Skills", value: data.skills, icon: Sparkles, href: "/skills", color: "text-amber-600 bg-amber-50" },
    { label: "Use Cases", value: data.useCases, icon: Workflow, href: "/use-cases", color: "text-indigo-600 bg-indigo-50" },
    { label: "Actions", value: data.actions, icon: Zap, href: "/actions", color: "text-rose-600 bg-rose-50" },
    { label: "Genomes", value: data.genomes, icon: Dna, href: "/genomes", color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Platform overview and module summary</p>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} to={card.href}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 transition-colors" />
              </div>
              <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-500 mt-1">{card.label}{card.sub ? ` (${card.sub})` : ""}</p>
            </Link>
          );
        })}
      </div>

      {/* LLM Usage + Quick Actions row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* LLM Usage Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-orange-500" />
            <h2 className="text-sm font-semibold text-gray-900">LLM Usage (24h)</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Cost</p>
              <p className="text-lg font-semibold text-gray-900 font-mono">
                ${data.llmUsage.totalCost.toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Tokens</p>
              <p className="text-lg font-semibold text-gray-900 font-mono">
                {data.llmUsage.totalTokens.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Executions</p>
              <p className="text-lg font-semibold text-gray-900 font-mono">
                {data.llmUsage.executionCount}
              </p>
            </div>
          </div>
          <Link to="/observability/cost-ledger" className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 mt-4">
            View Cost Ledger <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            <h2 className="text-sm font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="space-y-2">
            <Link to="/genomes/capture"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-orange-50 hover:border-orange-200 transition-colors group">
              <Dna className="w-4 h-4 text-orange-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Capture Genome</p>
                <p className="text-xs text-gray-500">Extract from ServiceNow</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400" />
            </Link>
            <Link to="/genome-studio"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-orange-50 hover:border-orange-200 transition-colors group">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Genome Studio</p>
                <p className="text-xs text-gray-500">Transform and manage genomes</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400" />
            </Link>
            <Link to="/agentui"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-orange-50 hover:border-orange-200 transition-colors group">
              <Workflow className="w-4 h-4 text-orange-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Agent UI</p>
                <p className="text-xs text-gray-500">Conversational agent interface</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
