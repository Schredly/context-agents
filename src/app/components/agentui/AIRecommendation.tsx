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
    if (score >= 90) return { label: "Very High", color: "text-[#59C3C3]" };
    if (score >= 75) return { label: "High", color: "text-[#2E86AB]" };
    if (score >= 60) return { label: "Medium", color: "text-[#F6C667]" };
    return { label: "Low", color: "text-orange-400" };
  };

  const getPriorityStyles = (priority?: string) => {
    switch (priority) {
      case "high":
        return "text-red-400 border-[#2F5F7A]";
      case "medium":
        return "text-[#F6C667] border-[#2F5F7A]";
      case "low":
        return "text-[#2E86AB] border-[#2F5F7A]";
      default:
        return "text-[#C7D2DA] border-[#2F5F7A]";
    }
  };

  const confidenceLevel = getConfidenceLevel(confidence);

  return (
    <div className="bg-[#0B1E2D] border border-[#2F5F7A] rounded-[10px] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#2F5F7A]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#102A43] border border-[#2F5F7A]">
              <Lightbulb className="w-5 h-5 text-[#C7D2DA]" />
            </div>
            <div>
              <h3 className="text-[#F1F5F9] text-sm font-medium flex items-center gap-2">
                AI Recommendation
                <CheckCircle2 className="w-3.5 h-3.5 text-[#59C3C3]" />
              </h3>
              <p className="text-xs text-[#8FA7B5] mt-0.5">
                Synthesized resolution based on analysis
              </p>
            </div>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#102A43] hover:bg-[#1E4A66] border border-[#2F5F7A] hover:border-[#2F5F7A] text-[#C7D2DA] hover:text-[#F1F5F9] transition-colors text-sm"
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#59C3C3]" />
                <span className="text-[#59C3C3]">Copied</span>
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
          <div className="text-[#F1F5F9] text-sm leading-relaxed whitespace-pre-line">
            {resolution}
          </div>
          {additionalContext && (
            <div className="mt-3 p-3 bg-[#102A43] border border-[#2F5F7A] rounded-lg">
              <p className="text-sm text-[#C7D2DA]">{additionalContext}</p>
            </div>
          )}
        </div>

        {/* Suggested Actions */}
        {suggestedActions.length > 0 && (
          <div>
            <h4 className="text-[11px] font-medium text-[#8FA7B5] uppercase tracking-[0.08em] mb-3 flex items-center gap-2">
              <ArrowRight className="w-3.5 h-3.5" />
              Recommended Actions
            </h4>
            <div className="space-y-2">
              {suggestedActions.map((action, index) => (
                <div
                  key={action.id}
                  className="flex items-start gap-3 p-3 bg-[#102A43] hover:bg-[#1E4A66] border border-[#2F5F7A] hover:border-[#2F5F7A] rounded-lg transition-colors"
                >
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#2F5F7A] text-[#C7D2DA] text-xs flex-shrink-0 mt-0.5">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#F1F5F9]">
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
      <div className="px-5 py-3 border-t border-[#2F5F7A]">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#8FA7B5]">
            Generated from {suggestedActions.length} recommended action
            {suggestedActions.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#59C3C3]" />
            <span className="text-[#8FA7B5]">Resolution complete</span>
          </div>
        </div>
      </div>
    </div>
  );
}
