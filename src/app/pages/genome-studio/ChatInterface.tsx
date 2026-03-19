import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Folder, FileText, Mic, Square, Paperclip } from 'lucide-react';
import type { ChatMessage, FilesystemPlan } from '../../store/useGenomeStore';

interface ChatInterfaceProps {
  activeContext: string;
  messages: ChatMessage[];
  onSend: (content: string, attachments?: string[]) => void;
  isThinking: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export function ChatInterface({ activeContext, messages, onSend, isThinking, expanded, onToggleExpand }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [attachments, setAttachments] = useState<{ name: string; content: string }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSend = () => {
    if (!input.trim() && attachments.length === 0) return;
    if (isThinking) return;
    // Stop any active recording before sending
    if (recognition) { recognition.stop(); setIsRecording(false); setRecognition(null); }
    const attachContent = attachments.map((a) => `[Attached: ${a.name}]\n${a.content}`);
    onSend(input.trim(), attachContent.length > 0 ? attachContent : undefined);
    setInput('');
    setAttachments([]);
  };

  // Voice-to-text
  const startVoice = () => {
    // @ts-ignore
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported. Use Chrome or Edge.'); return; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onstart = () => setIsRecording(true);
    let baseText = '';
    r.onresult = (e: any) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      if (final) baseText = final.trim();
      setInput(baseText + (interim ? ' ' + interim : ''));
    };
    r.onerror = () => setIsRecording(false);
    r.onend = () => { setIsRecording(false); baseText = ''; };
    r.start();
    setRecognition(r);
  };

  const stopVoice = () => { recognition?.stop(); setIsRecording(false); };

  // File upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (/\.(mp4|mov|webm)$/i.test(file.name)) {
        // Upload video file
        const formData = new FormData();
        formData.append("file", file);
        fetch("/api/video-genome/upload", { method: "POST", body: formData })
          .then(r => r.json())
          .then(data => {
            if (data.status === "ok") {
              setAttachments(prev => [...prev, { name: file.name, content: `[video:${data.video_id}]` }]);
            }
          });
      } else {
        // existing text file reading logic
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments((prev) => [...prev, { name: file.name, content: reader.result as string }]);
        };
        reader.readAsText(file);
      }
    });
    e.target.value = '';
  };

  return (
    <div className="flex-1 flex flex-col bg-white h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 mb-1">OverYonder<span className="text-gray-400">.ai</span> <span className="text-sm font-normal text-gray-500">Genome Studio</span></h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Working on:</span>
            <span className="px-2.5 py-0.5 bg-orange-50 text-orange-700 text-sm font-medium rounded-md border border-orange-200">
              {activeContext}
            </span>
          </div>
        </div>
        {onToggleExpand && (
          <button onClick={onToggleExpand}
            className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
              expanded ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}>
            {expanded ? 'Collapse Workspace' : 'Expand Workspace'}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && !isThinking && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">Ask anything about your genome — transform, restructure, extract prompts...</p>
              <p className="text-xs mt-2">You can dictate with the mic button or attach files for context.</p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id}>
              <div className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.type === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-[10px] font-bold">OY</span>
                  </div>
                )}
                <div className={`flex-1 ${message.type === 'user' ? 'max-w-[80%] ml-auto' : ''}`}>
                  <div className={message.type === 'user' ? 'bg-gray-100 px-4 py-3 rounded-2xl' : ''}>
                    <p className="text-[14px] leading-relaxed text-gray-900 whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {/* Reasoning steps */}
                  {message.reasoning && message.reasoning.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {message.reasoning.map((step, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Filesystem Plan */}
                  {message.filesystemPlan && message.filesystemPlan.files && message.filesystemPlan.files.length > 0 && (
                    <FilesystemPlanView plan={message.filesystemPlan} />
                  )}
                  {/* Fallback: show commit button if plan exists but no files rendered */}
                  {message.filesystemPlan && (!message.filesystemPlan.files || message.filesystemPlan.files.length === 0) && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      Plan generated but no files included. Check the Transformed tab below.
                    </div>
                  )}

                  {/* Diff */}
                  {message.diff && typeof message.diff === 'string' && message.diff.length > 0 && (
                    <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-gray-500 mb-1.5 uppercase">Changes</p>
                      <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{message.diff}</pre>
                    </div>
                  )}
                </div>
                {message.type === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-[10px] font-bold">You</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[10px] font-bold">OY</span>
              </div>
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-6 pb-2">
          <div className="max-w-3xl mx-auto flex gap-2 flex-wrap">
            {attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                <Paperclip className="w-3 h-3" />
                {a.name}
                <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-orange-400 hover:text-orange-600 ml-1">&times;</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-6 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-1 bg-white border border-gray-300 rounded-2xl shadow-sm focus-within:border-gray-400">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask anything about your genome..."
              className="flex-1 px-4 py-2.5 bg-transparent resize-none focus:outline-none text-sm max-h-[150px]"
              rows={1}
              onInput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
            />
            <div className="flex items-center gap-0.5 pr-2 pb-2">
              <input ref={fileInputRef} type="file" multiple accept=".yaml,.yml,.json,.txt,.md,.mp4,.mov,.webm" className="hidden" onChange={handleFileUpload} />
              <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full" title="Attach file">
                <Paperclip className="w-4 h-4" />
              </button>
              {isRecording ? (
                <button onClick={stopVoice} className="p-1.5 text-red-600 hover:bg-red-50 rounded-full" title="Stop recording">
                  <Square className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button onClick={startVoice} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full" title="Voice input">
                  <Mic className="w-4 h-4" />
                </button>
              )}
              <button onClick={handleSend} disabled={(!input.trim() && attachments.length === 0) || isThinking}
                className="p-1.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          {isRecording && (
            <div className="mt-1.5 text-xs text-red-600 flex items-center gap-1.5 justify-center">
              <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
              Recording... click stop when done
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilesystemPlanView({ plan }: { plan: FilesystemPlan }) {
  return (
    <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900">Filesystem Plan</h3>
        <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
          branch: {plan.branch_name}
        </span>
      </div>
      <div className="p-3 space-y-1.5">
        {plan.folders.map((folder, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
            <Folder className="w-3.5 h-3.5 text-orange-500" />
            <span className="font-mono">{folder}/</span>
          </div>
        ))}
        {plan.files.map((file, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <FileText className="w-3.5 h-3.5 text-green-500" />
            <span className="font-mono text-gray-700">{file.path}</span>
            <span className="text-[10px] text-gray-400">{file.content.length} chars</span>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-500">
        {plan.files.length} file(s) &middot; {plan.folders.length} folder(s) &middot; <span className="font-mono">{plan.base_path}</span>
      </div>
    </div>
  );
}
