import { useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

type Status = "completed" | "running" | "pending" | "failed" | "cancelled";

interface ToolCallItemProps {
  toolName: string;
  status: Status;
  latency: string;
  toolRequest?: any;
  toolResponse?: any;
}

export function ToolCallItem({
  toolName,
  status,
  latency,
  toolRequest,
  toolResponse,
}: ToolCallItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Tool Call Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Wrench className="w-4 h-4 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <code className="text-sm font-mono text-gray-900 block">
              {toolName}
            </code>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={status} size="sm" showIcon={false} />
            <code className="text-xs font-mono text-gray-500">{latency}</code>
          </div>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-3">
          {/* Tool Request */}
          {toolRequest && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2 tracking-wide">
                Tool Request
              </p>
              <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto font-mono">
                {JSON.stringify(toolRequest, null, 2)}
              </pre>
            </div>
          )}

          {/* Tool Response */}
          {toolResponse && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2 tracking-wide">
                Tool Response
              </p>
              <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto font-mono max-h-64">
                {JSON.stringify(toolResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
