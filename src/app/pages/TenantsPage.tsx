import { useNavigate } from 'react-router';
import { Plus, Trash2, Settings, Loader2 } from 'lucide-react';
import { deleteTenant } from '../services/api';
import { useTenants } from '../context/TenantContext';
import { format } from 'date-fns';

export function TenantsPage() {
  const navigate = useNavigate();
  const { tenants, loading, refreshTenants } = useTenants();

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this tenant?')) {
      await deleteTenant(id);
      await refreshTenants();
    }
  };

  const displayStatus = (status: string) => {
    // Backend stores lowercase; display capitalised
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl mb-1">Tenants</h1>
          <p className="text-sm text-muted-foreground">
            Manage multi-tenant configurations
          </p>
        </div>
        <button
          onClick={() => navigate('/tenants/create')}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Tenant
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading tenants...
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                  Tenant ID
                </th>
                <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                  Created At
                </th>
                <th className="text-right px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    No tenants yet. Click &ldquo;Create Tenant&rdquo; to get started.
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm">{tenant.name}</td>
                    <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{tenant.id}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`
                          inline-flex px-2 py-0.5 rounded text-xs
                          ${
                            tenant.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }
                        `}
                      >
                        {displayStatus(tenant.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {format(new Date(tenant.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/tenants/create`)}
                          className="p-2 hover:bg-gray-100 rounded transition-colors"
                          title="Open Setup"
                        >
                          <Settings className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleDelete(tenant.id)}
                          className="p-2 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
