import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getTenants, type TenantResponse } from '../services/api';

export const ALL_TENANTS = '__all__';

interface TenantContextValue {
  tenants: TenantResponse[];
  loading: boolean;
  error: string | null;
  refreshTenants: () => Promise<void>;
  currentTenantId: string | null;
  setCurrentTenantId: (id: string | null) => void;
  currentTenant: TenantResponse | null;
  /** True when "All Tenants" is selected */
  isAllTenants: boolean;
  /** A real tenant ID for API URL paths — first tenant when "All" is selected */
  apiTenantId: string | null;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);

  const isAllTenants = currentTenantId === ALL_TENANTS;
  const currentTenant = isAllTenants ? null : (tenants.find((t) => t.id === currentTenantId) ?? null);
  const apiTenantId = isAllTenants ? (tenants[0]?.id ?? null) : currentTenantId;

  const refreshTenants = useCallback(async () => {
    setError(null);
    try {
      const data = await getTenants();
      setTenants(data);
      // If current selection is no longer valid, reset to first tenant
      setCurrentTenantId((prev) => {
        if (prev === ALL_TENANTS) return prev;
        if (prev && data.some((t) => t.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    refreshTenants();
  }, [refreshTenants]);

  // Auto-select first tenant when tenants load and nothing is selected
  useEffect(() => {
    if (currentTenantId === null && tenants.length > 0) {
      setCurrentTenantId(tenants[0].id);
    }
  }, [currentTenantId, tenants]);

  return (
    <TenantContext.Provider
      value={{
        tenants,
        loading,
        error,
        refreshTenants,
        currentTenantId,
        setCurrentTenantId,
        currentTenant,
        isAllTenants,
        apiTenantId,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

const FALLBACK: TenantContextValue = {
  tenants: [],
  loading: false,
  error: 'TenantProvider not found',
  refreshTenants: async () => {},
  currentTenantId: null,
  setCurrentTenantId: () => {},
  currentTenant: null,
  isAllTenants: false,
  apiTenantId: null,
};

export function useTenants(): TenantContextValue {
  const ctx = useContext(TenantContext);
  return ctx ?? FALLBACK;
}
