import { useState, useEffect, useRef } from "react";
import { TopBar } from "../components/agentui/TopBar";
import { ChatMessage } from "../components/agentui/ChatMessage";
import { InputPanel } from "../components/agentui/InputPanel";
import { AgentReasoning, type ReasoningStep } from "../components/agentui/AgentReasoning";
import { SelectedUseCase } from "../components/agentui/SelectedUseCase";
import { SkillExecutionTimeline, type SkillExecution } from "../components/agentui/SkillExecutionTimeline";
import { ToolsUsed, type ToolCall } from "../components/agentui/ToolsUsed";
import { AIRecommendation, type SuggestedAction } from "../components/agentui/AIRecommendation";
import { AgentActions, type ActionType } from "../components/agentui/AgentActions";
import { streamAgent } from "../services/agentStream";

interface Message {
  id: string;
  type: "user" | "agent-structured" | "agent-draft" | "agent-question" | "agent-result";
  content: string;
  timestamp: string;
  result?: string;
}

interface DraftState {
  actionId: string;
  draftPrompt: string;
  catalogData: string;
}

interface InputCollectionState {
  actionId: string;
  field: string;
  prompt: string;
}

export default function AgentUIPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [narrowViewport, setNarrowViewport] = useState(false);

  // Response data for the right panel
  const [reasoningSteps, setReasoningSteps] = useState<ReasoningStep[]>([]);
  const [selectedUseCase, setSelectedUseCase] = useState<{ name: string; description: string; confidence: number } | null>(null);
  const [skillExecutions, setSkillExecutions] = useState<SkillExecution[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [recommendation, setRecommendation] = useState<{ resolution: string; confidence: number; actions: SuggestedAction[] } | null>(null);
  const [executionTime, setExecutionTime] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  // Draft refinement mode
  const [draftState, setDraftState] = useState<DraftState | null>(null);

  // Input collection mode (action needs user input before executing)
  const [inputState, setInputState] = useState<InputCollectionState | null>(null);

  const cancelRef = useRef<(() => void) | null>(null);
  const reasoningCountRef = useRef(0);
  const skillCountRef = useRef(0);
  const toolCountRef = useRef(0);

  useEffect(() => {
    const check = () => setNarrowViewport(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleSendMessage = async (content: string) => {
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // --- Input collection mode: user is providing input for an action ---
    if (inputState) {
      const userMsg: Message = { id: Date.now().toString(), type: "user", content, timestamp: now };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const res = await fetch(`http://localhost:8000/api/admin/acme/actions/${inputState.actionId}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            run_id: runId || "",
            input: { [inputState.field]: content },
          }),
        });
        const data = await res.json();

        if (data.status === "draft" && data.draft_prompt) {
          // Transition to draft/refine mode
          setInputState(null);
          setDraftState({
            actionId: inputState.actionId,
            draftPrompt: data.draft_prompt,
            catalogData: data.catalog_data || "",
          });
          const agentMsg: Message = {
            id: (Date.now() + 1).toString(),
            type: "agent-draft",
            content: data.draft_prompt,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setMessages((prev) => [...prev, agentMsg]);
        } else if (data.status === "error") {
          setInputState(null);
          const errMsg: Message = {
            id: (Date.now() + 1).toString(),
            type: "agent-structured",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: `Error: ${data.error || "Unknown error"}`,
          };
          setMessages((prev) => [...prev, errMsg]);
        }
      } catch (err) {
        setInputState(null);
        const errText = err instanceof Error ? err.message : "Network error";
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          type: "agent-structured",
          content: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          result: `Error: ${errText}`,
        };
        setMessages((prev) => [...prev, errMsg]);
      }
      setIsLoading(false);
      return;
    }

    // --- Refinement mode: call refine-prompt instead of streamAgent ---
    if (draftState) {
      const userMsg: Message = { id: Date.now().toString(), type: "user", content, timestamp: now };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const res = await fetch("/api/admin/acme/agent/refine-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_prompt: draftState.draftPrompt,
            user_feedback: content,
            catalog_data: draftState.catalogData,
          }),
        });
        const data = await res.json();
        if (data.refined_prompt) {
          setDraftState((prev) => prev ? { ...prev, draftPrompt: data.refined_prompt } : null);
          const agentMsg: Message = {
            id: (Date.now() + 1).toString(),
            type: "agent-draft",
            content: data.refined_prompt,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setMessages((prev) => [...prev, agentMsg]);
        } else {
          const errorDetail = data.error || data.detail || "unknown error";
          const errMsg: Message = {
            id: (Date.now() + 1).toString(),
            type: "agent-draft",
            content: draftState.draftPrompt,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          // Re-show current draft with error note
          setMessages((prev) => [
            ...prev,
            { id: (Date.now() + 1).toString(), type: "user" as const, content: `Refinement error: ${errorDetail}. You can still approve the current prompt or try different feedback.`, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
            errMsg,
          ]);
        }
      } catch (err) {
        const errText = err instanceof Error ? err.message : "Network error";
        setMessages((prev) => [
          ...prev,
          { id: (Date.now() + 1).toString(), type: "user" as const, content: `Refinement error: ${errText}. You can still approve the current prompt or try different feedback.`, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
        ]);
      }
      setIsLoading(false);
      return;
    }

    // --- Normal mode: stream agent ---
    cancelRef.current?.();

    const userMsg: Message = { id: Date.now().toString(), type: "user", content, timestamp: now };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Clear previous response
    setReasoningSteps([]);
    setSelectedUseCase(null);
    setSkillExecutions([]);
    setToolCalls([]);
    setRecommendation(null);
    setExecutionTime(null);
    setRunId(null);
    reasoningCountRef.current = 0;
    skillCountRef.current = 0;
    toolCountRef.current = 0;

    const t0 = performance.now();
    const iconForIndex = (i: number) => i === 0 ? "search" : i === 1 ? "target" : i === 2 ? "check" : "zap";
    const skillIconForIndex = (i: number) => i === 0 ? "search" : i === 1 ? "book" : i === 2 ? "file" : "check";

    const cancel = streamAgent("acme", content, {
      onRunStarted: (data) => {
        setRunId(data.run_id);
      },

      onReasoning: (msg) => {
        const idx = reasoningCountRef.current++;
        setReasoningSteps((prev) => [
          ...prev,
          { id: `r${idx}`, label: msg, description: "", status: "completed", icon: iconForIndex(idx) },
        ]);
      },

      onUseCase: (data) => {
        setSelectedUseCase({
          name: data.name,
          description: data.description,
          confidence: Math.round(data.confidence * 100),
        });
      },

      onSkillStarted: (data) => {
        const idx = skillCountRef.current++;
        setSkillExecutions((prev) => [
          ...prev,
          {
            id: `sk${idx}`,
            name: data.skill,
            description: "",
            status: "running",
            duration: "",
            icon: skillIconForIndex(idx),
          },
        ]);
      },

      onToolCalled: (data) => {
        const idx = toolCountRef.current++;
        const prefix = data.tool.split(".")[0];
        const targetSystem = prefix === "servicenow" ? "ServiceNow" : prefix === "google-drive" ? "Google Drive" : prefix;
        setToolCalls((prev) => [
          ...prev,
          {
            id: `tc${idx}`,
            toolName: data.tool,
            targetSystem,
            status: "running",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            responseTime: "",
            statusCode: 0,
          },
        ]);
      },

      onToolResult: (data) => {
        setToolCalls((prev) => {
          const idx = prev.findLastIndex((tc) => tc.toolName === data.tool && tc.status === "running");
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            status: data.status === "error" ? "error" as const : "success" as const,
            statusCode: data.status === "error" ? 500 : 200,
            summary: data.summary,
          };
          return updated;
        });
      },

      onSkillCompleted: (data) => {
        setSkillExecutions((prev) =>
          prev.map((sk) =>
            sk.name === data.skill ? { ...sk, status: "completed" as const } : sk
          ),
        );
      },

      onFinalResult: (data) => {
        const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
        setExecutionTime(`${elapsed}s`);
        setRecommendation({
          resolution: data.result,
          confidence: Math.round(data.confidence * 100),
          actions: [],
        });

        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          type: "agent-structured",
          content: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          result: data.result,
        };
        setMessages((prev) => [...prev, agentMsg]);
        setIsLoading(false);
      },

      onError: (err) => {
        const msg = err instanceof Error ? err.message : "Request failed";
        setReasoningSteps((prev) => [
          ...prev,
          { id: "err", label: "Error", description: msg, status: "failed" as any, icon: "search" },
        ]);
        setIsLoading(false);
      },
    });

    cancelRef.current = cancel;
  };

  const handleDraftReady = (result: { draft_prompt: string; catalog_data: string; action_id: string }) => {
    setDraftState({
      actionId: result.action_id,
      draftPrompt: result.draft_prompt,
      catalogData: result.catalog_data,
    });
    const agentMsg: Message = {
      id: Date.now().toString(),
      type: "agent-draft",
      content: result.draft_prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, agentMsg]);
  };

  const handleApproveReplit = async () => {
    if (!draftState) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/acme/agent/approve-replit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_prompt: draftState.draftPrompt }),
      });
      const data = await res.json();
      if (data.repl_url) {
        if (data.prompt_text) {
          navigator.clipboard.writeText(data.prompt_text).catch(() => {});
        }
        window.open(data.repl_url, "_blank");
      }
      const successMsg: Message = {
        id: Date.now().toString(),
        type: "agent-result",
        content: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        result: data.message || "Repl created successfully!",
      };
      setMessages((prev) => [...prev, successMsg]);
    } catch (err) {
      const errText = err instanceof Error ? err.message : "Network error";
      const errMsg: Message = {
        id: Date.now().toString(),
        type: "agent-result",
        content: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        result: `Failed to create repl: ${errText}`,
      };
      setMessages((prev) => [...prev, errMsg]);
    }
    setDraftState(null);
    setIsLoading(false);
  };

  const handleCancelRefine = () => {
    setDraftState(null);
    const cancelMsg: Message = {
      id: Date.now().toString(),
      type: "agent-structured",
      content: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      result: "Prompt refinement cancelled.",
    };
    setMessages((prev) => [...prev, cancelMsg]);
  };

  const handleNeedsInput = (result: { action_id: string; field: string; prompt: string }) => {
    setInputState({
      actionId: result.action_id,
      field: result.field,
      prompt: result.prompt,
    });
    const agentMsg: Message = {
      id: Date.now().toString(),
      type: "agent-question",
      content: result.prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, agentMsg]);
  };

  const handleAgentAction = (type: ActionType) => {
    console.log("Agent action:", type);
  };

  return (
    <div className="h-screen flex flex-col bg-[#0B1E2D]">
      {/* Top Header */}
      <TopBar
        agentName="Love-Boat.AI Agent"
        tenant="Production - ACME Corp"
        status={isLoading ? "processing" : "connected"}
      />

      {/* Main Content Area - Two Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat Conversation Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0B1E2D]">
          {/* Scrollable chat area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.length === 0 && !isLoading && (
                <div className="flex items-center justify-center h-full min-h-[300px]">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#102A43] border border-[#2F5F7A] flex items-center justify-center">
                      <svg className="w-8 h-8 text-[#C7D2DA]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <h3 className="text-[#F1F5F9] text-lg font-medium mb-1">Ask the Love-Boat.AI Agent</h3>
                    <p className="text-[#8FA7B5] text-sm">Type a question about your systems, incidents, or documentation</p>
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
                if (message.type === "agent-draft") {
                  return (
                    <div key={message.id} className="bg-[#102A43] border border-amber-500/30 rounded-[10px] p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Draft Replit Prompt</span>
                        <span className="text-xs text-[#8FA7B5] ml-auto">{message.timestamp}</span>
                      </div>
                      <pre className="text-sm text-[#C7D2DA] whitespace-pre-wrap font-mono leading-relaxed">{message.content}</pre>
                      <p className="text-xs text-[#8FA7B5] mt-3">
                        Type feedback below to refine, or click "Approve & Send to Replit" when ready.
                      </p>
                    </div>
                  );
                }
                if (message.type === "agent-question") {
                  return (
                    <div key={message.id} className="bg-[#102A43] border border-[#2E86AB]/40 rounded-[10px] p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-[#2E86AB]" />
                        <span className="text-xs font-medium text-[#2E86AB] uppercase tracking-wider">Agent</span>
                        <span className="text-xs text-[#8FA7B5] ml-auto">{message.timestamp}</span>
                      </div>
                      <p className="text-sm text-[#F1F5F9]">{message.content}</p>
                    </div>
                  );
                }
                if (message.type === "agent-result" && message.result) {
                  return (
                    <div key={message.id}>
                      <AIRecommendation
                        resolution={message.result}
                        confidence={94}
                        suggestedActions={[]}
                        additionalContext=""
                      />
                    </div>
                  );
                }
                if (message.type === "agent-structured" && message.result) {
                  return (
                    <div key={message.id}>
                      <AIRecommendation
                        resolution={message.result}
                        confidence={94}
                        suggestedActions={[]}
                        additionalContext=""
                      />
                      <div className="mt-4">
                        <AgentActions
                          onAction={handleAgentAction}
                          onDraftReady={handleDraftReady}
                          onNeedsInput={handleNeedsInput}
                          runId={runId}
                        />
                      </div>
                    </div>
                  );
                }
                return null;
              })}

              {/* Show actions persistently during draft/refine mode */}
              {draftState && !isLoading && (
                <div className="mt-4">
                  <AgentActions
                    onAction={handleAgentAction}
                    onDraftReady={handleDraftReady}
                    runId={runId}
                  />
                </div>
              )}

              {isLoading && (
                <div className="flex items-center gap-3 text-[#C7D2DA] py-4">
                  <div className="w-2 h-2 rounded-full bg-[#2E86AB] animate-pulse" />
                  <span className="text-sm">Agent is thinking...</span>
                </div>
              )}
            </div>
          </div>

          {/* Fixed Input Panel at Bottom */}
          <InputPanel
            onSend={handleSendMessage}
            disabled={isLoading}
            mode={draftState ? "refine" : inputState ? "input" : "normal"}
            onApprove={draftState ? handleApproveReplit : undefined}
            onCancelRefine={draftState ? handleCancelRefine : undefined}
            inputPrompt={inputState?.prompt}
          />
        </div>

        {/* Right: Agent Execution Trace Panel (hidden at narrow viewports / high zoom) */}
        <div className={`w-96 border-l border-[#2F5F7A] bg-[#0B1E2D] flex flex-col ${narrowViewport ? "hidden" : ""}`}>
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-[#2F5F7A]">
            <h2 className="text-[#F1F5F9] text-sm font-medium flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? "bg-[#2E86AB] animate-pulse" : "bg-[#59C3C3]"}`} />
              Execution Trace
            </h2>
            <p className="text-xs text-[#8FA7B5] mt-1">
              Live agent reasoning and tool execution
            </p>
          </div>

          {/* Scrollable execution trace */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
            {reasoningSteps.length > 0 && (
              <div>
                <span className="text-[11px] font-medium text-[#8FA7B5] uppercase tracking-[0.08em] px-1">
                  Reasoning Steps
                </span>
                <div className="mt-2">
                  <AgentReasoning steps={reasoningSteps} />
                </div>
              </div>
            )}

            {selectedUseCase && (
              <div>
                <span className="text-[11px] font-medium text-[#8FA7B5] uppercase tracking-[0.08em] px-1">
                  Selected Use Case
                </span>
                <div className="mt-2">
                  <SelectedUseCase
                    name={selectedUseCase.name}
                    description={selectedUseCase.description}
                    confidence={selectedUseCase.confidence}
                    category="Love-Boat.AI Operations"
                  />
                </div>
              </div>
            )}

            {skillExecutions.length > 0 && (
              <div>
                <span className="text-[11px] font-medium text-[#8FA7B5] uppercase tracking-[0.08em] px-1">
                  Skills Executed
                </span>
                <div className="mt-2">
                  <SkillExecutionTimeline skills={skillExecutions} />
                </div>
              </div>
            )}

            {toolCalls.length > 0 && (
              <div>
                <span className="text-[11px] font-medium text-[#8FA7B5] uppercase tracking-[0.08em] px-1">
                  Tools & APIs
                </span>
                <div className="mt-2">
                  <ToolsUsed tools={toolCalls} />
                </div>
              </div>
            )}

            {!reasoningSteps.length && !isLoading && (
              <div className="flex items-center justify-center h-full text-center py-12">
                <div>
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#102A43] border border-[#2F5F7A] flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#8FA7B5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-[#8FA7B5] text-sm">No execution trace yet</p>
                  <p className="text-[#8FA7B5] text-xs mt-1">Ask a question to see the agent work</p>
                </div>
              </div>
            )}
          </div>

          {/* Trace Panel Footer */}
          {executionTime && (
            <div className="px-4 py-2.5 border-t border-[#2F5F7A]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#8FA7B5]">Total execution time</span>
                <span className="text-[#59C3C3]">{executionTime}</span>
              </div>
            </div>
          )}
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
          background: #2F5F7A;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #2F5F7A;
        }
      `}</style>
    </div>
  );
}
