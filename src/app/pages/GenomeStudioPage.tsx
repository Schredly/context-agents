import { useEffect, useState, useCallback, useRef } from "react";
import { GenomeExplorer } from "./genome-studio/GenomeExplorer";
import { ChatInterface } from "./genome-studio/ChatInterface";
import { GenomeWorkspace } from "./genome-studio/GenomeWorkspace";
import { IntegrationsSidebar } from "./genome-studio/IntegrationsSidebar";
import { SaveTranslationModal } from "./genome-studio/SaveTranslationModal";
import { useGenomeStore } from "../store/useGenomeStore";

export default function GenomeStudioPage() {
  const store = useGenomeStore();
  const [connectedRepo, setConnectedRepo] = useState<string | null>(null);
  const [repoLoading, setRepoLoading] = useState(false);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);
  const [chatHeight, setChatHeight] = useState(60); // percentage
  const [showSaveModal, setShowSaveModal] = useState(false);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setChatHeight(Math.max(15, Math.min(85, pct)));
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleConnectRepo = async (repoName: string) => {
    setRepoLoading(true);
    setConnectedRepo(repoName);
    await store.listGenomes();
    setRepoLoading(false);
  };

  const getActiveContext = () => {
    if (!store.selectedGenomePath) return "No file selected";
    const parts = store.selectedGenomePath.split("/");
    const vendorIdx = parts.indexOf("vendors");
    const vendor = vendorIdx >= 0 ? parts[vendorIdx + 1] : "unknown";
    const genome = parts[parts.length - 2];
    return `${vendor} / ${genome}`;
  };

  const getVendorFromPath = (path: string | null) => {
    if (!path) return "";
    const parts = path.split("/");
    const vendorIdx = parts.indexOf("vendors");
    return vendorIdx >= 0 ? parts[vendorIdx + 1] || "" : "";
  };

  const handleFileSelect = (path: string) => {
    store.setSelectedGenomePath(path);
    store.loadGenome(path);
  };

  const handleFetchTranslations = () => {
    store.fetchTranslations();
  };

  const handleRunTranslation = async (translationId: string) => {
    // Find the translation name for the chat message
    const translation = store.translations.find((t) => t.id === translationId);
    const name = translation?.name || translationId;

    // Add a user message to chat so the user sees the action
    store.addUserMessage(`Run translation: ${name}`);

    // Run the translation
    return await store.runTranslation(translationId);
  };

  const handleSaveAsTranslation = () => {
    setShowSaveModal(true);
  };

  const handleSendMessage = async (content: string, attachments?: string[]) => {
    store.addUserMessage(content);

    // Check for video attachments — only extract genome when explicitly asked
    const videoAttachment = attachments?.find(a => a.startsWith("[video:"));
    if (videoAttachment) {
      const videoId = videoAttachment.match(/\[video:(vid_[a-f0-9]+)\]/)?.[1];
      if (videoId && /extract.*genome/i.test(content)) {
        await store.extractVideoGenome(videoId, content);
        return;
      }
    }

    const lower = content.toLowerCase();
    const isTransform = /\b(create|add|convert|store|save|move|extract|generate|build|write|make|transform|turn|put|commit)\b/.test(lower);
    const isQuestion = !isTransform && (
      /^(what|tell|describe|explain|read|show|list|analyze|how|why|is |are |do |does |can )/.test(lower)
      || lower.includes("?")
    );

    if (isQuestion && !attachments?.length) {
      await store.chatWithGenome(content);
    } else {
      await store.transformGenome(content, attachments);
    }
  };

  const handleSave = async () => {
    return await store.saveFilesystemPlan();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {!workspaceExpanded && (
        <GenomeExplorer
          onFileSelect={handleFileSelect}
          selectedFile={store.selectedGenomePath}
          fileTree={store.fileTree}
          repoName={connectedRepo}
          isLoading={repoLoading}
        />
      )}
      <div ref={containerRef} className="flex-1 flex flex-col min-w-0">
        <div style={{ height: `${chatHeight}%` }} className="min-h-0 flex-shrink-0">
          <ChatInterface
            activeContext={getActiveContext()}
            messages={store.chatHistory}
            onSend={handleSendMessage}
            isThinking={store.loadingState === "transforming"}
            expanded={workspaceExpanded}
            onToggleExpand={() => {
              setWorkspaceExpanded(!workspaceExpanded);
              if (!workspaceExpanded) setChatHeight(35);
              else setChatHeight(60);
            }}
          />
        </div>
        {/* Drag handle */}
        <div onMouseDown={handleMouseDown}
          className="h-1.5 bg-gray-100 hover:bg-orange-200 cursor-row-resize flex-shrink-0 flex items-center justify-center border-y border-gray-200 transition-colors">
          <div className="w-8 h-0.5 bg-gray-300 rounded-full" />
        </div>
        <div className="flex-1 min-h-0">
          <GenomeWorkspace
            originalContent={store.originalContent}
            selectedPath={store.selectedGenomePath}
            filesystemPlan={store.filesystemPlan}
            onSave={handleSave}
            onRemoveFile={store.removeFileFromPlan}
            onClearPlan={store.clearPlan}
            isSaving={store.loadingState === "saving"}
            savedBranch={store.savedBranch}
            expanded={workspaceExpanded}
            translations={store.translations}
            translationsLoading={store.translationsLoading}
            onFetchTranslations={handleFetchTranslations}
            onRunTranslation={handleRunTranslation}
            onSaveAsTranslation={handleSaveAsTranslation}
            isTransforming={store.loadingState === "transforming"}
            repoConnected={!!connectedRepo}
          />
        </div>
      </div>
      {!workspaceExpanded && (
        <IntegrationsSidebar
          filesystemPlan={store.filesystemPlan}
          onCommit={handleSave}
          isSaving={store.loadingState === "saving"}
          savedBranch={store.savedBranch}
          onConnectRepo={handleConnectRepo}
          onDisconnectRepo={() => setConnectedRepo(null)}
          connectedRepo={connectedRepo}
        />
      )}

      {/* Save as Translation Modal */}
      {showSaveModal && (
        <SaveTranslationModal
          sourceVendor={getVendorFromPath(store.selectedGenomePath)}
          onGenerate={store.generateTranslationRecipe}
          onSave={store.saveAsTranslation}
          onClose={() => setShowSaveModal(false)}
          hasOutputFiles={!!store.filesystemPlan?.files?.length}
        />
      )}
    </div>
  );
}
