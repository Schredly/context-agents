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
    if (status === "running") return <Loader2 className={`${iconClass} animate-spin`} />;
    if (status === "failed") return <XCircle className={iconClass} />;
    switch (iconType) {
      case "search": return <Search className={iconClass} />;
      case "book": return <BookOpen className={iconClass} />;
      case "file": return <FileText className={iconClass} />;
      case "check": return <CheckCircle2 className={iconClass} />;
      default: return <CheckCircle2 className={iconClass} />;
    }
  };

  const getStatusStyles = (status: SkillStatus) => {
    switch (status) {
      case "completed":
        return {
          border: "border-[#2F5F7A]",
          bg: "",
          text: "text-[#59C3C3]",
          iconBg: "bg-[#59C3C3]/10",
          dot: "bg-[#59C3C3]",
        };
      case "running":
        return {
          border: "border-[#2F5F7A]",
          bg: "bg-[#102A43]",
          text: "text-[#2E86AB]",
          iconBg: "bg-[#2E86AB]/10",
          dot: "bg-[#2E86AB]",
        };
      case "failed":
        return {
          border: "border-[#2F5F7A]",
          bg: "",
          text: "text-red-400",
          iconBg: "bg-red-500/10",
          dot: "bg-red-500",
        };
    }
  };

  const getStatusLabel = (status: SkillStatus) => {
    switch (status) {
      case "completed": return "Completed";
      case "running": return "Running";
      case "failed": return "Failed";
    }
  };

  const totalDuration = skills
    .filter((s) => s.status === "completed" && s.duration)
    .reduce((acc, skill) => {
      const match = skill.duration?.match(/(\d+\.?\d*)/);
      return acc + (match ? parseFloat(match[1]) : 0);
    }, 0);

  return (
    <div className="bg-[#0B1E2D] border border-[#2F5F7A] rounded-[10px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2F5F7A]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[#F1F5F9] text-sm font-medium flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#2E86AB]" />
              {title}
            </h3>
            <p className="text-xs text-[#8FA7B5] mt-0.5">
              {skills.filter((s) => s.status === "completed").length} of {skills.length} skills executed
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#2F5F7A]">
            <Clock className="w-3 h-3 text-[#8FA7B5]" />
            <span className="text-xs text-[#8FA7B5]">{totalDuration.toFixed(2)}s total</span>
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
                {!isLast && (
                  <div className="absolute left-[13px] top-[50px] w-px h-[calc(100%+4px)] bg-[#2F5F7A]" />
                )}

                <div
                  className={`relative border ${styles.border} ${styles.bg} rounded-lg p-3 mb-1 transition-colors`}
                >
                  {isRunning && (
                    <div className="absolute -top-1 -right-1">
                      <span className="flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2E86AB] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#2E86AB]"></span>
                      </span>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <div className={`w-[7px] h-[7px] rounded-full ${styles.dot}`} />
                    </div>

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
                            <div className="text-xs text-[#8FA7B5] mt-0.5">
                              {skill.description}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full border border-[#2F5F7A] ${styles.text}`}
                          >
                            {getStatusLabel(skill.status)}
                          </span>
                          {skill.duration && (
                            <span className="text-xs text-[#8FA7B5]">
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

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-[#2F5F7A]">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#59C3C3]" />
            <span className="text-[#8FA7B5]">
              {skills.filter((s) => s.status === "completed").length} Completed
            </span>
          </div>
          {skills.some((s) => s.status === "running") && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#2E86AB]" />
              <span className="text-[#8FA7B5]">
                {skills.filter((s) => s.status === "running").length} Running
              </span>
            </div>
          )}
          {skills.some((s) => s.status === "failed") && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-[#8FA7B5]">
                {skills.filter((s) => s.status === "failed").length} Failed
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
