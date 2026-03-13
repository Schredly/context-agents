import { Plus, Pencil, Power, PowerOff, Eye, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { useState, useEffect, useCallback } from "react";
import { useTenants } from "../context/TenantContext";
import { TenantFilter, type TenantFilterValue } from "../components/TenantFilter";

interface ActionItem {
  id: string;
  name: string;
  integration_id: string;
  operation: string;
  description: string;
  status: string;
}

export default function ActionsCatalogPage() {
  const { currentTenantId } = useTenants();
  const [filterTenant, setFilterTenant] = useState<TenantFilterValue>("all");
  const [actions, setActions] = useState<ActionItem[]>([]);

  const fetchActions = useCallback(() => {
    if (!currentTenantId) return;
    const qs = filterTenant ? `?filter_tenant=${encodeURIComponent(filterTenant)}` : '';
    fetch(`/api/admin/${currentTenantId}/actions${qs}`)
      .then((r) => r.json())
      .then(setActions)
      .catch(console.error);
  }, [currentTenantId, filterTenant]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const toggleStatus = async (id: string) => {
    if (!currentTenantId) return;
    const action = actions.find((a) => a.id === id);
    if (!action) return;
    const newStatus = action.status === "active" ? "disabled" : "active";
    const res = await fetch(`/api/admin/${currentTenantId}/actions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setActions(actions.map((a) => (a.id === id ? updated : a)));
    }
  };

  const deleteAction = async (id: string) => {
    if (!currentTenantId) return;
    const res = await fetch(`/api/admin/${currentTenantId}/actions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setActions(actions.filter((a) => a.id !== id));
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              Actions Catalog
            </h1>
            <p className="text-sm text-gray-600">
              Configure actions that the agent can execute after analyzing user
              requests.
            </p>
            <div className="mt-2">
              <TenantFilter value={filterTenant} onChange={setFilterTenant} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/actions/preview"
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              <Eye className="w-4 h-4" />
              Preview Agent UI
            </Link>
            <Link
              to="/actions/create"
              className="flex items-center gap-2 px-4 py-2 bg-[#030213] text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Create Action
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Integration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Operation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {actions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <p className="text-sm text-gray-500">
                      No actions configured yet. Click Create Action to get
                      started.
                    </p>
                  </td>
                </tr>
              ) : (
                actions.map((action) => (
                  <tr
                    key={action.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {action.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {action.integration_id}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                      {action.operation}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-md">
                      {action.description}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          action.status === "active"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-gray-50 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {action.status === "active" ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/actions/${action.id}`}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <Link
                          to={`/actions/${action.id}/visibility`}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Visibility Rules"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => toggleStatus(action.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          title={
                            action.status === "active" ? "Disable" : "Enable"
                          }
                        >
                          {action.status === "active" ? (
                            <PowerOff className="w-4 h-4" />
                          ) : (
                            <Power className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => deleteAction(action.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
