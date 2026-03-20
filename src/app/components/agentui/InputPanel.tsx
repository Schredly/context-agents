import { Send, Paperclip, Wrench, CheckCircle2, X } from "lucide-react";
import { useState } from "react";

interface InputPanelProps {
  onSend: (message: string) => void;
  onAttachContext?: () => void;
  onRunTool?: () => void;
  onApprove?: () => void;
  onCancelRefine?: () => void;
  disabled?: boolean;
  mode?: "normal" | "refine" | "input";
  inputPrompt?: string;
  approveLabel?: string;
}

export function InputPanel({
  onSend,
  onAttachContext,
  onRunTool,
  onApprove,
  onCancelRefine,
  disabled = false,
  mode = "normal",
  inputPrompt,
  approveLabel,
}: InputPanelProps) {
  const [message, setMessage] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message);
      setMessage("");
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-4">
      {/* Context indicator */}
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="text-gray-500">
          {mode === "refine" ? "Prompt Refinement Mode" : mode === "input" ? "Awaiting Input" : "Enterprise AI Agent"}
        </span>
        <div className="flex items-center gap-2 text-gray-500">
          {mode === "refine" && onCancelRefine && (
            <button
              type="button"
              onClick={onCancelRefine}
              className="flex items-center gap-1 text-gray-500 hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
              <span>Cancel</span>
            </button>
          )}
          <kbd className="px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-xs">
            Shift + Enter
          </kbd>
          <span>for new line</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Input field */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={mode === "refine"
            ? "Refine the prompt... (e.g., 'only include hardware items')"
            : mode === "input"
            ? inputPrompt || "Type your answer..."
            : "Ask the agent anything about your systems..."
          }
          disabled={disabled}
          rows={1}
          className={`w-full bg-gray-50 border rounded-[10px] px-4 py-3.5 text-gray-900 placeholder-gray-400 focus:outline-none resize-none disabled:opacity-50 transition-colors duration-150 ${
            isFocused
              ? "border-gray-200"
              : "border-gray-200"
          }`}
          style={{
            minHeight: "52px",
            maxHeight: "200px",
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "52px";
            target.style.height = target.scrollHeight + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-2">
          {/* Secondary actions */}
          <div className="flex gap-2">
            {onAttachContext && (
              <button
                type="button"
                onClick={onAttachContext}
                disabled={disabled}
                className="px-3.5 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Attach Context"
              >
                <Paperclip className="w-4 h-4" />
                <span className="text-sm hidden sm:inline">Attach Context</span>
              </button>
            )}

            {onRunTool && (
              <button
                type="button"
                onClick={onRunTool}
                disabled={disabled}
                className="px-3.5 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Run Tool"
              >
                <Wrench className="w-4 h-4" />
                <span className="text-sm hidden sm:inline">Run Tool</span>
              </button>
            )}
          </div>

          {/* Primary action(s) */}
          <div className="flex items-center gap-2">
            {mode === "refine" && onApprove && (
              <button
                type="button"
                onClick={onApprove}
                disabled={disabled}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{approveLabel || "Approve & Send to Replit"}</span>
              </button>
            )}
            <button
              type="submit"
              disabled={disabled || !message.trim()}
              className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              <Send className="w-4 h-4" />
              <span>{mode === "refine" ? "Refine" : mode === "input" ? "Submit" : "Ask Agent"}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Status bar */}
      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span className="text-gray-500">Agent online</span>
          </div>
          <span className="text-gray-300">&middot;</span>
          <span className="text-gray-500">Response time: ~2s</span>
        </div>
        <div className="text-gray-500">
          Powered by Enterprise AI
        </div>
      </div>
    </div>
  );
}
