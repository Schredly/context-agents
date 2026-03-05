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
              <div className="text-xs text-gray-500 mb-1 text-right">
                {timestamp}
              </div>
            )}
            <div className="bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-lg shadow-blue-600/20">
              {content}
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-gray-300" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="flex items-start gap-3 max-w-2xl">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          {timestamp && (
            <div className="text-xs text-gray-500 mb-1">{timestamp}</div>
          )}
          <div className="bg-gray-800 text-gray-100 px-4 py-2.5 rounded-2xl rounded-tl-sm border border-gray-700">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
