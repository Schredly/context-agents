import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles, MessageSquare, User } from "lucide-react";
import type { ReasoningStep } from "./AgentReasoning";
import type { SkillExecution } from "./SkillExecutionTimeline";
import type { ToolCall } from "./ToolsUsed";
import type { SuggestedAction } from "./AIRecommendation";
import type { ActionType } from "./AgentActions";

interface MobileAgentViewProps {
  userQuery: string;
  reasoningSteps: ReasoningStep[];
  selectedUseCase: {
    name: string;
    description: string;
    confidence: number;
    category: string;
  };
  skillExecutions: SkillExecution[];
  toolCalls: ToolCall[];
  recommendation: {
    resolution: string;
    confidence: number;
    suggestedActions: SuggestedAction[];
    additionalContext?: string;
  };
  onAction?: (type: ActionType) => void;
}

interface CollapsibleSectionProps {
  title: string;
  badge?: string;
  badgeColor?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  badge,
  badgeColor = "bg-orange-500/20 text-orange-600",
  defaultExpanded = false,
  children,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2.5 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          )}
          <span className="text-sm text-gray-900">{title}</span>
        </div>
        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor}`}>
            {badge}
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="p-3 border-t border-gray-200 bg-white/50">
          {children}
        </div>
      )}
    </div>
  );
}

export function MobileAgentView({
  userQuery,
  reasoningSteps,
  selectedUseCase,
  skillExecutions,
  toolCalls,
  recommendation,
  onAction,
}: MobileAgentViewProps) {
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Compact Header */}
      <div className="px-3 py-2.5 border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-500 to-orange-400">
            <Sparkles className="w-4 h-4 text-gray-900" />
          </div>
          <div>
            <h1 className="text-sm text-gray-900">AI Agent</h1>
            <p className="text-xs text-gray-500">Enterprise Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-orange-400/10 border border-orange-400/30">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          <span className="text-xs text-orange-500">Online</span>
        </div>
      </div>

      {/* Conversation Thread - Fixed height with scroll */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar" style={{ maxHeight: 'calc(100vh - 140px)' }}>
        {/* User Message */}
        <div className="flex gap-2">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
            <User className="w-4 h-4 text-gray-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-500">You</span>
              <span className="text-xs text-gray-500">2:34 PM</span>
            </div>
            <div className="bg-gray-100 rounded-lg px-3 py-2">
              <p className="text-sm text-gray-900">{userQuery}</p>
            </div>
          </div>
        </div>

        {/* Agent Response Container */}
        <div className="flex gap-2">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-orange-400 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-gray-900" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-600">AI Agent</span>
              <span className="text-xs text-gray-500">2:34 PM</span>
              <span className="text-xs text-orange-500">● Completed</span>
            </div>
            <div className="space-y-2">
              {/* Final Answer - Default Expanded - Compact Mobile Version */}
              <CollapsibleSection
                title="Final Answer"
                badge={`${recommendation.confidence}%`}
                badgeColor="bg-orange-400/20 text-orange-500"
                defaultExpanded={true}
              >
                <div className="space-y-3">
                  {/* Compact resolution text */}
                  <div className="text-sm text-gray-900 leading-relaxed">
                    {recommendation.resolution}
                  </div>

                  {/* Additional context if present */}
                  {recommendation.additionalContext && (
                    <div className="p-2.5 bg-orange-500/5 border border-orange-400/20 rounded-lg">
                      <p className="text-xs text-orange-500">
                        {recommendation.additionalContext}
                      </p>
                    </div>
                  )}

                  {/* Compact confidence bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Confidence</span>
                      <span className="text-orange-500">{recommendation.confidence}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all"
                        style={{ width: `${recommendation.confidence}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Recommended Actions - Default Expanded - Compact Version */}
              <CollapsibleSection
                title="Recommended Actions"
                badge={`${recommendation.suggestedActions.length} actions`}
                defaultExpanded={true}
              >
                <div className="space-y-2">
                  {recommendation.suggestedActions.map((action, index) => {
                    const getPriorityColor = (priority?: string) => {
                      switch (priority) {
                        case "high":
                          return "text-[#EF4444] bg-[#EF4444]/10";
                        case "medium":
                          return "text-orange-400 bg-orange-400/10";
                        case "low":
                          return "text-orange-600 bg-orange-500/10";
                        default:
                          return "text-gray-600 bg-gray-400/10";
                      }
                    };

                    return (
                      <div
                        key={action.id}
                        className="flex items-start gap-2 p-2.5 bg-gray-100/30 border border-gray-200/50 rounded-lg"
                      >
                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-orange-500 to-orange-400 text-gray-900 text-xs flex-shrink-0 mt-0.5">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-900">{action.action}</p>
                        </div>
                        {action.priority && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${getPriorityColor(
                              action.priority
                            )} flex-shrink-0`}
                          >
                            {action.priority}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>

              {/* Agent Reasoning - Collapsed by default - Compact Version */}
              <CollapsibleSection
                title="Agent Reasoning"
                badge={`${reasoningSteps.length} steps`}
                badgeColor="bg-orange-500/20 text-orange-600"
              >
                <div className="space-y-2">
                  {reasoningSteps.map((step, index) => (
                    <div key={step.id} className="flex items-start gap-2">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-orange-500/20 text-orange-600 text-xs flex-shrink-0 mt-0.5">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-900">{step.label}</p>
                        {step.description && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {step.description}
                          </p>
                        )}
                      </div>
                      {step.status === "completed" && (
                        <span className="text-xs text-orange-500">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              {/* Use Case Selected - Collapsed by default - Compact Version */}
              <CollapsibleSection
                title="Use Case Selected"
                badge={`${selectedUseCase.confidence}% match`}
                badgeColor="bg-orange-500/20 text-orange-600"
              >
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-gray-900">{selectedUseCase.name}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {selectedUseCase.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{selectedUseCase.category}</span>
                    <span className="text-orange-600">{selectedUseCase.confidence}% match</span>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Skills Executed - Collapsed by default - Compact Version */}
              <CollapsibleSection
                title="Skills Executed"
                badge={`${skillExecutions.length} skills`}
                badgeColor="bg-orange-500/20 text-orange-600"
              >
                <div className="space-y-2">
                  {skillExecutions.map((skill) => (
                    <div
                      key={skill.id}
                      className="flex items-start justify-between gap-2 p-2 bg-gray-100/30 rounded"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-900">{skill.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {skill.description}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {skill.status === "completed" && (
                          <span className="text-xs text-orange-500">✓</span>
                        )}
                        <span className="text-xs text-gray-500">{skill.duration}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              {/* Tools Used - Collapsed by default - Compact Version */}
              <CollapsibleSection
                title="Tools & APIs"
                badge={`${toolCalls.length} calls`}
                badgeColor="bg-orange-400/20 text-orange-500"
              >
                <div className="space-y-2">
                  {toolCalls.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex items-start justify-between gap-2 p-2 bg-gray-100/30 rounded"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-900 font-mono">
                          {tool.toolName}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {tool.targetSystem}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {tool.status === "success" && (
                          <span className="text-xs text-orange-500">200</span>
                        )}
                        <span className="text-xs text-gray-500">{tool.responseTime}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            </div>
          </div>
        </div>
      </div>

      {/* Compact Input Bar */}
      <div className="border-t border-gray-200 bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Ask the agent..."
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-400/50"
          />
          <button className="p-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-500 hover:to-orange-400 text-gray-900 transition-all">
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-gray-500">
            <span className="text-orange-500">●</span> Ready
          </span>
          <span className="text-gray-300">Execution: 2.18s</span>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #fb923c;
        }
      `}</style>
    </div>
  );
}
