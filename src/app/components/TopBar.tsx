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
    <div className="h-14 border-b border-border bg-white flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {/* Tenant Selector */}
        <div className="relative">
          {tenants.length === 0 ? (
            <button
              disabled
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground opacity-50 cursor-not-allowed"
            >
              No tenants
            </button>
          ) : (
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent transition-colors"
            >
              {isAllTenants && <List className="w-4 h-4 text-muted-foreground" />}
              <span className="text-sm">{displayName}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {isOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsOpen(false)}
              />
              <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-border rounded-lg shadow-lg z-20 py-1">
                {/* All Tenants option */}
                <button
                  onClick={() => handleTenantSelect(ALL_TENANTS)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center justify-between border-b border-border"
                >
                  <span className="flex items-center gap-2">
                    <List className="w-3.5 h-3.5 text-muted-foreground" />
                    All Tenants
                  </span>
                  {isAllTenants && (
                    <span className="text-xs text-muted-foreground">✓</span>
                  )}
                </button>
                {tenants.map((tenant) => (
                  <button
                    key={tenant.id}
                    onClick={() => handleTenantSelect(tenant.id)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center justify-between"
                  >
                    <span>{tenant.name}</span>
                    {currentTenantId === tenant.id && (
                      <span className="text-xs text-muted-foreground">✓</span>
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
          <div className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
            Global View
          </div>
        )}
      </div>
    </div>
  );
}
