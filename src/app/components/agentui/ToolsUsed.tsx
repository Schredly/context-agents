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
        return { text: "text-[#59C3C3]", badge: "text-[#59C3C3] border-[#2F5F7A]" };
      case "running":
        return { text: "text-[#2E86AB]", badge: "text-[#2E86AB] border-[#2F5F7A]" };
      case "error":
        return { text: "text-red-400", badge: "text-red-400 border-[#2F5F7A]" };
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
    <div className="bg-[#0B1E2D] border border-[#2F5F7A] rounded-[10px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2F5F7A]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[#F1F5F9] text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#C7D2DA]" />
              {title}
            </h3>
            <p className="text-xs text-[#8FA7B5] mt-0.5">External API calls and integrations</p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#2F5F7A]">
            <Zap className="w-3 h-3 text-[#8FA7B5]" />
            <span className="text-xs text-[#8FA7B5]">{tools.length} calls</span>
          </div>
        </div>
      </div>

      {/* API Call Log */}
      <div className="divide-y divide-[#2F5F7A]">
        {tools.map((tool) => {
          const styles = getStatusStyles(tool.status);
          const isRunning = tool.status === "running";

          return (
            <div
              key={tool.id}
              className={`px-4 py-3 hover:bg-[#102A43] transition-colors ${
                isRunning ? "bg-[#102A43]" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <code className="text-sm text-[#F1F5F9] font-mono bg-[#102A43] px-2 py-0.5 rounded border border-[#2F5F7A]">
                      {tool.toolName}
                    </code>
                    <ExternalLink className="w-3 h-3 text-[#8FA7B5]" />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full border border-[#2F5F7A] text-[#C7D2DA]">
                      {tool.targetSystem}
                    </span>
                    {tool.timestamp && (
                      <span className="text-xs text-[#8FA7B5]">
                        {tool.timestamp}
                      </span>
                    )}
                    {tool.responseTime && tool.status === "success" && (
                      <span className="text-xs text-[#8FA7B5]">
                        &middot; {tool.responseTime}
                      </span>
                    )}
                  </div>
                  {tool.summary && (
                    <p className="text-xs text-[#C7D2DA] mt-1 truncate">{tool.summary}</p>
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
                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-[#2E86AB] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2E86AB]"></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-[#2F5F7A]">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#59C3C3]" />
              <span className="text-[#8FA7B5]">
                {tools.filter((t) => t.status === "success").length} Success
              </span>
            </div>
            {tools.some((t) => t.status === "running") && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#2E86AB]" />
                <span className="text-[#8FA7B5]">
                  {tools.filter((t) => t.status === "running").length} Running
                </span>
              </div>
            )}
            {tools.some((t) => t.status === "error") && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-[#8FA7B5]">
                  {tools.filter((t) => t.status === "error").length} Failed
                </span>
              </div>
            )}
          </div>
          <span className="text-[11px] font-medium text-[#8FA7B5] uppercase tracking-[0.08em]">API Call Log</span>
        </div>
      </div>
    </div>
  );
}
