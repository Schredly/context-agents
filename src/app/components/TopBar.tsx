import { useState } from 'react';
import { ChevronDown, List } from 'lucide-react';
import { useTenants, ALL_TENANTS } from '../context/TenantContext';

export function TopBar() {
  const [isOpen, setIsOpen] = useState(false);
  const { tenants, currentTenant, currentTenantId, setCurrentTenantId, isAllTenants } = useTenants();

  const handleTenantSelect = (tenantId: string) => {
    setCurrentTenantId(tenantId);
    setIsOpen(false);
  };

  const displayStatus = (status: string) =>
    status.charAt(0).toUpperCase() + status.slice(1);

  const displayName = isAllTenants ? 'All Tenants' : (currentTenant?.name || 'Select Tenant');

  return (
    <div className="h-12 border-b border-gray-200 bg-white flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {/* Tenant Selector */}
        <div className="relative">
          {tenants.length === 0 ? (
            <button
              disabled
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-gray-400 opacity-50 cursor-not-allowed"
            >
              No tenants
            </button>
          ) : (
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              {isAllTenants && <List className="w-4 h-4 text-gray-400" />}
              <span className="text-sm font-medium text-gray-700">{displayName}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
          )}

          {isOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsOpen(false)}
              />
              <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                {/* All Tenants option */}
                <button
                  onClick={() => handleTenantSelect(ALL_TENANTS)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between border-b border-gray-100"
                >
                  <span className="flex items-center gap-2">
                    <List className="w-3.5 h-3.5 text-gray-400" />
                    All Tenants
                  </span>
                  {isAllTenants && (
                    <span className="text-xs text-orange-500 font-medium">&#10003;</span>
                  )}
                </button>
                {tenants.map((tenant) => (
                  <button
                    key={tenant.id}
                    onClick={() => handleTenantSelect(tenant.id)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between"
                  >
                    <span>{tenant.name}</span>
                    {currentTenantId === tenant.id && (
                      <span className="text-xs text-orange-500 font-medium">&#10003;</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Status Badge */}
        {currentTenant && (
          <div
            className={`
              px-2 py-0.5 rounded text-xs
              ${
                currentTenant.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600'
              }
            `}
          >
            {displayStatus(currentTenant.status)}
          </div>
        )}
        {isAllTenants && (
          <div className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
            Global View
          </div>
        )}
      </div>
    </div>
  );
}
