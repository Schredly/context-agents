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
    <div className="border-t border-[#2F5F7A] bg-[#0B1E2D] px-4 py-4">
      {/* Context indicator */}
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="text-[#8FA7B5]">
          {mode === "refine" ? "Prompt Refinement Mode" : mode === "input" ? "Awaiting Input" : "Enterprise AI Agent"}
        </span>
        <div className="flex items-center gap-2 text-[#8FA7B5]">
          {mode === "refine" && onCancelRefine && (
            <button
              type="button"
              onClick={onCancelRefine}
              className="flex items-center gap-1 text-[#8FA7B5] hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
              <span>Cancel</span>
            </button>
          )}
          <kbd className="px-1.5 py-0.5 bg-[#102A43] border border-[#2F5F7A] rounded text-xs">
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
          className={`w-full bg-[#102A43] border rounded-[10px] px-4 py-3.5 text-[#F1F5F9] placeholder-[#8FA7B5] focus:outline-none resize-none disabled:opacity-50 transition-colors duration-150 ${
            isFocused
              ? "border-[#2F5F7A]"
              : "border-[#2F5F7A]"
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
                className="px-3.5 py-2 rounded-lg bg-[#102A43] hover:bg-[#1E4A66] text-[#C7D2DA] hover:text-[#F1F5F9] border border-[#2F5F7A] hover:border-[#2F5F7A] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="px-3.5 py-2 rounded-lg bg-[#102A43] hover:bg-[#1E4A66] text-[#C7D2DA] hover:text-[#F1F5F9] border border-[#2F5F7A] hover:border-[#2F5F7A] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <span>Approve & Send to Replit</span>
              </button>
            )}
            <button
              type="submit"
              disabled={disabled || !message.trim()}
              className="px-5 py-2 rounded-lg bg-[#2E86AB] hover:bg-[#3FA7D6] text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              <Send className="w-4 h-4" />
              <span>{mode === "refine" ? "Refine" : mode === "input" ? "Submit" : "Ask Agent"}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Status bar */}
      <div className="mt-3 pt-3 border-t border-[#2F5F7A] flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#59C3C3]" />
            <span className="text-[#8FA7B5]">Agent online</span>
          </div>
          <span className="text-[#2F5F7A]">&middot;</span>
          <span className="text-[#8FA7B5]">Response time: ~2s</span>
        </div>
        <div className="text-[#8FA7B5]">
          Powered by Enterprise AI
        </div>
      </div>
    </div>
  );
}
