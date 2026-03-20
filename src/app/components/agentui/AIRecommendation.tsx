import { Lightbulb, TrendingUp, ArrowRight, Copy, CheckCircle2 } from "lucide-react";
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
    if (score >= 90) return { label: "Very High", color: "text-orange-500" };
    if (score >= 75) return { label: "High", color: "text-orange-600" };
    if (score >= 60) return { label: "Medium", color: "text-orange-400" };
    return { label: "Low", color: "text-orange-400" };
  };

  const getPriorityStyles = (priority?: string) => {
    switch (priority) {
      case "high":
        return "text-red-400 border-gray-200";
      case "medium":
        return "text-orange-400 border-gray-200";
      case "low":
        return "text-orange-600 border-gray-200";
      default:
        return "text-gray-600 border-gray-200";
    }
  };

  const confidenceLevel = getConfidenceLevel(confidence);

  return (
    <div className="bg-white border border-gray-200 rounded-[10px] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
              <Lightbulb className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h3 className="text-gray-900 text-sm font-medium flex items-center gap-2">
                AI Recommendation
                <CheckCircle2 className="w-3.5 h-3.5 text-orange-500" />
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Synthesized resolution based on analysis
              </p>
            </div>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-gray-200 text-gray-600 hover:text-gray-900 transition-colors text-sm"
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-orange-500">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Resolution Content */}
      <div className="px-5 py-5">
        <div className="mb-5">
          <div className="text-gray-900 text-sm leading-relaxed whitespace-pre-line">
            {resolution}
          </div>
          {additionalContext && (
            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-600">{additionalContext}</p>
            </div>
          )}
        </div>

        {/* Suggested Actions */}
        {suggestedActions.length > 0 && (
          <div>
            <h4 className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.08em] mb-3 flex items-center gap-2">
              <ArrowRight className="w-3.5 h-3.5" />
              Recommended Actions
            </h4>
            <div className="space-y-2">
              {suggestedActions.map((action, index) => (
                <div
                  key={action.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-gray-200 rounded-lg transition-colors"
                >
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs flex-shrink-0 mt-0.5">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
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
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            Generated from {suggestedActions.length} recommended action
            {suggestedActions.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span className="text-gray-500">Resolution complete</span>
          </div>
        </div>
      </div>
    </div>
  );
}
