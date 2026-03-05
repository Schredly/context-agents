import { Search, BookOpen, FileText, CheckCircle2, Loader2, XCircle, Clock } from "lucide-react";

export type SkillStatus = "completed" | "running" | "failed";

export interface SkillExecution {
  id: string;
  name: string;
  description: string;
  status: SkillStatus;
  duration?: string;
  icon?: "search" | "book" | "file" | "check";
}

interface SkillExecutionTimelineProps {
  skills: SkillExecution[];
  title?: string;
}

export function SkillExecutionTimeline({
  skills,
  title = "Skill Execution Timeline",
}: SkillExecutionTimelineProps) {
  const getSkillIcon = (iconType?: string, status?: SkillStatus) => {
    const iconClass = "w-4 h-4";
    
    if (status === "running") {
      return <Loader2 className={`${iconClass} animate-spin`} />;
    }
    
    if (status === "failed") {
      return <XCircle className={iconClass} />;
    }
    
    if (status === "completed") {
      switch (iconType) {
        case "search":
          return <Search className={iconClass} />;
        case "book":
          return <BookOpen className={iconClass} />;
        case "file":
          return <FileText className={iconClass} />;
        case "check":
          return <CheckCircle2 className={iconClass} />;
        default:
          return <CheckCircle2 className={iconClass} />;
      }
    }
    
    return <Search className={iconClass} />;
  };

  const getStatusStyles = (status: SkillStatus) => {
    switch (status) {
      case "completed":
        return {
          border: "border-green-500/30",
          bg: "bg-green-500/5",
          text: "text-green-400",
          iconBg: "bg-green-500/10",
          dot: "bg-green-500 shadow-lg shadow-green-500/50",
        };
      case "running":
        return {
          border: "border-blue-500/50",
          bg: "bg-blue-500/10",
          text: "text-blue-400",
          iconBg: "bg-blue-500/10",
          dot: "bg-blue-500",
        };
      case "failed":
        return {
          border: "border-red-500/30",
          bg: "bg-red-500/5",
          text: "text-red-400",
          iconBg: "bg-red-500/10",
          dot: "bg-red-500 shadow-lg shadow-red-500/50",
        };
    }
  };

  const getStatusLabel = (status: SkillStatus) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "running":
        return "Running";
      case "failed":
        return "Failed";
    }
  };

  const totalDuration = skills
    .filter((s) => s.status === "completed" && s.duration)
    .reduce((acc, skill) => {
      const match = skill.duration?.match(/(\d+\.?\d*)/);
      return acc + (match ? parseFloat(match[1]) : 0);
    }, 0);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              {title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {skills.filter((s) => s.status === "completed").length} of {skills.length} skills executed
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-400">{totalDuration.toFixed(2)}s total</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="p-4">
        <div className="space-y-0">
          {skills.map((skill, index) => {
            const isLast = index === skills.length - 1;
            const styles = getStatusStyles(skill.status);
            const isRunning = skill.status === "running";

            return (
              <div key={skill.id} className="relative">
                {/* Timeline connector line */}
                {!isLast && (
                  <div
                    className={`absolute left-[13px] top-[50px] w-0.5 h-[calc(100%+4px)] ${
                      skill.status === "completed" ? "bg-green-500/20" : "bg-gray-800"
                    }`}
                  />
                )}

                {/* Skill card */}
                <div
                  className={`relative border ${styles.border} ${styles.bg} rounded-lg p-3 mb-1 transition-all ${
                    isRunning ? "shadow-lg shadow-blue-500/20" : ""
                  }`}
                >
                  {/* Running indicator pulse */}
                  {isRunning && (
                    <div className="absolute -top-1 -right-1">
                      <span className="flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                      </span>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    {/* Status dot */}
                    <div className="flex flex-col items-center pt-1">
                      <div className={`w-[7px] h-[7px] rounded-full ${styles.dot}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <div className={`p-1.5 rounded ${styles.iconBg} ${styles.text} flex-shrink-0`}>
                            {getSkillIcon(skill.icon, skill.status)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm ${styles.text}`}>
                              {skill.name}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {skill.description}
                            </div>
                          </div>
                        </div>

                        {/* Status and duration */}
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${styles.bg} ${styles.text} border ${styles.border}`}
                          >
                            {getStatusLabel(skill.status)}
                          </span>
                          {skill.duration && (
                            <span className="text-xs text-gray-500">
                              {skill.duration}
                            </span>
                          )}
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

      {/* Footer with summary */}
      <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-950/50">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-500">
                {skills.filter((s) => s.status === "completed").length} Completed
              </span>
            </div>
            {skills.some((s) => s.status === "running") && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-gray-500">
                  {skills.filter((s) => s.status === "running").length} Running
                </span>
              </div>
            )}
            {skills.some((s) => s.status === "failed") && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-gray-500">
                  {skills.filter((s) => s.status === "failed").length} Failed
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
