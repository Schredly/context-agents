import { Lightbulb, TrendingUp, ArrowRight, Copy, CheckCircle2, Sparkles } from "lucide-react";
import { useState } from "react";

export interface SuggestedAction {
  id: string;
  action: string;
  priority?: "high" | "medium" | "low";
}

interface AIRecommendationProps {
  resolution: string;
  confidence: number;
  suggestedActions: SuggestedAction[];
  additionalContext?: string;
}

export function AIRecommendation({
  resolution,
  confidence,
  suggestedActions,
  additionalContext,
}: AIRecommendationProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = `${resolution}\n\nRecommended Actions:\n${suggestedActions
      .map((a, i) => `${i + 1}. ${a.action}`)
      .join("\n")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getConfidenceLevel = (score: number) => {
    if (score >= 90) return { label: "Very High", color: "text-green-400" };
    if (score >= 75) return { label: "High", color: "text-blue-400" };
    if (score >= 60) return { label: "Medium", color: "text-yellow-400" };
    return { label: "Low", color: "text-orange-400" };
  };

  const getPriorityStyles = (priority?: string) => {
    switch (priority) {
      case "high":
        return "bg-red-500/10 text-red-400 border-red-500/30";
      case "medium":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
      case "low":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      default:
        return "bg-gray-500/10 text-gray-400 border-gray-500/30";
    }
  };

  const confidenceLevel = getConfidenceLevel(confidence);

  return (
    <div className="relative">
      {/* Glow effect background */}
      <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-lg blur-lg opacity-30 animate-pulse" />

      <div className="relative bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 border-2 border-blue-500/40 rounded-lg overflow-hidden shadow-2xl">
        {/* Animated gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-purple-500/10" />
        
        {/* Sparkle accent */}
        <div className="absolute top-4 right-4">
          <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" />
        </div>

        {/* Header */}
        <div className="relative px-5 py-4 border-b border-gray-800 bg-gradient-to-r from-blue-950/30 to-indigo-950/30 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
                <Lightbulb className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-white flex items-center gap-2">
                  AI Recommendation
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Synthesized resolution based on analysis
                </p>
              </div>
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 text-gray-300 hover:text-white transition-all text-sm"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Resolution Content */}
        <div className="relative px-5 py-5">
          <div className="mb-5">
            <div className="prose prose-invert max-w-none">
              <div className="text-gray-100 leading-relaxed whitespace-pre-line">
                {resolution}
              </div>
            </div>
            {additionalContext && (
              <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <p className="text-sm text-blue-300">{additionalContext}</p>
              </div>
            )}
          </div>

          {/* Confidence Score */}
          <div className="mb-5 p-4 bg-gray-950/50 border border-gray-800 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-gray-300">Confidence Score</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm ${confidenceLevel.color}`}>
                  {confidenceLevel.label}
                </span>
                <span className="text-white">{confidence}%</span>
              </div>
            </div>
            <div className="relative w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-full transition-all duration-1000 shadow-lg"
                style={{ width: `${confidence}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20" />
              </div>
              {/* Animated shimmer effect */}
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
                style={{
                  width: `${confidence}%`,
                  animation: "shimmer 2s infinite",
                }}
              />
            </div>
          </div>

          {/* Suggested Actions */}
          <div>
            <h4 className="text-white mb-3 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-indigo-400" />
              Recommended Actions
            </h4>
            <div className="space-y-2">
              {suggestedActions.map((action, index) => (
                <div
                  key={action.id}
                  className="flex items-start gap-3 p-3 bg-gray-800/30 hover:bg-gray-800/50 border border-gray-700/50 hover:border-gray-600 rounded-lg transition-all group"
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs flex-shrink-0 mt-0.5 shadow-lg shadow-blue-500/20">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 group-hover:text-white transition-colors">
                      {action.action}
                    </p>
                  </div>
                  {action.priority && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${getPriorityStyles(
                        action.priority
                      )}`}
                    >
                      {action.priority}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative px-5 py-3 border-t border-gray-800 bg-gray-950/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              Generated from {suggestedActions.length} recommended action
              {suggestedActions.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-gray-500">Resolution complete</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
