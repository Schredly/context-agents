import { Clock, ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

type Status = "completed" | "running" | "pending" | "failed";

interface RunCardProps {
  runId: string;
  useCase: string;
  status: Status;
  duration: string;
  timestamp: string;
  onClick?: () => void;
}

export function RunCard({
  runId,
  useCase,
  status,
  duration,
  timestamp,
  onClick,
}: RunCardProps) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-gray-600">{runId}</code>
          <StatusBadge status={status} showIcon={false} size="sm" />
        </div>
        <p className="text-sm text-gray-900 truncate mb-1">{useCase}</p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {duration}
          </span>
          <span>{timestamp}</span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </div>
  );
}
