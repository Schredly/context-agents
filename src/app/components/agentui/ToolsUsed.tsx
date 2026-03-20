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
  summary?: string;
}

interface ToolsUsedProps {
  tools: ToolCall[];
  title?: string;
}

export function ToolsUsed({ tools, title = "Tools Used" }: ToolsUsedProps) {
  const getStatusIcon = (status: ToolStatus) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-3.5 h-3.5" />;
      case "running":
        return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
      case "error":
        return <XCircle className="w-3.5 h-3.5" />;
    }
  };

  const getStatusStyles = (status: ToolStatus) => {
    switch (status) {
      case "success":
        return { text: "text-orange-500", badge: "text-orange-500 border-gray-200" };
      case "running":
        return { text: "text-orange-600", badge: "text-orange-600 border-gray-200" };
      case "error":
        return { text: "text-red-400", badge: "text-red-400 border-gray-200" };
    }
  };

  const getStatusLabel = (status: ToolStatus, statusCode?: number) => {
    if (statusCode) return statusCode.toString();
    switch (status) {
      case "success": return "200";
      case "running": return "...";
      case "error": return "ERR";
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-[10px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-gray-900 text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-600" />
              {title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">External API calls and integrations</p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200">
            <Zap className="w-3 h-3 text-gray-500" />
            <span className="text-xs text-gray-500">{tools.length} calls</span>
          </div>
        </div>
      </div>

      {/* API Call Log */}
      <div className="divide-y divide-gray-200">
        {tools.map((tool) => {
          const styles = getStatusStyles(tool.status);
          const isRunning = tool.status === "running";

          return (
            <div
              key={tool.id}
              className={`px-4 py-3 hover:bg-gray-50 transition-colors ${
                isRunning ? "bg-gray-50" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <code className="text-sm text-gray-900 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                      {tool.toolName}
                    </code>
                    <ExternalLink className="w-3 h-3 text-gray-500" />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-600">
                      {tool.targetSystem}
                    </span>
                    {tool.timestamp && (
                      <span className="text-xs text-gray-500">
                        {tool.timestamp}
                      </span>
                    )}
                    {tool.responseTime && tool.status === "success" && (
                      <span className="text-xs text-gray-500">
                        &middot; {tool.responseTime}
                      </span>
                    )}
                  </div>
                  {tool.summary && (
                    <p className="text-xs text-gray-600 mt-1 truncate">{tool.summary}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${styles.badge} font-mono text-xs`}
                  >
                    {getStatusIcon(tool.status)}
                    <span>{getStatusLabel(tool.status, tool.statusCode)}</span>
                  </div>

                  {isRunning && (
                    <div className="flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-orange-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              <span className="text-gray-500">
                {tools.filter((t) => t.status === "success").length} Success
              </span>
            </div>
            {tools.some((t) => t.status === "running") && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                <span className="text-gray-500">
                  {tools.filter((t) => t.status === "running").length} Running
                </span>
              </div>
            )}
            {tools.some((t) => t.status === "error") && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-gray-500">
                  {tools.filter((t) => t.status === "error").length} Failed
                </span>
              </div>
            )}
          </div>
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.08em]">API Call Log</span>
        </div>
      </div>
    </div>
  );
}
