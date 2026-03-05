import { useState } from "react";
import { Clock, Zap, ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { ToolInvocation } from "./ToolInvocation";
import { TimelineConnector } from "./TimelineConnector";
import { TraceStepToolSection } from "./TraceStepToolSection";

type Status = "completed" | "running" | "pending" | "failed" | "cancelled";

interface ToolCall {
  name: string;
  status: Status;
  latency: string;
  request?: any;
  response?: any;
}

interface TraceStepProps {
  step: number;
  skillName: string;
  model: string;
  tools: string[];
  latency: string;
  tokens: number;
  status: Status;
  resultSummary?: string;
  skillInstructions?: string;
  toolRequestPayload?: any;
  toolResponse?: any;
  llmOutput?: string;
  toolCalls?: ToolCall[];
  isLast?: boolean;
  expandable?: boolean;
}

export function TraceStep({
  step,
  skillName,
  model,
  tools,
  latency,
  tokens,
  status,
  resultSummary,
  skillInstructions,
  toolRequestPayload,
  toolResponse,
  llmOutput,
  toolCalls,
  isLast = false,
  expandable = true,
}: TraceStepProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="relative pl-12">
      {/* Timeline connector */}
      {!isLast && <TimelineConnector />}

      {/* Step indicator - DevOps pipeline style */}
      <div className="absolute left-0 top-3 w-10 h-10 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center z-10 shadow-sm">
        <span className="text-sm font-semibold text-gray-700">{step}</span>
      </div>

      {/* Step card - Modern card with subtle border */}
      <div
        className={`bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all ${
          expandable ? "cursor-pointer" : ""
        }`}
        onClick={() => expandable && setIsExpanded(!isExpanded)}
      >
        {/* Card header */}
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-900">
                  {skillName}
                </h3>
                <StatusBadge status={status} size="sm" />
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <code className="font-mono text-gray-600">{model}</code>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {latency}
                </span>
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {tokens.toLocaleString()} tokens
                </span>
              </div>
            </div>
            {expandable && (
              <ChevronRight
                className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
                  isExpanded ? "rotate-90" : ""
                }`}
              />
            )}
          </div>

          {/* Tools invoked */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-2 tracking-wide">
              Tools Invoked
            </p>
            <ToolInvocation tools={tools} />
          </div>

          {/* Tool Calls Section - Always visible */}
          {toolCalls && toolCalls.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              <TraceStepToolSection toolCalls={toolCalls} />
            </div>
          )}

          {/* Result summary */}
          {resultSummary && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1 tracking-wide">
                Result Summary
              </p>
              <p className="text-sm text-gray-900">{resultSummary}</p>
            </div>
          )}
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="border-t border-gray-200 bg-gray-50">
            <div className="p-4 space-y-4">
              {/* Skill Instructions */}
              {skillInstructions && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2 tracking-wide">
                    Skill Instructions
                  </p>
                  <div className="text-sm bg-white p-3 rounded-lg border border-gray-200 text-gray-700 leading-relaxed">
                    {skillInstructions}
                  </div>
                </div>
              )}

              {/* Tool Request Payload */}
              {toolRequestPayload && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2 tracking-wide">
                    Tool Request Payload
                  </p>
                  <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto font-mono">
                    {JSON.stringify(toolRequestPayload, null, 2)}
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

              {/* LLM Output */}
              {llmOutput && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2 tracking-wide">
                    LLM Output
                  </p>
                  <div className="text-sm bg-white p-3 rounded-lg border border-gray-200 text-gray-700 leading-relaxed">
                    {llmOutput}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
