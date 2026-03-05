import { Search, Target, Zap, CheckCircle2, Loader2 } from "lucide-react";

export type ReasoningStatus = "completed" | "running" | "pending";

export interface ReasoningStep {
  id: string;
  label: string;
  description: string;
  status: ReasoningStatus;
  icon?: "search" | "target" | "zap" | "check";
}

interface AgentReasoningProps {
  steps: ReasoningStep[];
  title?: string;
}

export function AgentReasoning({ steps, title = "Agent Reasoning" }: AgentReasoningProps) {
  const getStepIcon = (iconType?: string) => {
    const iconClass = "w-4 h-4";
    switch (iconType) {
      case "search":
        return <Search className={iconClass} />;
      case "target":
        return <Target className={iconClass} />;
      case "zap":
        return <Zap className={iconClass} />;
      case "check":
        return <CheckCircle2 className={iconClass} />;
      default:
        return <Search className={iconClass} />;
    }
  };

  const getStatusIndicator = (status: ReasoningStatus) => {
    switch (status) {
      case "completed":
        return (
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-lg shadow-green-500/50" />
        );
      case "running":
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <div className="absolute inset-0 blur-sm">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin opacity-50" />
            </div>
          </div>
        );
      case "pending":
        return (
          <div className="w-2.5 h-2.5 rounded-full bg-gray-600 border border-gray-500" />
        );
    }
  };

  const getStepStyles = (status: ReasoningStatus) => {
    switch (status) {
      case "completed":
        return "text-gray-300 border-gray-700";
      case "running":
        return "text-white border-blue-500/50 bg-blue-500/5 shadow-lg shadow-blue-500/10";
      case "pending":
        return "text-gray-500 border-gray-800";
    }
  };

  const getIconColor = (status: ReasoningStatus) => {
    switch (status) {
      case "completed":
        return "text-green-400 bg-green-500/10";
      case "running":
        return "text-blue-400 bg-blue-500/10";
      case "pending":
        return "text-gray-600 bg-gray-800/50";
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-950">
        <h3 className="text-white flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          {title}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Step-by-step decision trace
        </p>
      </div>

      {/* Timeline */}
      <div className="p-4">
        <div className="space-y-0">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            const stepStyles = getStepStyles(step.status);
            const iconColor = getIconColor(step.status);

            return (
              <div key={step.id} className="relative">
                {/* Timeline connector line */}
                {!isLast && (
                  <div className="absolute left-[21px] top-[42px] w-0.5 h-[calc(100%+4px)] bg-gray-800" />
                )}

                {/* Step card */}
                <div
                  className={`relative flex gap-3 p-3 rounded-lg border transition-all ${stepStyles} mb-1`}
                >
                  {/* Status indicator */}
                  <div className="flex flex-col items-center gap-2 flex-shrink-0 pt-0.5">
                    {getStatusIndicator(step.status)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <div
                        className={`p-1.5 rounded ${iconColor} flex-shrink-0 mt-0.5`}
                      >
                        {getStepIcon(step.icon)}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm">{step.label}</div>
                        <div className="text-xs opacity-75 mt-0.5">
                          {step.description}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer with step count */}
      <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-950/50">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            {steps.filter((s) => s.status === "completed").length} of{" "}
            {steps.length} steps completed
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-500">Done</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-gray-500">Active</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-gray-600" />
              <span className="text-gray-500">Pending</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
