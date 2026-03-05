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
        return "border-blue-500 bg-blue-500/10 text-blue-400";
      case "complete":
        return "border-green-500 bg-green-500/10 text-green-400";
      case "pending":
        return "border-gray-700 bg-gray-800/50 text-gray-500";
      default:
        return "border-gray-700 bg-gray-800/50 text-gray-400";
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-950 border-l border-gray-800">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
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
                isActive ? "shadow-lg shadow-blue-500/20" : ""
              }`}
            >
              {isActive && (
                <div className="absolute -top-1 -right-1">
                  <span className="flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
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
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Confidence Score</span>
            <span className="text-green-400">{confidence}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-green-500 h-full rounded-full transition-all duration-500 shadow-lg shadow-green-500/20"
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
