import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, MoreVertical, Loader2, AlertCircle } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useTenants } from "../context/TenantContext";
import { TenantFilter, type TenantFilterValue } from "../components/TenantFilter";
import * as api from "../services/api";

export default function UseCasesPage() {
  const { currentTenantId } = useTenants();
  const [filterTenant, setFilterTenant] = useState<TenantFilterValue>("all");
  const [useCases, setUseCases] = useState<api.UseCaseResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUseCases = useCallback(async () => {
    if (!currentTenantId) {
      setUseCases([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getUseCases(currentTenantId, filterTenant);
      setUseCases(data);
    } catch {
      toast.error("Failed to load use cases");
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, filterTenant]);

  useEffect(() => {
    fetchUseCases();
  }, [fetchUseCases]);

  const handleDelete = async (id: string) => {
    if (!currentTenantId) return;
    if (!confirm("Are you sure you want to delete this use case?")) return;
    try {
      await api.deleteUseCase(currentTenantId, id);
      toast.success("Use case deleted");
      await fetchUseCases();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete use case",
      );
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              Use Cases
            </h1>
            <p className="text-sm text-gray-600">
              Workflow templates built from skills.
            </p>
            <div className="mt-2">
              <TenantFilter value={filterTenant} onChange={setFilterTenant} />
            </div>
          </div>
          <Link
            to="/use-cases/create"
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Create Use Case
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading use cases...
          </div>
        ) : !currentTenantId ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <AlertCircle className="w-5 h-5 mr-2" />
            Select a tenant to view use cases.
          </div>
        ) : useCases.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="mb-3">No use cases configured yet.</p>
            <Link
              to="/use-cases/create"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Create Use Case
            </Link>
          </div>
        ) : (
          /* Table */
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Skills
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Triggers
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
                {useCases.map((useCase) => (
                  <tr
                    key={useCase.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        to={`/use-cases/${useCase.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-gray-700"
                      >
                        {useCase.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {useCase.description}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {useCase.steps.slice(0, 2).map((step, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700"
                          >
                            {step.name || step.skill_id}
                          </span>
                        ))}
                        {useCase.steps.length > 2 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                            +{useCase.steps.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {useCase.triggers.join(", ") || "\u2014"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          useCase.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {useCase.status === "active" ? "Active" : "Draft"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/use-cases/${useCase.id}`}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(useCase.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
