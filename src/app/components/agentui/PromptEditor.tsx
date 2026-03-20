import { useState } from "react";
import { GitBranch, X, ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";

interface PromptEditorProps {
  initialPrompt: string;
  payload: string;
  draftLabel?: string;
  commitLabel?: string;
  onCommit: (prompt: string, payload: string) => void;
  onRefine: (currentPrompt: string, payload: string) => void;
  onCancel: () => void;
  disabled?: boolean;
  refining?: boolean;
}

export function PromptEditor({
  initialPrompt,
  payload,
  draftLabel = "Review GitHub Export",
  commitLabel = "Push to GitHub",
  onCommit,
  onRefine,
  onCancel,
  disabled = false,
  refining = false,
}: PromptEditorProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [payloadExpanded, setPayloadExpanded] = useState(false);

  // Sync prompt when parent updates it after refinement
  const [prevInitial, setPrevInitial] = useState(initialPrompt);
  if (initialPrompt !== prevInitial) {
    setPrompt(initialPrompt);
    setPrevInitial(initialPrompt);
  }

  const prettyPayload = (() => {
    try {
      return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return payload;
    }
  })();

  const busy = disabled || refining;

  return (
    <div className="bg-gray-50 border border-emerald-500/30 rounded-[10px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
            {draftLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Prompt section — editable */}
        <div>
          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider block mb-2">
            Header Prompt (editable)
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={busy}
            rows={8}
            className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500/50 resize-y disabled:opacity-50 transition-colors leading-relaxed"
            style={{ minHeight: "140px", maxHeight: "400px" }}
          />
        </div>

        {/* Payload section — read only, collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setPayloadExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-600 transition-colors"
          >
            {payloadExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            ServiceNow Payload (read only)
          </button>
          {payloadExpanded && (
            <div className="bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-[350px] custom-scrollbar select-text">
              <pre className="text-xs text-orange-600 whitespace-pre-wrap font-mono leading-relaxed">
                {prettyPayload}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Footer with three buttons */}
      <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Edit the prompt above or refine with AI, then push when ready
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onRefine(prompt, payload)}
            disabled={busy || !prompt.trim()}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {refining ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>Refine Prompt</span>
          </button>
          <button
            type="button"
            onClick={() => onCommit(prompt, payload)}
            disabled={busy || !prompt.trim()}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {disabled && !refining ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitBranch className="w-4 h-4" />
            )}
            <span>{commitLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
