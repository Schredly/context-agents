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
import { PromptEditor } from "../components/agentui/PromptEditor";
import { streamAgent } from "../services/agentStream";

interface Message {
  id: string;
  type: "user" | "agent-structured" | "agent-draft" | "agent-question" | "agent-result";
  content: string;
  timestamp: string;
  result?: string;
  catalogData?: string;
  draftLabel?: string;
}

interface DraftState {
  actionId: string;
  draftPrompt: string;
  catalogData: string;
  approveLabel?: string;
  draftLabel?: string;
  target?: string;
}

interface InputCollectionState {
  actionId: string;
  field: string;
  prompt: string;
}

interface PendingGithubCommit {
  prompt: string;
  payload: string;
  options: { id: string; name: string; org: string }[];
}

interface PendingNewRepo {
  prompt: string;
  payload: string;
  integrations: { id: string; name: string; org: string }[];
  step: "pick_integration" | "repo_name" | "organization" | "visibility";
  integrationId: string;
  repoName: string;
  organization: string;
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

  // Progress status during loading
  const [loadingStatus, setLoadingStatus] = useState("Agent is thinking...");
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearLoadingTimers = () => {
    loadingTimerRef.current.forEach(clearTimeout);
    loadingTimerRef.current = [];
  };

  const startProgressSteps = (steps: { message: string; delayMs: number }[]) => {
    clearLoadingTimers();
    steps.forEach(({ message, delayMs }) => {
      const timer = setTimeout(() => setLoadingStatus(message), delayMs);
      loadingTimerRef.current.push(timer);
    });
  };

  // Draft refinement mode
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const draftStateRef = useRef<DraftState | null>(null);

  // Input collection mode (action needs user input before executing)
  const [inputState, setInputState] = useState<InputCollectionState | null>(null);
  const [pendingGithubCommit, setPendingGithubCommit] = useState<PendingGithubCommit | null>(null);
  const [pendingNewRepo, setPendingNewRepo] = useState<PendingNewRepo | null>(null);
  const [refiningPrompt, setRefiningPrompt] = useState(false);

  const cancelRef = useRef<(() => void) | null>(null);
  const reasoningCountRef = useRef(0);
  const skillCountRef = useRef(0);
  const toolCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keep ref in sync so handleApprove always reads the latest draft
  useEffect(() => {
    draftStateRef.current = draftState;
  }, [draftState]);

  useEffect(() => {
    const check = () => setNarrowViewport(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const appendReasoningFromResponse = (data: Record<string, unknown>) => {
    if (Array.isArray(data.reasoning) && data.reasoning.length > 0) {
      const icons = ["target", "search", "check", "zap", "file", "git-commit"];
      setReasoningSteps((prev) => {
        const offset = prev.length;
        const newSteps: ReasoningStep[] = (data.reasoning as string[]).map((msg, i) => ({
          id: `ar${offset + i}`,
          label: msg,
          description: "",
          status: "completed" as const,
          icon: icons[(offset + i) % icons.length] || "zap",
        }));
        return [...prev, ...newSteps];
      });
    }
  };

  const handleSendMessage = async (content: string) => {
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // --- Input collection mode: user is providing input for an action ---
    if (inputState) {
      const userMsg: Message = { id: Date.now().toString(), type: "user", content, timestamp: now };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      startProgressSteps([
        { message: "Connecting to ServiceNow...", delayMs: 0 },
        { message: "Fetching catalog from ServiceNow...", delayMs: 1500 },
        { message: "Received catalog data — cleaning and formatting...", delayMs: 4000 },
        { message: "Analyzing catalog structure...", delayMs: 6000 },
        { message: "Generating draft prompt...", delayMs: 9000 },
        { message: "Finalizing draft — almost done...", delayMs: 20000 },
      ]);

      try {
        const res = await fetch(`/api/admin/acme/actions/${inputState.actionId}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            run_id: runId || "",
            input: { [inputState.field]: content },
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setInputState(null);
          const detail = data.detail || data.error || `Server error ${res.status}`;
          const errMsg: Message = {
            id: (Date.now() + 1).toString(),
            type: "agent-result",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: `Error: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
          };
          setMessages((prev) => [...prev, errMsg]);
          clearLoadingTimers();
          setIsLoading(false);
          return;
        }

        if (data.status === "draft" && data.draft_prompt) {
          // Populate reasoning steps from the action response
          appendReasoningFromResponse(data);
          // Transition to draft mode
          setInputState(null);
          setDraftState({
            actionId: inputState.actionId,
            draftPrompt: data.draft_prompt,
            catalogData: data.catalog_data || "",
            approveLabel: data.approve_label || undefined,
            draftLabel: data.draft_label || undefined,
            target: data.target || undefined,
          });
          // For GitHub target, the PromptEditor component handles display — no message needed
          if (data.target !== "github") {
            const agentMsg: Message = {
              id: (Date.now() + 1).toString(),
              type: "agent-draft",
              content: data.draft_prompt,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              catalogData: data.catalog_data || undefined,
              draftLabel: data.draft_label || undefined,
            };
            setMessages((prev) => [...prev, agentMsg]);
          }
        } else if (data.status === "error") {
          setInputState(null);
          const errMsg: Message = {
            id: (Date.now() + 1).toString(),
            type: "agent-result",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: `Error: ${data.error || data.message || "Action execution failed"}`,
          };
          setMessages((prev) => [...prev, errMsg]);
        } else {
          // Unexpected status — show whatever we got
          setInputState(null);
          const errMsg: Message = {
            id: (Date.now() + 1).toString(),
            type: "agent-result",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: `Error: Unexpected response — ${data.status || "no status"}: ${data.error || data.message || JSON.stringify(data).slice(0, 200)}`,
          };
          setMessages((prev) => [...prev, errMsg]);
        }
      } catch (err) {
        setInputState(null);
        const errText = err instanceof Error ? err.message : "Network error";
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          type: "agent-result",
          content: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          result: `Error: ${errText}`,
        };
        setMessages((prev) => [...prev, errMsg]);
      }
      clearLoadingTimers();
      setIsLoading(false);
      return;
    }

    // --- GitHub target selection: user chose which integration to use ---
    if (pendingGithubCommit) {
      const userMsg: Message = { id: Date.now().toString(), type: "user", content, timestamp: now };
      setMessages((prev) => [...prev, userMsg]);
      const pick = parseInt(content.trim(), 10);
      const { prompt: ghPrompt, payload: ghPayload, options } = pendingGithubCommit;
      setPendingGithubCommit(null);

      if (isNaN(pick) || pick < 1 || pick > options.length + 1) {
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          type: "agent-result",
          content: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          result: `Invalid selection "${content.trim()}". Please try pushing to GitHub again.`,
        };
        setMessages((prev) => [...prev, errMsg]);
        return;
      }

      if (pick === options.length + 1) {
        // "Create new repository" — start multi-step collection
        if (options.length === 1) {
          // Single integration — auto-select it for auth, skip to repo_name
          const askName: Message = {
            id: (Date.now() + 1).toString(),
            type: "agent-question",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: `Using "${options[0].name}" for authentication.\n\nWhat should the new repository be named? (e.g. servicenow-catalog-export)`,
          };
          setMessages((prev) => [...prev, askName]);
          setPendingNewRepo({
            prompt: ghPrompt, payload: ghPayload, integrations: options,
            step: "repo_name", integrationId: options[0].id, repoName: "", organization: "",
          });
        } else {
          // Multiple integrations — ask which PAT to use
          const lines = options.map((o, i) => `${i + 1}. ${o.name} — org: ${o.org || "none"}`);
          const askAuth: Message = {
            id: (Date.now() + 1).toString(),
            type: "agent-question",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: `Which integration's access token should be used?\n\n${lines.join("\n")}\n\nReply with the number.`,
          };
          setMessages((prev) => [...prev, askAuth]);
          setPendingNewRepo({
            prompt: ghPrompt, payload: ghPayload, integrations: options,
            step: "pick_integration", integrationId: "", repoName: "", organization: "",
          });
        }
        return;
      }

      const selectedIntegration = options[pick - 1];
      handleCommitToGithub(ghPrompt, ghPayload, selectedIntegration.id);
      return;
    }

    // --- Create new repo: multi-step input collection ---
    if (pendingNewRepo) {
      const userMsg: Message = { id: Date.now().toString(), type: "user", content, timestamp: now };
      setMessages((prev) => [...prev, userMsg]);
      const val = content.trim();

      if (pendingNewRepo.step === "pick_integration") {
        const idx = parseInt(val, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= pendingNewRepo.integrations.length) {
          const err: Message = {
            id: (Date.now() + 1).toString(), type: "agent-result", content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: `Invalid selection. Enter 1–${pendingNewRepo.integrations.length}.`,
          };
          setMessages((prev) => [...prev, err]);
          return;
        }
        const picked = pendingNewRepo.integrations[idx];
        const askName: Message = {
          id: (Date.now() + 1).toString(), type: "agent-question", content: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          result: `Using "${picked.name}" for authentication.\n\nWhat should the new repository be named? (e.g. servicenow-catalog-export)`,
        };
        setMessages((prev) => [...prev, askName]);
        setPendingNewRepo({ ...pendingNewRepo, step: "repo_name", integrationId: picked.id });
        return;
      }

      if (pendingNewRepo.step === "repo_name") {
        if (!val) {
          const err: Message = {
            id: (Date.now() + 1).toString(), type: "agent-result", content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: "Repository name cannot be empty.",
          };
          setMessages((prev) => [...prev, err]);
          return;
        }
        const askOrg: Message = {
          id: (Date.now() + 1).toString(), type: "agent-question", content: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          result: "What GitHub organization should own this repository? (e.g. acme-corp)",
        };
        setMessages((prev) => [...prev, askOrg]);
        setPendingNewRepo({ ...pendingNewRepo, step: "organization", repoName: val });
        return;
      }

      if (pendingNewRepo.step === "organization") {
        if (!val) {
          const err: Message = {
            id: (Date.now() + 1).toString(), type: "agent-result", content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: "Organization cannot be empty.",
          };
          setMessages((prev) => [...prev, err]);
          return;
        }
        const askVis: Message = {
          id: (Date.now() + 1).toString(), type: "agent-question", content: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          result: "Should the repository be private or public?\n\n1. Private\n2. Public\n\nReply with 1 or 2.",
        };
        setMessages((prev) => [...prev, askVis]);
        setPendingNewRepo({ ...pendingNewRepo, step: "visibility", organization: val });
        return;
      }

      if (pendingNewRepo.step === "visibility") {
        let visibility = "private";
        if (val === "2" || val.toLowerCase() === "public") {
          visibility = "public";
        } else if (val !== "1" && val.toLowerCase() !== "private") {
          const err: Message = {
            id: (Date.now() + 1).toString(), type: "agent-result", content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: "Please reply with 1 (Private) or 2 (Public).",
          };
          setMessages((prev) => [...prev, err]);
          return;
        }

        // All fields collected — call backend
        const { prompt: repoPrompt, payload: repoPayload, integrationId, repoName, organization } = pendingNewRepo;
        setPendingNewRepo(null);
        setIsLoading(true);

        try {
          const res = await fetch("/api/admin/acme/agent/create-github-repo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              repo_name: repoName,
              org: organization,
              visibility,
              integration_id: integrationId,
              prompt: repoPrompt,
              payload: repoPayload,
            }),
          });
          const data = await res.json();
          appendReasoningFromResponse(data);
          const resultMsg: Message = {
            id: (Date.now() + 1).toString(),
            type: "agent-result",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: data.status === "ok"
              ? `${data.message}\n\nRepository: ${data.repo_url}`
              : data.message || "Failed to create repository.",
          };
          setMessages((prev) => [...prev, resultMsg]);
        } catch (err) {
          const errText = err instanceof Error ? err.message : "Network error";
          const errMsg: Message = {
            id: (Date.now() + 1).toString(), type: "agent-result", content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: `Create repo failed: ${errText}`,
          };
          setMessages((prev) => [...prev, errMsg]);
        }
        setDraftState(null);
        setIsLoading(false);
        return;
      }
    }

    // --- Refinement mode: call refine-prompt instead of streamAgent (non-GitHub drafts only) ---
    if (draftState && draftState.target !== "github") {
      const userMsg: Message = { id: Date.now().toString(), type: "user", content, timestamp: now };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      startProgressSteps([
        { message: "Processing your feedback...", delayMs: 0 },
        { message: "Refining the Replit prompt...", delayMs: 3000 },
        { message: "Incorporating changes — almost done...", delayMs: 10000 },
      ]);

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
        if (!res.ok) {
          const errorDetail = data.detail || data.error || `Server error ${res.status}`;
          const detail = typeof errorDetail === "string" ? errorDetail : JSON.stringify(errorDetail);
          setMessages((prev) => [
            ...prev,
            { id: (Date.now() + 1).toString(), type: "user" as const, content: `Refinement error: ${detail}. You can still approve the current prompt or try different feedback.`, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
          ]);
          clearLoadingTimers();
          setIsLoading(false);
          return;
        }
        if (data.refined_prompt) {
          setDraftState((prev) => {
            const updated = prev ? { ...prev, draftPrompt: data.refined_prompt } : null;
            draftStateRef.current = updated;  // sync ref immediately (don't wait for useEffect)
            return updated;
          });
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
      clearLoadingTimers();
      setIsLoading(false);
      return;
    }

    // --- Normal mode: stream agent ---
    cancelRef.current?.();

    const userMsg: Message = { id: Date.now().toString(), type: "user", content, timestamp: now };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setLoadingStatus("Agent is thinking...");

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

  const handleDraftReady = (result: { draft_prompt: string; catalog_data: string; action_id: string; approve_label?: string; draft_label?: string; target?: string; reasoning?: string[] }) => {
    if (result.reasoning) {
      appendReasoningFromResponse({ reasoning: result.reasoning });
    }
    setDraftState({
      actionId: result.action_id,
      draftPrompt: result.draft_prompt,
      catalogData: result.catalog_data,
      approveLabel: result.approve_label,
      draftLabel: result.draft_label,
      target: result.target,
    });
    // For GitHub target, PromptEditor handles display inline
    if (result.target !== "github") {
      const agentMsg: Message = {
        id: Date.now().toString(),
        type: "agent-draft",
        content: result.draft_prompt,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        catalogData: result.catalog_data || undefined,
        draftLabel: result.draft_label || undefined,
      };
      setMessages((prev) => [...prev, agentMsg]);
    }
  };

  const handleApprove = async () => {
    const currentDraft = draftStateRef.current;
    if (!currentDraft) return;

    // Always copy the approved prompt to clipboard immediately (before async call)
    const promptToCopy = currentDraft.draftPrompt;
    if (promptToCopy) {
      navigator.clipboard.writeText(promptToCopy).catch(() => {});
    }

    setIsLoading(true);
    try {
      const endpoint = currentDraft.target === "github"
        ? "/api/admin/acme/agent/approve-github"
        : "/api/admin/acme/agent/approve-replit";

      const bodyPayload: Record<string, string> = { approved_prompt: promptToCopy };
      if (currentDraft.target === "github" && currentDraft.catalogData) {
        bodyPayload.catalog_data = currentDraft.catalogData;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (data.repl_url) {
        window.open(data.repl_url, "_blank");
      }
      const successMsg: Message = {
        id: Date.now().toString(),
        type: "agent-result",
        content: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        result: data.message || "Approved successfully!",
      };
      setMessages((prev) => [...prev, successMsg]);
    } catch (err) {
      const errText = err instanceof Error ? err.message : "Network error";
      const errMsg: Message = {
        id: Date.now().toString(),
        type: "agent-result",
        content: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        result: `Approval failed: ${errText}`,
      };
      setMessages((prev) => [...prev, errMsg]);
    }
    setDraftState(null);
    setIsLoading(false);
  };

  const handleCommitToGithub = async (prompt: string, payload: string, integrationId?: string) => {
    setIsLoading(true);
    try {
      const body: Record<string, string> = { prompt, payload };
      if (integrationId) body.integration_id = integrationId;

      const res = await fetch("/api/admin/acme/agent/commit-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      // Append reasoning from any response type
      appendReasoningFromResponse(data);

      // Backend returned needs_input — user must pick a GitHub integration
      if (data.status === "needs_input" && data.field === "github_target") {
        const options = data.options || [];
        // Auto-select when there's only 1 integration
        if (options.length === 1) {
          const autoMsg: Message = {
            id: Date.now().toString(),
            type: "agent-result",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            result: `Auto-selected GitHub integration: ${options[0].name}`,
          };
          setMessages((prev) => [...prev, autoMsg]);
          setDraftState(null);
          // Re-call with the selected integration
          await handleCommitToGithub(prompt, payload, options[0].id);
          return;
        }
        const pickMsg: Message = {
          id: Date.now().toString(),
          type: "agent-question",
          content: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          result: data.prompt,
        };
        setMessages((prev) => [...prev, pickMsg]);
        setPendingGithubCommit({ prompt, payload, options });
        setDraftState(null);
        setIsLoading(false);
        return;
      }

      if (data.status === "error") {
        const errMsg: Message = {
          id: Date.now().toString(),
          type: "agent-result",
          content: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          result: data.message || "GitHub commit failed.",
        };
        setMessages((prev) => [...prev, errMsg]);
      } else {
        const fileList = Array.isArray(data.files_pushed)
          ? "\n\nFiles committed:\n" + data.files_pushed.map((f: string) => `  • ${f}`).join("\n")
          : "";
        const repoLink = data.repo_url ? `\n\nRepository: ${data.repo_url}` : "";
        const successMsg: Message = {
          id: Date.now().toString(),
          type: "agent-result",
          content: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          result: (data.message || "Committed to GitHub successfully!") + fileList + repoLink,
        };
        setMessages((prev) => [...prev, successMsg]);
      }
    } catch (err) {
      const errText = err instanceof Error ? err.message : "Network error";
      const errMsg: Message = {
        id: Date.now().toString(),
        type: "agent-result",
        content: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        result: `Commit failed: ${errText}`,
      };
      setMessages((prev) => [...prev, errMsg]);
    }
    setDraftState(null);
    setIsLoading(false);
  };

  const handleRefineGithubPrompt = async (currentPrompt: string, catalogData: string) => {
    setRefiningPrompt(true);
    try {
      const res = await fetch("/api/admin/acme/agent/refine-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_prompt: currentPrompt,
          user_feedback: "Improve this prompt. Make it clearer and more specific based on the catalog data.",
          catalog_data: catalogData,
        }),
      });
      const data = await res.json();
      if (data.refined_prompt) {
        setDraftState((prev) => {
          const updated = prev ? { ...prev, draftPrompt: data.refined_prompt } : null;
          draftStateRef.current = updated;
          return updated;
        });
      }
    } catch {
      // silently keep current prompt on failure
    }
    setRefiningPrompt(false);
  };

  const handleCancelRefine = () => {
    setDraftState(null);
    const cancelMsg: Message = {
      id: Date.now().toString(),
      type: "agent-structured",
      content: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      result: "Prompt editing cancelled.",
    };
    setMessages((prev) => [...prev, cancelMsg]);
  };

  const handleNeedsInput = (result: { action_id: string; field: string; prompt: string; reasoning?: string[] }) => {
    if (result.reasoning) {
      appendReasoningFromResponse({ reasoning: result.reasoning });
    }
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
    <div className="h-screen flex flex-col bg-white">
      {/* Top Header */}
      <TopBar
        agentName="OverYonder.ai Agent"
        tenant="Production - ACME Corp"
        status={isLoading ? "processing" : "connected"}
      />

      {/* Main Content Area - Two Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat Conversation Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {/* Scrollable chat area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.length === 0 && !isLoading && (
                <div className="flex items-center justify-center h-full min-h-[300px]">
                  <div className="text-center">
                    <h3 className="text-gray-900 text-lg font-medium mb-1">Ask the OverYonder.ai Agent</h3>
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
                if (message.type === "agent-draft") {
                  // Parse and render the draft in a human-readable way
                  const renderDraftContent = (raw: string) => {
                    // Strip HTML tags and decode entities
                    const stripHtml = (s: string) => {
                      const doc = new DOMParser().parseFromString(s, "text/html");
                      return doc.body.textContent || s;
                    };
                    const cleaned = stripHtml(raw);

                    // Try to detect if the content has a leading text section + JSON payload
                    const jsonStart = cleaned.search(/\n\s*\{[\s\S]*"(name|result|catalog)/);
                    if (jsonStart > 0) {
                      const textPart = cleaned.slice(0, jsonStart).trim();
                      const jsonPart = cleaned.slice(jsonStart).trim();
                      let parsed: Record<string, unknown> | null = null;
                      try { parsed = JSON.parse(jsonPart); } catch { /* not valid JSON, show as-is */ }

                      if (parsed) {
                        return (
                          <>
                            <p className="text-sm text-gray-900 leading-relaxed mb-3">{textPart}</p>
                            <div className="bg-white rounded-lg p-3 border border-gray-200 overflow-auto max-h-[400px] custom-scrollbar">
                              <pre className="text-xs text-orange-600 whitespace-pre-wrap font-mono leading-relaxed">{JSON.stringify(parsed, null, 2)}</pre>
                            </div>
                          </>
                        );
                      }
                    }

                    // Try to parse the entire content as JSON
                    try {
                      const fullJson = JSON.parse(cleaned);
                      return (
                        <div className="bg-white rounded-lg p-3 border border-gray-200 overflow-auto max-h-[400px] custom-scrollbar">
                          <pre className="text-xs text-orange-600 whitespace-pre-wrap font-mono leading-relaxed">{JSON.stringify(fullJson, null, 2)}</pre>
                        </div>
                      );
                    } catch { /* not JSON */ }

                    // Plain text — render as readable paragraphs
                    return <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{cleaned}</p>;
                  };

                  const tryPrettyPrint = (raw: string) => {
                    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
                  };

                  return (
                    <div key={message.id} className="bg-gray-50 border border-amber-500/30 rounded-[10px] p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">
                          {message.draftLabel || "Draft Prompt"}
                        </span>
                        <span className="text-xs text-gray-500 ml-auto">{message.timestamp}</span>
                      </div>

                      {/* Prompt section (editable via refinement) */}
                      {message.catalogData && (
                        <div className="mb-2">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Prompt (editable)</span>
                        </div>
                      )}
                      {renderDraftContent(message.content)}

                      {/* Payload section (read-only) */}
                      {message.catalogData && (
                        <div className="mt-4">
                          <div className="mb-2">
                            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Payload (read only)</span>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-gray-200 overflow-auto max-h-[400px] custom-scrollbar">
                            <pre className="text-xs text-orange-600 whitespace-pre-wrap font-mono leading-relaxed">
                              {tryPrettyPrint(message.catalogData)}
                            </pre>
                          </div>
                        </div>
                      )}

                      <p className="text-xs text-gray-500 mt-3">
                        Type feedback below to refine, or click the approve button when ready.
                      </p>
                    </div>
                  );
                }
                if (message.type === "agent-question") {
                  return (
                    <div key={message.id} className="bg-gray-50 border border-orange-400/40 rounded-[10px] p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="text-xs font-medium text-orange-600 uppercase tracking-wider">Agent</span>
                        <span className="text-xs text-gray-500 ml-auto">{message.timestamp}</span>
                      </div>
                      <pre className="text-sm text-gray-900 whitespace-pre-wrap font-sans">{message.result || message.content}</pre>
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
                      {!draftState && !inputState && (
                        <div className="mt-4">
                          <AgentActions
                            onAction={handleAgentAction}
                            onDraftReady={handleDraftReady}
                            onNeedsInput={handleNeedsInput}
                            runId={runId}
                          />
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })}

              {/* Show actions only when NOT in draft/refine or input mode */}
              {/* (draft mode has its own Approve/Refine controls in the InputPanel) */}

              {/* Inline PromptEditor for GitHub drafts */}
              {draftState?.target === "github" && !isLoading && (
                <PromptEditor
                  initialPrompt={draftState.draftPrompt}
                  payload={draftState.catalogData}
                  draftLabel={draftState.draftLabel}
                  commitLabel={draftState.approveLabel || "Push to GitHub"}
                  onCommit={handleCommitToGithub}
                  onRefine={handleRefineGithubPrompt}
                  onCancel={handleCancelRefine}
                  disabled={isLoading}
                  refining={refiningPrompt}
                />
              )}

              {isLoading && (
                <div className="flex items-center gap-3 text-gray-600 py-4">
                  <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                  <span className="text-sm">{loadingStatus}</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Fixed Input Panel at Bottom — hidden when PromptEditor is active */}
          {!(draftState?.target === "github") && (
            <InputPanel
              onSend={handleSendMessage}
              disabled={isLoading}
              mode={draftState ? "refine" : (inputState || pendingGithubCommit || pendingNewRepo) ? "input" : "normal"}
              onApprove={draftState ? handleApprove : undefined}
              onCancelRefine={draftState ? handleCancelRefine : undefined}
              inputPrompt={
                inputState?.prompt
                || (pendingGithubCommit ? "Enter the number of the GitHub integration to use" : undefined)
                || (pendingNewRepo?.step === "pick_integration" ? "Select an integration by number" : undefined)
                || (pendingNewRepo?.step === "repo_name" ? "Enter a repository name" : undefined)
                || (pendingNewRepo?.step === "organization" ? "Enter the GitHub organization" : undefined)
                || (pendingNewRepo?.step === "visibility" ? "Enter 1 (Private) or 2 (Public)" : undefined)
              }
              approveLabel={draftState?.approveLabel}
            />
          )}
        </div>

        {/* Right: Agent Execution Trace Panel (hidden at narrow viewports / high zoom) */}
        <div className={`w-96 border-l border-gray-200 bg-white flex flex-col ${narrowViewport ? "hidden" : ""}`}>
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-gray-900 text-sm font-medium flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? "bg-orange-500 animate-pulse" : "bg-orange-400"}`} />
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
                <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.08em] px-1">
                  Reasoning Steps
                </span>
                <div className="mt-2">
                  <AgentReasoning steps={reasoningSteps} />
                </div>
              </div>
            )}

            {selectedUseCase && (
              <div>
                <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.08em] px-1">
                  Selected Use Case
                </span>
                <div className="mt-2">
                  <SelectedUseCase
                    name={selectedUseCase.name}
                    description={selectedUseCase.description}
                    confidence={selectedUseCase.confidence}
                    category="OverYonder.ai Operations"
                  />
                </div>
              </div>
            )}

            {skillExecutions.length > 0 && (
              <div>
                <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.08em] px-1">
                  Skills Executed
                </span>
                <div className="mt-2">
                  <SkillExecutionTimeline skills={skillExecutions} />
                </div>
              </div>
            )}

            {toolCalls.length > 0 && (
              <div>
                <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.08em] px-1">
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
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm">No execution trace yet</p>
                  <p className="text-gray-500 text-xs mt-1">Ask a question to see the agent work</p>
                </div>
              </div>
            )}
          </div>

          {/* Trace Panel Footer */}
          {executionTime && (
            <div className="px-4 py-2.5 border-t border-gray-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Total execution time</span>
                <span className="text-orange-500">{executionTime}</span>
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
          background: #d1d5db;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
      `}</style>
    </div>
  );
}
