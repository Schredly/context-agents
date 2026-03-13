import { useState } from "react";
import { ChevronDown, Globe, Building2, List } from "lucide-react";
import { useTenants } from "../context/TenantContext";

export type TenantFilterValue = "all" | "GLOBAL" | string;

interface TenantFilterProps {
  value: TenantFilterValue;
  onChange: (value: TenantFilterValue) => void;
}

export function TenantFilter({ value, onChange }: TenantFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { tenants } = useTenants();

  const getLabel = () => {
    if (value === "all") return "All Tenants";
    if (value === "GLOBAL") return "Global";
    const tenant = tenants.find((t) => t.id === value);
    return tenant?.name || value;
  };

  const handleSelect = (v: TenantFilterValue) => {
    onChange(v);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors min-w-[160px]"
      >
        {value === "all" ? (
          <List className="w-3.5 h-3.5 text-gray-400" />
        ) : value === "GLOBAL" ? (
          <Globe className="w-3.5 h-3.5 text-blue-500" />
        ) : (
          <Building2 className="w-3.5 h-3.5 text-gray-400" />
        )}
        <span className="flex-1 text-left">{getLabel()}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
            <button
              onClick={() => handleSelect("all")}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <List className="w-3.5 h-3.5 text-gray-400" />
              <span>All Tenants</span>
              {value === "all" && (
                <span className="ml-auto text-xs text-gray-400">&#10003;</span>
              )}
            </button>
            <button
              onClick={() => handleSelect("GLOBAL")}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Globe className="w-3.5 h-3.5 text-blue-500" />
              <span>Global</span>
              {value === "GLOBAL" && (
                <span className="ml-auto text-xs text-gray-400">&#10003;</span>
              )}
            </button>
            {tenants.length > 0 && (
              <div className="border-t border-gray-100 my-1" />
            )}
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                onClick={() => handleSelect(tenant.id)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                <span>{tenant.name}</span>
                {value === tenant.id && (
                  <span className="ml-auto text-xs text-gray-400">&#10003;</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
