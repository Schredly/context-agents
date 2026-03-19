import { Plus, Pencil, Trash2, Languages } from "lucide-react";
import { Link } from "react-router";
import { useState, useEffect, useCallback } from "react";
import { useTenants } from "../context/TenantContext";

interface TranslationItem {
  id: string;
  name: string;
  description: string;
  source_vendor: string;
  source_type: string;
  target_platform: string;
  status: string;
}

export default function TranslationsPage() {
  const { currentTenantId } = useTenants();
  const [translations, setTranslations] = useState<TranslationItem[]>([]);

  const fetchTranslations = useCallback(() => {
    if (!currentTenantId) return;
    fetch(`/api/admin/${currentTenantId}/translations`)
      .then((r) => r.json())
      .then(setTranslations)
      .catch(console.error);
  }, [currentTenantId]);

  useEffect(() => {
    fetchTranslations();
  }, [fetchTranslations]);

  const deleteTranslation = async (id: string) => {
    if (!currentTenantId) return;
    const res = await fetch(`/api/admin/${currentTenantId}/translations/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTranslations(translations.filter((t) => t.id !== id));
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">Translations</h1>
            <p className="text-sm text-gray-600">
              Reusable translation recipes that convert application genomes into target platform formats.
            </p>
          </div>
          <Link
            to="/genomes/translations/create"
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Translation
          </Link>
        </div>

        {/* Table */}
        {translations.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Languages className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No translations yet.</p>
            <Link
              to="/genomes/translations/create"
              className="inline-flex items-center gap-1.5 mt-3 text-sm text-orange-600 hover:text-orange-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Create your first translation
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Source Vendor</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Target Platform</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {translations.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/genomes/translations/${t.id}`} className="text-sm font-medium text-gray-900 hover:text-orange-600">
                        {t.name}
                      </Link>
                      {t.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">{t.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{t.source_vendor || "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{t.target_platform || "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        t.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/genomes/translations/${t.id}`}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                        <button onClick={() => deleteTranslation(t.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5" />
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
