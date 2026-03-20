import { Settings, HelpCircle, Maximize2 } from "lucide-react";

interface TopBarProps {
  agentName: string;
  tenant: string;
  status: "connected" | "disconnected" | "processing";
}

export function TopBar({ agentName, tenant, status }: TopBarProps) {
  const statusColors = {
    connected: "bg-orange-400",
    disconnected: "bg-red-500",
    processing: "bg-orange-500",
  };

  const statusLabels = {
    connected: "Connected",
    disconnected: "Disconnected",
    processing: "Processing",
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <img src="/overyonder-logo.png" alt="OverYonder.ai" className="w-8 h-8 rounded-lg object-contain" />
          <div>
            <h1 className="text-gray-900 text-sm font-medium">{agentName}</h1>
            <p className="text-xs text-gray-500">{tenant}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200">
          <div className={`w-1.5 h-1.5 rounded-full ${statusColors[status]}`} />
          <span className="text-xs text-gray-600">{statusLabels[status]}</span>
        </div>

        <button className="p-2 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition-colors">
          <HelpCircle className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition-colors">
          <Settings className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition-colors">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
