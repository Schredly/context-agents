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
    if (score >= 90) return "text-green-400";
    if (score >= 75) return "text-blue-400";
    if (score >= 60) return "text-yellow-400";
    return "text-orange-400";
  };

  const getConfidenceGlow = (score: number) => {
    if (score >= 90) return "shadow-green-500/20";
    if (score >= 75) return "shadow-blue-500/20";
    if (score >= 60) return "shadow-yellow-500/20";
    return "shadow-orange-500/20";
  };

  const getGlowBorder = (score: number) => {
    if (score >= 90) return "border-green-500/40";
    if (score >= 75) return "border-blue-500/40";
    if (score >= 60) return "border-yellow-500/40";
    return "border-orange-500/40";
  };

  const confidenceColor = getConfidenceColor(confidence);
  const confidenceGlow = getConfidenceGlow(confidence);
  const glowBorder = getGlowBorder(confidence);

  return (
    <div
      className={`relative bg-gradient-to-br from-gray-900 to-gray-950 border-2 ${glowBorder} rounded-lg overflow-hidden shadow-2xl ${confidenceGlow}`}
    >
      {/* Subtle animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-indigo-500/5 animate-pulse" />

      {/* Header */}
      <div className="relative px-4 py-3 border-b border-gray-800 bg-gray-950/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <Target className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm text-gray-400">Selected Use Case</h3>
              {category && (
                <span className="text-xs text-gray-600">
                  Category: {category}
                </span>
              )}
            </div>
          </div>

          {/* Confidence Badge */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900/80 border border-gray-700 ${confidenceColor}`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-sm">{confidence}%</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative px-4 py-4">
        <h2 className="text-white mb-2 flex items-center gap-2">
          {name}
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        </h2>
        <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
      </div>

      {/* Footer with confidence bar */}
      <div className="relative px-4 py-3 border-t border-gray-800 bg-gray-950/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">Match Confidence</span>
          <span className={`text-xs ${confidenceColor}`}>
            {confidence >= 90 && "Excellent"}
            {confidence >= 75 && confidence < 90 && "High"}
            {confidence >= 60 && confidence < 75 && "Good"}
            {confidence < 60 && "Moderate"}
          </span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              confidence >= 90
                ? "bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg shadow-green-500/50"
                : confidence >= 75
                ? "bg-gradient-to-r from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/50"
                : confidence >= 60
                ? "bg-gradient-to-r from-yellow-500 to-amber-500 shadow-lg shadow-yellow-500/50"
                : "bg-gradient-to-r from-orange-500 to-red-500 shadow-lg shadow-orange-500/50"
            }`}
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      {/* Corner accent */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full" />
    </div>
  );
}
