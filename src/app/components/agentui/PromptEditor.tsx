import { useState } from "react";
import { GitBranch, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface PromptEditorProps {
  initialPrompt: string;
  payload: string;
  draftLabel?: string;
  commitLabel?: string;
  onCommit: (prompt: string, payload: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function PromptEditor({
  initialPrompt,
  payload,
  draftLabel = "ServiceNow \u2192 GitHub Export",
  commitLabel = "Commit to GitHub",
  onCommit,
  onCancel,
  disabled = false,
}: PromptEditorProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [payloadExpanded, setPayloadExpanded] = useState(true);

  const prettyPayload = (() => {
    try {
      return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return payload;
    }
  })();

  return (
    <div className="bg-[#102A43] border border-emerald-500/30 rounded-[10px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2F5F7A] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
            {draftLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="text-[#8FA7B5] hover:text-red-400 transition-colors disabled:opacity-50"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Prompt section — editable */}
        <div>
          <label className="text-[10px] font-medium text-[#8FA7B5] uppercase tracking-wider block mb-2">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={disabled}
            rows={5}
            className="w-full bg-[#0B1E2D] border border-[#2F5F7A] rounded-lg px-4 py-3 text-sm text-[#F1F5F9] placeholder-[#8FA7B5] focus:outline-none focus:border-emerald-500/50 resize-y disabled:opacity-50 transition-colors leading-relaxed"
            style={{ minHeight: "100px", maxHeight: "300px" }}
          />
        </div>

        {/* Payload section — read only */}
        <div>
          <button
            type="button"
            onClick={() => setPayloadExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-medium text-[#8FA7B5] uppercase tracking-wider mb-2 hover:text-[#C7D2DA] transition-colors"
          >
            {payloadExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Payload (read only)
          </button>
          {payloadExpanded && (
            <div className="bg-[#0B1E2D] border border-[#2F5F7A] rounded-lg p-3 overflow-auto max-h-[350px] custom-scrollbar">
              <pre className="text-xs text-[#8FD6E8] whitespace-pre-wrap font-mono leading-relaxed">
                {prettyPayload}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Footer with commit button */}
      <div className="px-4 py-3 border-t border-[#2F5F7A] flex items-center justify-between">
        <span className="text-xs text-[#8FA7B5]">
          Edit the prompt above, then commit when ready
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="px-4 py-2 rounded-lg bg-[#102A43] hover:bg-[#1E4A66] text-[#C7D2DA] border border-[#2F5F7A] transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onCommit(prompt, payload)}
            disabled={disabled || !prompt.trim()}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {disabled ? (
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
