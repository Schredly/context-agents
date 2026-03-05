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
  badgeColor = "bg-blue-500/20 text-blue-400",
  defaultExpanded = false,
  children,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden bg-gray-900/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2.5 flex items-center justify-between bg-gray-900 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <span className="text-sm text-white">{title}</span>
        </div>
        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor}`}>
            {badge}
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="p-3 border-t border-gray-800 bg-gray-950/50">
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
    <div className="flex flex-col h-screen bg-black">
      {/* Compact Header */}
      <div className="px-3 py-2.5 border-b border-gray-800 bg-gradient-to-r from-gray-950 to-gray-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm text-white">AI Agent</h1>
            <p className="text-xs text-gray-500">Enterprise Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/30">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-400">Online</span>
        </div>
      </div>

      {/* Conversation Thread - Fixed height with scroll */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar" style={{ maxHeight: 'calc(100vh - 140px)' }}>
        {/* User Message */}
        <div className="flex gap-2">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center">
            <User className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-500">You</span>
              <span className="text-xs text-gray-600">2:34 PM</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-sm text-gray-200">{userQuery}</p>
            </div>
          </div>
        </div>

        {/* Agent Response Container */}
        <div className="flex gap-2">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400">AI Agent</span>
              <span className="text-xs text-gray-600">2:34 PM</span>
              <span className="text-xs text-green-400">● Completed</span>
            </div>
            <div className="space-y-2">
              {/* Final Answer - Default Expanded - Compact Mobile Version */}
              <CollapsibleSection
                title="Final Answer"
                badge={`${recommendation.confidence}%`}
                badgeColor="bg-green-500/20 text-green-400"
                defaultExpanded={true}
              >
                <div className="space-y-3">
                  {/* Compact resolution text */}
                  <div className="text-sm text-gray-200 leading-relaxed">
                    {recommendation.resolution}
                  </div>

                  {/* Additional context if present */}
                  {recommendation.additionalContext && (
                    <div className="p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                      <p className="text-xs text-blue-300">
                        {recommendation.additionalContext}
                      </p>
                    </div>
                  )}

                  {/* Compact confidence bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Confidence</span>
                      <span className="text-green-400">{recommendation.confidence}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all"
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
                          return "text-red-400 bg-red-500/10";
                        case "medium":
                          return "text-yellow-400 bg-yellow-500/10";
                        case "low":
                          return "text-blue-400 bg-blue-500/10";
                        default:
                          return "text-gray-400 bg-gray-500/10";
                      }
                    };

                    return (
                      <div
                        key={action.id}
                        className="flex items-start gap-2 p-2.5 bg-gray-800/30 border border-gray-700/50 rounded-lg"
                      >
                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs flex-shrink-0 mt-0.5">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-200">{action.action}</p>
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
                badgeColor="bg-purple-500/20 text-purple-400"
              >
                <div className="space-y-2">
                  {reasoningSteps.map((step, index) => (
                    <div key={step.id} className="flex items-start gap-2">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-xs flex-shrink-0 mt-0.5">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-200">{step.label}</p>
                        {step.description && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {step.description}
                          </p>
                        )}
                      </div>
                      {step.status === "completed" && (
                        <span className="text-xs text-green-400">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              {/* Use Case Selected - Collapsed by default - Compact Version */}
              <CollapsibleSection
                title="Use Case Selected"
                badge={`${selectedUseCase.confidence}% match`}
                badgeColor="bg-blue-500/20 text-blue-400"
              >
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-white">{selectedUseCase.name}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {selectedUseCase.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{selectedUseCase.category}</span>
                    <span className="text-blue-400">{selectedUseCase.confidence}% match</span>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Skills Executed - Collapsed by default - Compact Version */}
              <CollapsibleSection
                title="Skills Executed"
                badge={`${skillExecutions.length} skills`}
                badgeColor="bg-indigo-500/20 text-indigo-400"
              >
                <div className="space-y-2">
                  {skillExecutions.map((skill) => (
                    <div
                      key={skill.id}
                      className="flex items-start justify-between gap-2 p-2 bg-gray-800/30 rounded"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-200">{skill.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {skill.description}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {skill.status === "completed" && (
                          <span className="text-xs text-green-400">✓</span>
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
                badgeColor="bg-cyan-500/20 text-cyan-400"
              >
                <div className="space-y-2">
                  {toolCalls.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex items-start justify-between gap-2 p-2 bg-gray-800/30 rounded"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-200 font-mono">
                          {tool.toolName}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {tool.targetSystem}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {tool.status === "success" && (
                          <span className="text-xs text-green-400">200</span>
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
      <div className="border-t border-gray-800 bg-gray-950 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Ask the agent..."
            className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
          />
          <button className="p-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition-all shadow-lg shadow-blue-600/30">
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-gray-600">
            <span className="text-green-400">●</span> Ready
          </span>
          <span className="text-gray-700">Execution: 2.18s</span>
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
          background: #374151;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4B5563;
        }
      `}</style>
    </div>
  );
}
