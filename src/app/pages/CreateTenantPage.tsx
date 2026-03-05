import { useState } from "react";
import { X, Check } from "lucide-react";
import { useNavigate } from "react-router";

const steps = [
  { id: 1, name: "Create Tenant" },
  { id: 2, name: "Add Integrations" },
  { id: 3, name: "Enable Use Cases" },
  { id: 4, name: "Activate" },
];

export default function CreateTenantPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    tenantId: "",
    status: "Draft",
  });
  const navigate = useNavigate();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            Create New Tenant
          </h1>
          <button
            onClick={() => navigate("/")}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                      currentStep > step.id
                        ? "bg-green-500 border-green-500 text-white"
                        : currentStep === step.id
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 text-gray-400"
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-sm">{step.id}</span>
                    )}
                  </div>
                  <span
                    className={`ml-2 text-sm ${
                      currentStep >= step.id
                        ? "text-gray-900 font-medium"
                        : "text-gray-400"
                    }`}
                  >
                    {step.name}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-4 ${
                      currentStep > step.id ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          {currentStep === 1 && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Tenant Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter tenant name"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Tenant ID
                </label>
                <input
                  type="text"
                  name="tenantId"
                  value={formData.tenantId}
                  onChange={handleChange}
                  placeholder="e.g., acme-corp"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Continue
                </button>
              </div>
            </form>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Select integrations to enable for this tenant (optional).
              </p>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Select use cases to enable for this tenant (optional).
              </p>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(4)}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-green-900 mb-2">
                  Ready to Activate
                </h3>
                <p className="text-sm text-green-700">
                  Your tenant <strong>{formData.name}</strong> is ready to be
                  activated.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => navigate("/")}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Create Tenant
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
