import { Settings, HelpCircle, Maximize2 } from "lucide-react";

interface TopBarProps {
  agentName: string;
  tenant: string;
  status: "connected" | "disconnected" | "processing";
}

export function TopBar({ agentName, tenant, status }: TopBarProps) {
  const statusColors = {
    connected: "bg-[#59C3C3]",
    disconnected: "bg-red-500",
    processing: "bg-[#2E86AB]",
  };

  const statusLabels = {
    connected: "Connected",
    disconnected: "Disconnected",
    processing: "Processing",
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[#2F5F7A] bg-[#0B1E2D]">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <img src="/lb.png" alt="Love-Boat.AI" className="w-8 h-8 rounded-lg object-contain bg-[#0B1E2D]" style={{ mixBlendMode: 'screen' }} />
          <div>
            <h1 className="text-[#F1F5F9] text-sm font-medium">{agentName}</h1>
            <p className="text-xs text-[#8FA7B5]">{tenant}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#2F5F7A]">
          <div className={`w-1.5 h-1.5 rounded-full ${statusColors[status]}`} />
          <span className="text-xs text-[#C7D2DA]">{statusLabels[status]}</span>
        </div>

        <button className="p-2 rounded-lg hover:bg-[#102A43] text-[#8FA7B5] hover:text-[#F1F5F9] transition-colors">
          <HelpCircle className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-lg hover:bg-[#102A43] text-[#8FA7B5] hover:text-[#F1F5F9] transition-colors">
          <Settings className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-lg hover:bg-[#102A43] text-[#8FA7B5] hover:text-[#F1F5F9] transition-colors">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
