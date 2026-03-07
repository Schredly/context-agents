import { User, Bot } from "lucide-react";

interface ChatMessageProps {
  type: "user" | "agent";
  content: string;
  timestamp?: string;
}

export function ChatMessage({ type, content, timestamp }: ChatMessageProps) {
  if (type === "user") {
    return (
      <div className="flex justify-end mb-4">
        <div className="flex items-start gap-3 max-w-2xl">
          <div className="flex-1">
            {timestamp && (
              <div className="text-xs text-[#8FA7B5] mb-1 text-right">
                {timestamp}
              </div>
            )}
            <div className="bg-[#2E86AB] text-[#F1F5F9] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm">
              {content}
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#102A43] border border-[#2F5F7A] flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-[#C7D2DA]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="flex items-start gap-3 max-w-2xl">
        <div className="w-8 h-8 rounded-full bg-[#102A43] border border-[#2F5F7A] flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-[#C7D2DA]" />
        </div>
        <div className="flex-1">
          {timestamp && (
            <div className="text-xs text-[#8FA7B5] mb-1">{timestamp}</div>
          )}
          <div className="bg-[#102A43] text-[#F1F5F9] px-4 py-2.5 rounded-2xl rounded-tl-sm border border-[#2F5F7A] text-sm">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
