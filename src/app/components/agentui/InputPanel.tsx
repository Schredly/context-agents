import { Send, Paperclip, Wrench, Sparkles } from "lucide-react";
import { useState } from "react";

interface InputPanelProps {
  onSend: (message: string) => void;
  onAttachContext?: () => void;
  onRunTool?: () => void;
  disabled?: boolean;
}

export function InputPanel({
  onSend,
  onAttachContext,
  onRunTool,
  disabled = false,
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
    <div className="border-t border-gray-800 bg-gradient-to-b from-gray-950 to-black px-4 py-4">
      {/* Context indicator */}
      <div className="mb-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-gray-500">Enterprise AI Agent</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <kbd className="px-1.5 py-0.5 bg-gray-900 border border-gray-800 rounded text-xs">
            Shift + Enter
          </kbd>
          <span>for new line</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Input field with glow effect */}
        <div className="relative">
          {isFocused && (
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-20 animate-pulse" />
          )}
          <div className="relative">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Ask the agent anything about your systems..."
              disabled={disabled}
              rows={1}
              className={`w-full bg-gray-900 border rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none resize-none disabled:opacity-50 transition-all duration-200 ${
                isFocused
                  ? "border-blue-500/50 shadow-lg shadow-blue-500/10"
                  : "border-gray-800"
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
            {/* Character counter (optional, shown when typing) */}
            {message.length > 0 && (
              <div className="absolute bottom-2 right-3 text-xs text-gray-600">
                {message.length}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-2">
          {/* Secondary actions */}
          <div className="flex gap-2">
            {onAttachContext && (
              <button
                type="button"
                onClick={onAttachContext}
                disabled={disabled}
                className="group px-3.5 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-800 hover:border-gray-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-gray-800/30"
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
                className="group px-3.5 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-800 hover:border-gray-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-gray-800/30"
                title="Run Tool"
              >
                <Wrench className="w-4 h-4" />
                <span className="text-sm hidden sm:inline">Run Tool</span>
              </button>
            )}
          </div>

          {/* Primary action */}
          <button
            type="submit"
            disabled={disabled || !message.trim()}
            className="relative group px-5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 hover:scale-[1.02] active:scale-[0.98]"
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <Send className="w-4 h-4 relative z-10" />
            <span className="text-sm relative z-10">Ask Agent</span>
          </button>
        </div>
      </form>

      {/* Status bar */}
      <div className="mt-3 pt-3 border-t border-gray-900 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-gray-600">Agent online</span>
          </div>
          <span className="text-gray-800">•</span>
          <span className="text-gray-600">Response time: ~2s</span>
        </div>
        <div className="text-gray-700">
          Powered by Enterprise AI
        </div>
      </div>
    </div>
  );
}
