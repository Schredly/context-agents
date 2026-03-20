import { Brain, Target, Wrench, Zap, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface CardSection {
  type: "reasoning" | "usecase" | "skills" | "tools" | "answer";
  title: string;
  content: string | string[];
  status?: "success" | "processing" | "pending";
}

interface AgentResponseCardProps {
  sections: CardSection[];
  timestamp?: string;
}

export function AgentResponseCard({ sections, timestamp }: AgentResponseCardProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(sections.map((_, i) => i))
  );

  const toggleSection = (index: number) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSections(newExpanded);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "reasoning":
        return <Brain className="w-4 h-4" />;
      case "usecase":
        return <Target className="w-4 h-4" />;
      case "skills":
        return <Wrench className="w-4 h-4" />;
      case "tools":
        return <Zap className="w-4 h-4" />;
      case "answer":
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case "reasoning":
        return "text-orange-600 border-orange-400/30 bg-orange-500/10";
      case "usecase":
        return "text-orange-600 border-orange-400/30 bg-orange-500/10";
      case "skills":
        return "text-orange-500 border-orange-400/30 bg-orange-400/10";
      case "tools":
        return "text-orange-600 border-orange-400/30 bg-orange-500/10";
      case "answer":
        return "text-orange-500 border-orange-400/30 bg-orange-400/10";
      default:
        return "text-gray-600 border-gray-400/30 bg-gray-400/10";
    }
  };

  return (
    <div className="mb-4">
      {timestamp && (
        <div className="text-xs text-gray-500 mb-2 ml-11">{timestamp}</div>
      )}
      <div className="ml-11 space-y-2">
        {sections.map((section, index) => {
          const isExpanded = expandedSections.has(index);
          const colorClass = getColor(section.type);

          return (
            <div
              key={index}
              className={`rounded-lg border ${colorClass} overflow-hidden backdrop-blur-sm`}
            >
              <button
                onClick={() => toggleSection(index)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {getIcon(section.type)}
                  <span className="text-sm">{section.title}</span>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 pt-1">
                  {Array.isArray(section.content) ? (
                    <ul className="space-y-1">
                      {section.content.map((item, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                          <span className="text-gray-500 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-600">{section.content}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
