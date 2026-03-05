import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";

type Status = "completed" | "running" | "pending" | "failed" | "cancelled";

interface StatusBadgeProps {
  status: Status;
  showIcon?: boolean;
  size?: "sm" | "md";
}

export function StatusBadge({
  status,
  showIcon = true,
  size = "md",
}: StatusBadgeProps) {
  const getStatusConfig = (status: Status) => {
    switch (status) {
      case "completed":
        return {
          icon: <CheckCircle2 className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />,
          className: "bg-green-50 text-green-700 border-green-200",
          label: "Completed",
        };
      case "running":
        return {
          icon: (
            <Loader2
              className={`${size === "sm" ? "w-3 h-3" : "w-4 h-4"} animate-spin`}
            />
          ),
          className: "bg-blue-50 text-blue-700 border-blue-200",
          label: "Running",
        };
      case "pending":
        return {
          icon: <Clock className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />,
          className: "bg-gray-50 text-gray-600 border-gray-200",
          label: "Pending",
        };
      case "failed":
        return {
          icon: <XCircle className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />,
          className: "bg-red-50 text-red-700 border-red-200",
          label: "Failed",
        };
      case "cancelled":
        return {
          icon: <XCircle className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />,
          className: "bg-orange-50 text-orange-700 border-orange-200",
          label: "Cancelled",
        };
    }
  };

  const config = getStatusConfig(status);
  const textSize = size === "sm" ? "text-xs" : "text-xs";
  const padding = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${padding} rounded-full ${textSize} font-medium border ${config.className}`}
    >
      {showIcon && config.icon}
      {config.label}
    </span>
  );
}
