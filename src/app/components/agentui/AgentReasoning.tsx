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
        return <div className="w-2 h-2 rounded-full bg-[#59C3C3]" />;
      case "running":
        return <Loader2 className="w-3.5 h-3.5 text-[#2E86AB] animate-spin" />;
      case "pending":
        return <div className="w-2 h-2 rounded-full bg-[#2F5F7A] border border-[#2F5F7A]" />;
    }
  };

  const getStepStyles = (status: ReasoningStatus) => {
    switch (status) {
      case "completed":
        return "text-[#C7D2DA] border-[#2F5F7A]";
      case "running":
        return "text-[#F1F5F9] border-[#2F5F7A] bg-[#102A43]";
      case "pending":
        return "text-[#8FA7B5] border-[#2F5F7A]";
    }
  };

  const getIconColor = (status: ReasoningStatus) => {
    switch (status) {
      case "completed":
        return "text-[#59C3C3] bg-[#59C3C3]/10";
      case "running":
        return "text-[#2E86AB] bg-[#2E86AB]/10";
      case "pending":
        return "text-[#8FA7B5] bg-[#102A43]";
    }
  };

  return (
    <div className="bg-[#0B1E2D] border border-[#2F5F7A] rounded-[10px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2F5F7A]">
        <h3 className="text-[#F1F5F9] text-sm font-medium flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#2E86AB]" />
          {title}
        </h3>
        <p className="text-xs text-[#8FA7B5] mt-0.5">
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
                {!isLast && (
                  <div className="absolute left-[21px] top-[42px] w-px h-[calc(100%+4px)] bg-[#2F5F7A]" />
                )}

                <div
                  className={`relative flex gap-3 p-3 rounded-lg border transition-colors ${stepStyles} mb-1`}
                >
                  <div className="flex flex-col items-center gap-2 flex-shrink-0 pt-0.5">
                    {getStatusIndicator(step.status)}
                  </div>

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

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-[#2F5F7A]">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#8FA7B5]">
            {steps.filter((s) => s.status === "completed").length} of{" "}
            {steps.length} steps completed
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#59C3C3]" />
              <span className="text-[#8FA7B5]">Done</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#2E86AB]" />
              <span className="text-[#8FA7B5]">Active</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#2F5F7A]" />
              <span className="text-[#8FA7B5]">Pending</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
