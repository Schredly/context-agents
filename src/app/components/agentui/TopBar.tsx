import { Activity, Settings, HelpCircle, Maximize2 } from "lucide-react";

interface TopBarProps {
  agentName: string;
  tenant: string;
  status: "connected" | "disconnected" | "processing";
}

export function TopBar({ agentName, tenant, status }: TopBarProps) {
  const statusColors = {
    connected: "bg-green-500",
    disconnected: "bg-red-500",
    processing: "bg-blue-500",
  };

  const statusLabels = {
    connected: "Connected",
    disconnected: "Disconnected",
    processing: "Processing",
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white">{agentName}</h1>
            <p className="text-xs text-gray-400">{tenant}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800">
          <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
          <span className="text-xs text-gray-300">{statusLabels[status]}</span>
        </div>

        <button className="p-2 rounded-lg hover:bg-gray-900 text-gray-400 hover:text-white transition-colors">
          <HelpCircle className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-lg hover:bg-gray-900 text-gray-400 hover:text-white transition-colors">
          <Settings className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-lg hover:bg-gray-900 text-gray-400 hover:text-white transition-colors">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
