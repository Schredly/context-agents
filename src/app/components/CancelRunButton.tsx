import { XCircle } from "lucide-react";

interface CancelRunButtonProps {
  onCancel: () => void;
  disabled?: boolean;
}

export function CancelRunButton({ onCancel, disabled = false }: CancelRunButtonProps) {
  return (
    <button
      onClick={onCancel}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <XCircle className="w-4 h-4" />
      Cancel Run
    </button>
  );
}
