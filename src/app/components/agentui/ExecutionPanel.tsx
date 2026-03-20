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
        return "border-orange-400 bg-orange-500/10 text-orange-600";
      case "complete":
        return "border-orange-400 bg-orange-400/10 text-orange-500";
      case "pending":
        return "border-gray-200 bg-gray-100/50 text-gray-500";
      default:
        return "border-gray-200 bg-gray-100/50 text-gray-600";
    }
  };

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-gray-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-orange-600" />
          Execution Trace
        </h3>
        <p className="text-xs text-gray-500 mt-1">Live agent processing</p>
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
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
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
        <div className="px-4 py-3 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Confidence Score</span>
            <span className="text-orange-500">{confidence}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-orange-500 to-orange-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
