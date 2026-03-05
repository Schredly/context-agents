import { ExternalLink, Play, BookOpen, RefreshCw, Zap } from "lucide-react";

export type ActionType = "servicenow" | "automation" | "knowledge" | "refine";

export interface AgentAction {
  id: string;
  type: ActionType;
  label: string;
  description?: string;
  enabled?: boolean;
}

interface AgentActionsProps {
  actions?: AgentAction[];
  onAction?: (type: ActionType) => void;
  title?: string;
}

const defaultActions: AgentAction[] = [
  {
    id: "1",
    type: "servicenow",
    label: "Update ServiceNow",
    description: "Create incident ticket with findings",
    enabled: true,
  },
  {
    id: "2",
    type: "automation",
    label: "Run Automation",
    description: "Execute remediation workflow",
    enabled: true,
  },
  {
    id: "3",
    type: "knowledge",
    label: "Open Knowledge Article",
    description: "View related documentation",
    enabled: true,
  },
  {
    id: "4",
    type: "refine",
    label: "Refine Question",
    description: "Adjust query parameters",
    enabled: true,
  },
];

export function AgentActions({
  actions = defaultActions,
  onAction,
  title = "Agent Actions",
}: AgentActionsProps) {
  const getActionIcon = (type: ActionType) => {
    switch (type) {
      case "servicenow":
        return <ExternalLink className="w-4 h-4" />;
      case "automation":
        return <Play className="w-4 h-4" />;
      case "knowledge":
        return <BookOpen className="w-4 h-4" />;
      case "refine":
        return <RefreshCw className="w-4 h-4" />;
    }
  };

  const getActionStyles = (type: ActionType) => {
    switch (type) {
      case "servicenow":
        return {
          button:
            "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 border-emerald-500/50",
          glow: "shadow-emerald-500/30 hover:shadow-emerald-500/50",
          text: "text-white",
        };
      case "automation":
        return {
          button:
            "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-blue-500/50",
          glow: "shadow-blue-500/30 hover:shadow-blue-500/50",
          text: "text-white",
        };
      case "knowledge":
        return {
          button:
            "bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 border-purple-500/50",
          glow: "shadow-purple-500/30 hover:shadow-purple-500/50",
          text: "text-white",
        };
      case "refine":
        return {
          button:
            "bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 border-gray-500/50",
          glow: "shadow-gray-500/20 hover:shadow-gray-500/40",
          text: "text-white",
        };
    }
  };

  const handleClick = (type: ActionType) => {
    if (onAction) {
      onAction(type);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              {title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Automated workflows and integrations
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-gray-400">Ready</span>
          </div>
        </div>
      </div>

      {/* Actions Grid */}
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {actions.map((action) => {
            const styles = getActionStyles(action.type);
            const disabled = action.enabled === false;

            return (
              <button
                key={action.id}
                onClick={() => handleClick(action.type)}
                disabled={disabled}
                className={`group relative flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-300 ${
                  styles.button
                } ${styles.glow} shadow-lg ${
                  disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:scale-[1.02] active:scale-[0.98]"
                }`}
              >
                {/* Background shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-lg" />

                {/* Icon container */}
                <div className="relative z-10 p-2 rounded-lg bg-white/10 backdrop-blur-sm">
                  {getActionIcon(action.type)}
                </div>

                {/* Text content */}
                <div className="relative z-10 flex-1 text-left">
                  <div className={`text-sm ${styles.text}`}>
                    {action.label}
                  </div>
                  {action.description && (
                    <div className="text-xs text-white/70 mt-0.5">
                      {action.description}
                    </div>
                  )}
                </div>

                {/* Arrow indicator */}
                <div className="relative z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>

                {/* Glow accent */}
                {!disabled && (
                  <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl bg-current" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-950/50">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            {actions.filter((a) => a.enabled !== false).length} action
            {actions.filter((a) => a.enabled !== false).length !== 1 ? "s" : ""}{" "}
            available
          </span>
          <span className="text-gray-600">Workflow automation enabled</span>
        </div>
      </div>
    </div>
  );
}
