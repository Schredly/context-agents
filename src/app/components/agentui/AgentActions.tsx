import { ExternalLink, Play, BookOpen, RefreshCw, Zap, Loader2, CheckCircle2, Star, AlertCircle, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useGoogleAuth } from "../../auth/GoogleAuthContext";
import { getAccessToken as getGoogleToken } from "../../auth/google-auth";

export type ActionType = string;

export interface AgentAction {
  id: string;
  type: ActionType;
  label: string;
  description?: string;
  enabled?: boolean;
  integration_id?: string;
  operation?: string;
  score?: number;
}

interface ExecutionResult {
  status: string;
  message?: string;
  number?: string;
  name?: string;
  folder_path?: string;
  web_link?: string;
  channel?: string;
  key?: string;
  url?: string;
  download_url?: string;
  repl_url?: string;
  prompt_text?: string;
  project_id?: string;
  error?: string;
}

interface DraftReadyPayload {
  draft_prompt: string;
  catalog_data: string;
  action_id: string;
  approve_label?: string;
  draft_label?: string;
  reasoning?: string[];
  target?: string;
}

interface NeedsInputPayload {
  action_id: string;
  field: string;
  prompt: string;
  reasoning?: string[];
}

interface AgentActionsProps {
  actions?: AgentAction[];
  onAction?: (type: ActionType) => void;
  onDraftReady?: (result: DraftReadyPayload) => void;
  onNeedsInput?: (result: NeedsInputPayload) => void;
  title?: string;
  runId?: string | null;
}

const API_BASE = "/api/admin/acme/actions";

function getActionIcon(integration: string) {
  switch (integration) {
    case "servicenow":
      return <ExternalLink className="w-4 h-4" />;
    case "jira":
    case "github":
      return <Play className="w-4 h-4" />;
    case "google-drive":
      return <BookOpen className="w-4 h-4" />;
    case "slack":
      return <RefreshCw className="w-4 h-4" />;
    case "replit":
      return <Zap className="w-4 h-4" />;
    default:
      return <Zap className="w-4 h-4" />;
  }
}

function getIndicatorColor(integration: string) {
  switch (integration) {
    case "servicenow":
      return "bg-orange-400";
    case "jira":
    case "github":
      return "bg-orange-500";
    case "google-drive":
      return "bg-violet-500";
    case "slack":
      return "bg-orange-500";
    case "replit":
      return "bg-emerald-500";
    default:
      return "bg-amber-500";
  }
}

function ActionButton({
  action,
  isRecommended,
  executingId,
  completedIds,
  refiningIds,
  resultMap,
  onClick,
  onDelete,
}: {
  action: AgentAction;
  isRecommended?: boolean;
  executingId: string | null;
  completedIds: Set<string>;
  refiningIds: Set<string>;
  resultMap: Map<string, ExecutionResult>;
  onClick: (action: AgentAction) => void;
  onDelete?: (action: AgentAction) => void;
}) {
  const integration = action.integration_id || action.type;
  const disabled = action.enabled === false;
  const isExecuting = executingId === action.id;
  const isCompleted = completedIds.has(action.id);
  const isRefining = refiningIds.has(action.id);
  const result = resultMap.get(action.id);
  const isError = result?.status === "error" || result?.status === "not_implemented";
  const indicatorColor = getIndicatorColor(integration);

  function resultMessage(): string {
    if (!result) return "Completed";
    if (result.repl_url) return result.message || "Prompt copied — click to open Replit";
    if (result.number) return `Created ${result.number}`;
    if (result.key) return `Created ${result.key}`;
    if (result.download_url) return `Report ready — click to download`;
    if (result.channel && result.status === "ok") return `Sent to ${result.channel}`;
    if (result.name && result.folder_path) return `Created ${result.name} in ${result.folder_path}`;
    if (result.name) return `Created ${result.name}`;
    if (result.status === "not_implemented") return result.message || "Not connected";
    if (result.error) return `Error: ${result.error}`;
    if (result.status === "ok") return "Completed successfully";
    return "Completed";
  }

  return (
    <button
      onClick={() => {
        // If completed with a download URL, open it instead of re-executing
        if (isCompleted && result?.repl_url) {
          if (result.prompt_text) {
            navigator.clipboard.writeText(result.prompt_text).catch(() => {});
          }
          window.open(result.repl_url, "_blank");
          return;
        }
        if (isCompleted && result?.download_url) {
          window.open(`http://localhost:8000${result.download_url}`, "_blank");
          return;
        }
        onClick(action);
      }}
      disabled={disabled || isExecuting || isRefining}
      className={`group relative flex items-center gap-3 px-4 py-3 rounded-[10px] border transition-colors duration-150 ${
        isError
          ? "bg-gray-50 border-red-500/40"
          : isRefining
          ? "bg-gray-50 border-amber-500/40"
          : isCompleted
          ? "bg-gray-50 border-orange-400/40"
          : isRecommended
          ? "bg-orange-50 border-gray-200 border-l-[3px] border-l-orange-400 hover:bg-gray-100 hover:border-gray-200 hover:border-l-orange-400"
          : "bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-200"
      } ${
        disabled || isExecuting || isRefining
          ? "opacity-50 cursor-not-allowed"
          : ""
      }`}
    >
      {/* Indicator dot */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div className={`w-2 h-2 rounded-full ${
          isError ? "bg-red-500" : isRefining ? "bg-amber-500 animate-pulse" : isCompleted ? "bg-orange-400" : indicatorColor
        }`} />
        <div className="text-gray-600">
          {isExecuting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isError ? (
            <AlertCircle className="w-4 h-4 text-red-400" />
          ) : isCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-orange-500" />
          ) : (
            getActionIcon(integration)
          )}
        </div>
      </div>

      {/* Text content */}
      <div className="flex-1 text-left">
        <div className="text-sm text-gray-900 flex items-center gap-1.5">
          {action.label}
          {isRecommended && !isCompleted && !isError && (
            <Star className="w-3 h-3 text-gray-600" />
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {isExecuting
            ? "Executing..."
            : isRefining
            ? "In refinement — review prompt in chat"
            : isCompleted || isError
            ? resultMessage()
            : action.description}
        </div>
      </div>

      {/* Delete button */}
      {onDelete && !isExecuting && (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onDelete(action); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onDelete(action); } }}
          className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
          title="Delete action"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </div>
      )}
    </button>
  );
}

export function AgentActions({
  actions: propActions,
  onAction,
  onDraftReady,
  onNeedsInput,
  title = "Agent Actions",
  runId,
}: AgentActionsProps) {
  const { accessToken: googleAccessToken, signIn: signInGoogle, configureClientId, isInitialized: gisReady } = useGoogleAuth();
  const [recommendedActions, setRecommendedActions] = useState<AgentAction[]>([]);
  const [availableActions, setAvailableActions] = useState<AgentAction[]>([]);
  const [fallbackActions, setFallbackActions] = useState<AgentAction[]>([]);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [refiningIds, setRefiningIds] = useState<Set<string>>(new Set());
  const [resultMap, setResultMap] = useState<Map<string, ExecutionResult>>(new Map());

  useEffect(() => {
    if (propActions) return;

    if (runId) {
      fetch(`${API_BASE}/recommendations/${runId}`)
        .then((r) => r.json())
        .then((data: { recommended: any[]; available: any[] }) => {
          setRecommendedActions(
            data.recommended.map((a) => ({
              id: a.id,
              type: a.integration_id || "internal",
              label: a.name,
              description: a.description,
              enabled: true,
              integration_id: a.integration_id,
              operation: a.operation,
              score: a.score,
            }))
          );
          setAvailableActions(
            data.available.map((a) => ({
              id: a.id,
              type: a.integration_id || "internal",
              label: a.name,
              description: a.description,
              enabled: true,
              integration_id: a.integration_id,
              operation: a.operation,
            }))
          );
          setFallbackActions([]);
        })
        .catch(() => {
          fetchAllActions();
        });
    } else {
      fetchAllActions();
    }
  }, [propActions, runId]);

  const fetchAllActions = () => {
    fetch(API_BASE)
      .then((r) => r.json())
      .then((data: any[]) => {
        setFallbackActions(
          data
            .filter((a) => a.status === "active")
            .map((a) => ({
              id: a.id,
              type: a.integration_id || "internal",
              label: a.name,
              description: a.description,
              enabled: true,
              integration_id: a.integration_id,
              operation: a.operation,
            }))
        );
        setRecommendedActions([]);
        setAvailableActions([]);
      })
      .catch(console.error);
  };

  const allActions = propActions ?? (
    recommendedActions.length > 0 || availableActions.length > 0
      ? [...recommendedActions, ...availableActions]
      : fallbackActions
  );

  const handleClick = async (action: AgentAction) => {
    if (onAction) onAction(action.type);

    // Google Drive actions need an OAuth token — initialise GIS + sign in if needed
    if (action.integration_id === "google-drive" && !googleAccessToken) {
      try {
        if (!gisReady) {
          // Fetch the client_id from the saved integration config
          const integrations = await fetch(
            "http://localhost:8000/api/admin/acme/integrations/"
          ).then((r) => r.json()) as Array<{ integration_type: string; config: Record<string, string> }>;
          const driveInt = integrations.find((i) => i.integration_type === "google-drive");
          const clientId = driveInt?.config?.client_id;
          if (!clientId) {
            setResultMap((prev) => new Map(prev).set(action.id, {
              status: "error",
              error: "Configure Google Drive integration first (Settings → Integrations)",
            }));
            setCompletedIds((prev) => new Set(prev).add(action.id));
            return;
          }
          await configureClientId(clientId);
        }
        await signInGoogle();
      } catch {
        setResultMap((prev) => new Map(prev).set(action.id, {
          status: "error",
          error: "Google sign-in required to create Drive documents",
        }));
        setCompletedIds((prev) => new Set(prev).add(action.id));
        return;
      }
    }

    setExecutingId(action.id);
    try {
      // Inject access_token for Google Drive actions (use direct getter in case sign-in just completed)
      const input: Record<string, string> = {};
      if (action.integration_id === "google-drive") {
        const driveToken = getGoogleToken() ?? googleAccessToken;
        if (driveToken) input.access_token = driveToken;
      }
      const res = await fetch(`${API_BASE}/${action.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId || "", input }),
      });
      const data = await res.json();

      // Needs input: action requires user input before executing
      if (data.status === "needs_input" && onNeedsInput) {
        onNeedsInput({
          action_id: action.id,
          field: data.field || "input",
          prompt: data.prompt || "Please provide the required input:",
          reasoning: Array.isArray(data.reasoning) ? data.reasoning : undefined,
        });
        setExecutingId(null);
        return;
      }

      // Phase 1 draft: LLM analyzed the catalog, show draft for refinement
      if (data.status === "draft" && onDraftReady) {
        const prompt = data.draft_prompt || data.catalog_data || "No prompt generated — try again.";
        onDraftReady({
          draft_prompt: prompt,
          catalog_data: data.catalog_data || "",
          action_id: action.id,
          approve_label: data.approve_label || undefined,
          draft_label: data.draft_label || undefined,
          target: data.target || undefined,
          reasoning: Array.isArray(data.reasoning) ? data.reasoning : undefined,
        });
        setRefiningIds((prev) => new Set(prev).add(action.id));
        setExecutingId(null);
        return;
      }

      // For Replit actions: copy prompt to clipboard and open Replit
      if (data.repl_url && data.prompt_text) {
        navigator.clipboard.writeText(data.prompt_text).catch(() => {});
        window.open(data.repl_url, "_blank");
      }
      setResultMap((prev) => new Map(prev).set(action.id, data));
    } catch (err) {
      setResultMap((prev) => new Map(prev).set(action.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Network error",
      }));
    }
    setExecutingId(null);
    setCompletedIds((prev) => new Set(prev).add(action.id));
  };

  const handleDelete = async (action: AgentAction) => {
    try {
      const res = await fetch(`${API_BASE}/${action.id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setRecommendedActions((prev) => prev.filter((a) => a.id !== action.id));
        setAvailableActions((prev) => prev.filter((a) => a.id !== action.id));
        setFallbackActions((prev) => prev.filter((a) => a.id !== action.id));
      }
    } catch {
      // silent
    }
  };

  const hasRecommendations = recommendedActions.length > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-[10px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-gray-900 text-sm font-medium">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {hasRecommendations
                ? "Context-aware actions based on agent analysis"
                : "Automated workflows and integrations"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span className="text-xs text-gray-500">Ready</span>
          </div>
        </div>
      </div>

      {/* Actions Grid */}
      <div className="p-4 space-y-4">
        {/* Recommended Section */}
        {hasRecommendations && (
          <div>
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.08em]">
              Recommended Actions
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {recommendedActions.map((action) => (
                <ActionButton
                  key={action.id}
                  action={action}
                  isRecommended
                  executingId={executingId}
                  completedIds={completedIds}
                  refiningIds={refiningIds}
                  resultMap={resultMap}
                  onClick={handleClick}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        )}

        {/* Other Actions */}
        {hasRecommendations && availableActions.length > 0 && (
          <div>
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.08em]">
              Other Actions
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {availableActions.map((action) => (
                <ActionButton
                  key={action.id}
                  action={action}
                  executingId={executingId}
                  completedIds={completedIds}
                  refiningIds={refiningIds}
                  resultMap={resultMap}
                  onClick={handleClick}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        )}

        {/* Fallback */}
        {!hasRecommendations && fallbackActions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fallbackActions.map((action) => (
              <ActionButton
                key={action.id}
                action={action}
                executingId={executingId}
                completedIds={completedIds}
                refiningIds={refiningIds}
                resultMap={resultMap}
                onClick={handleClick}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {propActions && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {propActions.map((action) => (
              <ActionButton
                key={action.id}
                action={action}
                executingId={executingId}
                completedIds={completedIds}
                refiningIds={refiningIds}
                resultMap={resultMap}
                onClick={handleClick}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            {hasRecommendations
              ? `${recommendedActions.length} recommended, ${availableActions.length} other`
              : `${allActions.length} action${allActions.length !== 1 ? "s" : ""} available`}
          </span>
          <span className="text-gray-500">
            {hasRecommendations ? "Context-aware" : "Automation enabled"}
          </span>
        </div>
      </div>
    </div>
  );
}
