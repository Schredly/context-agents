import { Target, TrendingUp } from "lucide-react";

interface SelectedUseCaseProps {
  name: string;
  description: string;
  confidence: number;
  category?: string;
}

export function SelectedUseCase({
  name,
  description,
  confidence,
  category,
}: SelectedUseCaseProps) {
  const getConfidenceColor = (score: number) => {
    if (score >= 90) return "text-orange-500";
    if (score >= 75) return "text-orange-600";
    if (score >= 60) return "text-orange-400";
    return "text-orange-400";
  };

  const confidenceColor = getConfidenceColor(confidence);

  return (
    <div className="bg-white border border-gray-200 rounded-[10px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
              <Target className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.08em]">
                Selected Use Case
              </span>
              {category && (
                <span className="text-xs text-gray-500 block">
                  {category}
                </span>
              )}
            </div>
          </div>

          {/* Confidence Badge */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 ${confidenceColor}`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-sm">{confidence}%</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4">
        <h2 className="text-gray-900 text-sm font-medium mb-2">
          {name}
        </h2>
        <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
      </div>

      {/* Footer with confidence bar */}
      <div className="px-4 py-3 border-t border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.08em]">Match Confidence</span>
          <span className={`text-xs ${confidenceColor}`}>
            {confidence >= 90 && "Excellent"}
            {confidence >= 75 && confidence < 90 && "High"}
            {confidence >= 60 && confidence < 75 && "Good"}
            {confidence < 60 && "Moderate"}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${confidence}%`, background: 'linear-gradient(90deg, #f97316, #fb923c)' }}
          />
        </div>
      </div>
    </div>
  );
}
