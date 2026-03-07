import { Brain, Target, Wrench, Zap, CheckCircle2, Clock } from "lucide-react";

interface ExecutionStep {
  type: "reasoning" | "usecase" | "skill" | "tool" | "complete";
  title: string;
  details: string;
  status: "active" | "complete" | "pending";
  timestamp: string;
}

interface ExecutionPanelProps {
  steps: ExecutionStep[];
  confidence?: number;
}

export function ExecutionPanel({ steps, confidence }: ExecutionPanelProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case "reasoning":
        return <Brain className="w-4 h-4" />;
      case "usecase":
        return <Target className="w-4 h-4" />;
      case "skill":
        return <Wrench className="w-4 h-4" />;
      case "tool":
        return <Zap className="w-4 h-4" />;
      case "complete":
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "border-[#2E86AB] bg-[#2E86AB]/10 text-[#2E86AB]";
      case "complete":
        return "border-[#59C3C3] bg-[#59C3C3]/10 text-[#59C3C3]";
      case "pending":
        return "border-[#2F5F7A] bg-[#163A52]/50 text-[#8FA7B5]";
      default:
        return "border-[#2F5F7A] bg-[#163A52]/50 text-[#C7D2DA]";
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0B1E2D] border-l border-[#2F5F7A]">
      <div className="px-4 py-3 border-b border-[#2F5F7A]">
        <h3 className="text-[#F1F5F9] flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#2E86AB]" />
          Execution Trace
        </h3>
        <p className="text-xs text-[#8FA7B5] mt-1">Live agent processing</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {steps.map((step, index) => {
          const statusColor = getStatusColor(step.status);
          const isActive = step.status === "active";

          return (
            <div
              key={index}
              className={`relative border rounded-lg p-3 ${statusColor} ${
                isActive ? "" : ""
              }`}
            >
              {isActive && (
                <div className="absolute -top-1 -right-1">
                  <span className="flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2E86AB] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#2E86AB]"></span>
                  </span>
                </div>
              )}

              <div className="flex items-start gap-2 mb-2">
                {getIcon(step.type)}
                <div className="flex-1">
                  <div className="text-sm">{step.title}</div>
                  <div className="text-xs opacity-75 mt-0.5">
                    {step.timestamp}
                  </div>
                </div>
              </div>

              <p className="text-xs opacity-90 ml-6">{step.details}</p>
            </div>
          );
        })}
      </div>

      {confidence !== undefined && (
        <div className="px-4 py-3 border-t border-[#2F5F7A]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#C7D2DA]">Confidence Score</span>
            <span className="text-[#59C3C3]">{confidence}%</span>
          </div>
          <div className="w-full bg-[#2F5F7A] rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#2E86AB] to-[#59C3C3] h-full rounded-full transition-all duration-500"
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
