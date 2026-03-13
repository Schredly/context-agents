import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, MoreVertical, Loader2, AlertCircle } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useTenants } from "../context/TenantContext";
import { TenantFilter, type TenantFilterValue } from "../components/TenantFilter";
import * as api from "../services/api";
import { format } from "date-fns";

export default function SkillsPage() {
  const { currentTenantId } = useTenants();
  const [filterTenant, setFilterTenant] = useState<TenantFilterValue>("all");
  const [skills, setSkills] = useState<api.SkillResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSkills = useCallback(async () => {
    if (!currentTenantId) {
      setSkills([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getSkills(currentTenantId, filterTenant);
      setSkills(data);
    } catch {
      toast.error("Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, filterTenant]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleDelete = async (skillId: string) => {
    if (!currentTenantId) return;
    if (!confirm("Are you sure you want to delete this skill?")) return;
    try {
      await api.deleteSkill(currentTenantId, skillId);
      toast.success("Skill deleted");
      await fetchSkills();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete skill");
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              Skills
            </h1>
            <p className="text-sm text-gray-600">Reusable AI capabilities.</p>
            <div className="mt-2">
              <TenantFilter value={filterTenant} onChange={setFilterTenant} />
            </div>
          </div>
          <Link
            to="/skills/create"
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Create Skill
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading skills...
          </div>
        ) : !currentTenantId ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <AlertCircle className="w-5 h-5 mr-2" />
            Select a tenant to view skills.
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="mb-3">No skills configured yet.</p>
            <Link
              to="/skills/create"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Create Skill
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
                    Tools
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {skills.map((skill) => (
                  <tr
                    key={skill.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        to={`/skills/${skill.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-gray-700"
                      >
                        {skill.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {skill.description}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {skill.tools.slice(0, 2).map((tool, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700"
                          >
                            {tool}
                          </span>
                        ))}
                        {skill.tools.length > 2 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                            +{skill.tools.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {skill.model}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {format(new Date(skill.updated_at), "MMM d, yyyy")}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/skills/${skill.id}`}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(skill.id)}
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
