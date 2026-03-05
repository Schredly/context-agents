import { useState, useEffect } from "react";
import { TopBar } from "../components/agentui/TopBar";
import { ChatMessage } from "../components/agentui/ChatMessage";
import { InputPanel } from "../components/agentui/InputPanel";
import { AgentReasoning, type ReasoningStep } from "../components/agentui/AgentReasoning";
import { SelectedUseCase } from "../components/agentui/SelectedUseCase";
import { SkillExecutionTimeline, type SkillExecution } from "../components/agentui/SkillExecutionTimeline";
import { ToolsUsed, type ToolCall } from "../components/agentui/ToolsUsed";
import { AIRecommendation, type SuggestedAction } from "../components/agentui/AIRecommendation";
import { AgentActions, type ActionType } from "../components/agentui/AgentActions";
import MobileApp from "../components/agentui/MobileApp";
import { askAgent, type AgentAskResponse } from "../services/api";

interface Message {
  id: string;
  type: "user" | "agent-structured";
  content: string;
  timestamp: string;
  response?: AgentResponse;
}

export default function AgentUIPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Response data for the right panel
  const [reasoningSteps, setReasoningSteps] = useState<ReasoningStep[]>([]);
  const [selectedUseCase, setSelectedUseCase] = useState<{ name: string; description: string; confidence: number } | null>(null);
  const [skillExecutions, setSkillExecutions] = useState<SkillExecution[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [recommendation, setRecommendation] = useState<{ resolution: string; confidence: number; actions: SuggestedAction[] } | null>(null);
  const [executionTime, setExecutionTime] = useState<string | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleSendMessage = async (content: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      type: "user",
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Clear previous response
    setReasoningSteps([]);
    setSelectedUseCase(null);
    setSkillExecutions([]);
    setToolCalls([]);
    setRecommendation(null);
    setExecutionTime(null);

    // Show "analyzing" reasoning steps immediately
    setReasoningSteps([
      { id: "r1", label: "Analyzing user request", description: "Processing natural language query", status: "running", icon: "search" },
    ]);

    const t0 = performance.now();

    try {
      const tenantId = "acme";
      const data: AgentAskResponse = await askAgent(tenantId, content);
      const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
      setExecutionTime(`${elapsed}s`);

      // Populate reasoning steps
      setReasoningSteps(
        data.reasoning.map((r, i) => ({
          id: `r${i}`,
          label: r,
          description: "",
          status: "completed" as const,
          icon: i === 0 ? "search" : i === 1 ? "target" : i === 2 ? "check" : "zap",
        }))
      );

      // Populate selected use case
      setSelectedUseCase({
        name: data.use_case,
        description: "",
        confidence: 92,
      });

      // Populate skills
      setSkillExecutions(
        data.skills.map((s, i) => ({
          id: `sk${i}`,
          name: s,
          description: "",
          status: "completed" as const,
          duration: `${(Math.random() * 0.8 + 0.2).toFixed(2)}s`,
          icon: i === 0 ? "search" : i === 1 ? "book" : i === 2 ? "file" : "check",
        }))
      );

      // Populate tools
      setToolCalls(
        data.tools.map((t, i) => ({
          id: `tc${i}`,
          toolName: t,
          targetSystem: t.split(".")[0] === "servicenow" ? "ServiceNow" : t.split(".")[0] === "google-drive" ? "Google Drive" : t.split(".")[0],
          status: "success" as const,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          responseTime: `${Math.floor(Math.random() * 400 + 100)}ms`,
          statusCode: 200,
        }))
      );

      // Populate recommendation
      setRecommendation({
        resolution: data.result,
        confidence: 94,
        actions: [],
      });

      // Add agent response message
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: "agent-structured",
        content: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        response: data,
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      // Show error in reasoning
      setReasoningSteps([
        { id: "r1", label: "Error", description: err.message || "Request failed", status: "failed" as any, icon: "search" },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAgentAction = (type: ActionType) => {
    console.log("Agent action:", type);
  };

  if (isMobile) {
    return <MobileApp />;
  }

  return (
    <div className="h-screen flex flex-col bg-black">
      {/* Top Header */}
      <TopBar
        agentName="Enterprise AI Agent"
        tenant="Production - ACME Corp"
        status={isLoading ? "processing" : "connected"}
      />

      {/* Main Content Area - Two Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat Conversation Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-950">
          {/* Scrollable chat area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.length === 0 && !isLoading && (
                <div className="flex items-center justify-center h-full min-h-[300px]">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <h3 className="text-white text-lg font-medium mb-1">Ask the Enterprise Agent</h3>
                    <p className="text-gray-500 text-sm">Type a question about your systems, incidents, or documentation</p>
                  </div>
                </div>
              )}

              {messages.map((message) => {
                if (message.type === "user") {
                  return (
                    <ChatMessage
                      key={message.id}
                      type="user"
                      content={message.content}
                      timestamp={message.timestamp}
                    />
                  );
                }
                if (message.type === "agent-structured" && message.response) {
                  return (
                    <div key={message.id}>
                      <AIRecommendation
                        resolution={message.response.result}
                        confidence={94}
                        suggestedActions={[]}
                        additionalContext=""
                      />
                      <div className="mt-4">
                        <AgentActions onAction={handleAgentAction} />
                      </div>
                    </div>
                  );
                }
                return null;
              })}

              {isLoading && (
                <div className="flex items-center gap-3 text-gray-400 py-4">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm">Agent is thinking...</span>
                </div>
              )}
            </div>
          </div>

          {/* Fixed Input Panel at Bottom */}
          <InputPanel
            onSend={handleSendMessage}
            disabled={isLoading}
          />
        </div>

        {/* Right: Agent Execution Trace Panel */}
        <div className="w-96 border-l border-gray-800 bg-gray-900 flex flex-col">
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-gray-800 bg-gray-950">
            <h2 className="text-white flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isLoading ? "bg-blue-500 animate-pulse" : "bg-green-500"}`} />
              Execution Trace
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Live agent reasoning and tool execution
            </p>
          </div>

          {/* Scrollable execution trace */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
            {reasoningSteps.length > 0 && (
              <div>
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">
                  Reasoning Steps
                </h3>
                <AgentReasoning steps={reasoningSteps} />
              </div>
            )}

            {selectedUseCase && (
              <div>
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">
                  Selected Use Case
                </h3>
                <SelectedUseCase
                  name={selectedUseCase.name}
                  description={selectedUseCase.description}
                  confidence={selectedUseCase.confidence}
                  category="Enterprise Operations"
                />
              </div>
            )}

            {skillExecutions.length > 0 && (
              <div>
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">
                  Skills Executed
                </h3>
                <SkillExecutionTimeline skills={skillExecutions} />
              </div>
            )}

            {toolCalls.length > 0 && (
              <div>
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">
                  Tools & APIs
                </h3>
                <ToolsUsed tools={toolCalls} />
              </div>
            )}

            {!reasoningSteps.length && !isLoading && (
              <div className="flex items-center justify-center h-full text-center py-12">
                <div>
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-800 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-gray-600 text-sm">No execution trace yet</p>
                  <p className="text-gray-700 text-xs mt-1">Ask a question to see the agent work</p>
                </div>
              </div>
            )}
          </div>

          {/* Trace Panel Footer */}
          {executionTime && (
            <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-950/50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Total execution time</span>
                <span className="text-green-400">{executionTime}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #374151;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4B5563;
        }
      `}</style>
    </div>
  );
}
