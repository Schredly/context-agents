import { ToolCallItem } from "./ToolCallItem";

type Status = "completed" | "running" | "pending" | "failed" | "cancelled";

interface ToolCall {
  name: string;
  status: Status;
  latency: string;
  request?: any;
  response?: any;
}

interface TraceStepToolSectionProps {
  toolCalls: ToolCall[];
}

export function TraceStepToolSection({ toolCalls }: TraceStepToolSectionProps) {
  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <p className="text-xs font-medium text-gray-500 uppercase mb-3 tracking-wide">
        Tool Calls
      </p>
      <div className="space-y-2">
        {toolCalls.map((toolCall, index) => (
          <ToolCallItem
            key={index}
            toolName={toolCall.name}
            status={toolCall.status}
            latency={toolCall.latency}
            toolRequest={toolCall.request}
            toolResponse={toolCall.response}
          />
        ))}
      </div>
    </div>
  );
}
