import { Zap, CheckCircle2, Loader2, XCircle, ExternalLink, Activity } from "lucide-react";

export type ToolStatus = "success" | "running" | "error";

export interface ToolCall {
  id: string;
  toolName: string;
  targetSystem: string;
  status: ToolStatus;
  timestamp?: string;
  responseTime?: string;
  statusCode?: number;
}

interface ToolsUsedProps {
  tools: ToolCall[];
  title?: string;
}

export function ToolsUsed({ tools, title = "Tools Used" }: ToolsUsedProps) {
  const getStatusIcon = (status: ToolStatus) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-4 h-4" />;
      case "running":
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case "error":
        return <XCircle className="w-4 h-4" />;
    }
  };

  const getStatusStyles = (status: ToolStatus) => {
    switch (status) {
      case "success":
        return {
          bg: "bg-green-500/10",
          text: "text-green-400",
          border: "border-green-500/30",
          badge: "bg-green-500/20 text-green-300",
        };
      case "running":
        return {
          bg: "bg-blue-500/10",
          text: "text-blue-400",
          border: "border-blue-500/40",
          badge: "bg-blue-500/20 text-blue-300",
        };
      case "error":
        return {
          bg: "bg-red-500/10",
          text: "text-red-400",
          border: "border-red-500/30",
          badge: "bg-red-500/20 text-red-300",
        };
    }
  };

  const getStatusLabel = (status: ToolStatus, statusCode?: number) => {
    if (statusCode) {
      return statusCode.toString();
    }
    switch (status) {
      case "success":
        return "200";
      case "running":
        return "...";
      case "error":
        return "ERR";
    }
  };

  const getSystemColor = (system: string) => {
    const systemLower = system.toLowerCase();
    if (systemLower.includes("servicenow")) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    if (systemLower.includes("google")) return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    if (systemLower.includes("slack")) return "bg-purple-500/10 text-purple-400 border-purple-500/30";
    if (systemLower.includes("jira")) return "bg-indigo-500/10 text-indigo-400 border-indigo-500/30";
    return "bg-gray-500/10 text-gray-400 border-gray-500/30";
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              {title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">External API calls and integrations</p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700">
            <Zap className="w-3 h-3 text-indigo-400" />
            <span className="text-xs text-gray-400">{tools.length} calls</span>
          </div>
        </div>
      </div>

      {/* API Call Log */}
      <div className="divide-y divide-gray-800">
        {tools.map((tool) => {
          const styles = getStatusStyles(tool.status);
          const systemColor = getSystemColor(tool.targetSystem);
          const isRunning = tool.status === "running";

          return (
            <div
              key={tool.id}
              className={`px-4 py-3 hover:bg-gray-800/30 transition-colors ${
                isRunning ? "bg-blue-500/5" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Left: Tool info */}
                <div className="flex-1 min-w-0">
                  {/* Tool name */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <code className="text-sm text-gray-200 font-mono bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                      {tool.toolName}
                    </code>
                    <ExternalLink className="w-3 h-3 text-gray-600" />
                  </div>

                  {/* System and metadata */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${systemColor}`}
                    >
                      {tool.targetSystem}
                    </span>
                    {tool.timestamp && (
                      <span className="text-xs text-gray-500">
                        {tool.timestamp}
                      </span>
                    )}
                    {tool.responseTime && tool.status === "success" && (
                      <span className="text-xs text-gray-500">
                        • {tool.responseTime}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Status */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Status code badge */}
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded ${styles.badge} border ${styles.border} font-mono text-xs`}
                  >
                    {getStatusIcon(tool.status)}
                    <span>{getStatusLabel(tool.status, tool.statusCode)}</span>
                  </div>

                  {/* Running indicator */}
                  {isRunning && (
                    <div className="flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with summary */}
      <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-950/50">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-500">
                {tools.filter((t) => t.status === "success").length} Success
              </span>
            </div>
            {tools.some((t) => t.status === "running") && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-gray-500">
                  {tools.filter((t) => t.status === "running").length} Running
                </span>
              </div>
            )}
            {tools.some((t) => t.status === "error") && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-gray-500">
                  {tools.filter((t) => t.status === "error").length} Failed
                </span>
              </div>
            )}
          </div>
          <span className="text-gray-600">API Call Log</span>
        </div>
      </div>
    </div>
  );
}
