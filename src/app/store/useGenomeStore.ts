import { useState, useCallback } from "react";

const API = "/api/genome";

export interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
}

export interface FileEntry {
  path: string;
  content: string;
}

export interface FilesystemPlan {
  branch_name: string;
  base_path: string;
  folders: string[];
  files: FileEntry[];
}

export interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
  showDiff?: boolean;
  filesystemPlan?: FilesystemPlan;
  diff?: string;
  preview?: string;
  reasoning?: string[];
}

export interface TranslationRecord {
  id: string;
  name: string;
  description: string;
  source_vendor: string;
  source_type: string;
  target_platform: string;
  instructions: string;
  status: string;
}

export function useGenomeStore() {
  const [selectedGenomePath, setSelectedGenomePath] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState("");
  const [modifiedContent, setModifiedContent] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [loadingState, setLoadingState] = useState<"idle" | "loading" | "transforming" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<any[]>([]);
  const [filesystemPlan, setFilesystemPlan] = useState<FilesystemPlan | null>(null);
  const [savedBranch, setSavedBranch] = useState<string | null>(null);
  const [translations, setTranslations] = useState<TranslationRecord[]>([]);
  const [translationsLoading, setTranslationsLoading] = useState(false);

  const listGenomes = useCallback(async () => {
    setLoadingState("loading");
    try {
      const res = await fetch(`${API}/list`);
      const data = await res.json();
      setFileTree(data.files || []);
      setLoadingState("idle");
      return data;
    } catch {
      setLoadingState("error");
      setError("Failed to list genomes");
      return null;
    }
  }, []);

  const loadGenome = useCallback(async (path: string) => {
    setLoadingState("loading");
    setSelectedGenomePath(path);
    try {
      const res = await fetch(`${API}/load?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setOriginalContent(data.content || "");
      setModifiedContent(data.content || "");
      setFilesystemPlan(null);
      setSavedBranch(null);
      setLoadingState("idle");
      return data;
    } catch {
      setLoadingState("error");
      setError("Failed to load genome");
      return null;
    }
  }, []);

  const chatWithGenome = useCallback(async (prompt: string) => {
    setLoadingState("transforming");
    try {
      // Build file tree string for context
      const treeStr = fileTree.length > 0
        ? JSON.stringify(fileTree.map((n: any) => n.name + (n.children ? '/' : '')).slice(0, 20))
        : "";

      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          content: modifiedContent || originalContent,
          file_tree: treeStr,
        }),
      });
      const data = await res.json();

      const msg: ChatMessage = {
        id: Date.now().toString(),
        type: "assistant",
        content: data.answer || data.error || "No response",
        timestamp: new Date(),
        reasoning: data.reasoning || [],
      };
      setChatHistory((prev) => [...prev, msg]);
      setLoadingState("idle");
      return data;
    } catch {
      setLoadingState("error");
      setError("Chat failed");
      return null;
    }
  }, [fileTree, modifiedContent, originalContent]);

  const transformGenome = useCallback(async (prompt: string, attachments?: string[]) => {
    setLoadingState("transforming");
    setSavedBranch(null);

    // Build the full prompt with attachments
    let fullPrompt = prompt;
    if (attachments && attachments.length > 0) {
      fullPrompt += "\n\n--- ATTACHED FILES ---\n" + attachments.join("\n\n");
    }

    try {
      const res = await fetch(`${API}/transform`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: selectedGenomePath || "genomes",
          content: modifiedContent || originalContent || "",
          prompt: fullPrompt,
        }),
      });
      const data = await res.json();

      if (data.status === "error") {
        const errMsg: ChatMessage = {
          id: Date.now().toString(),
          type: "assistant",
          content: data.error || "Transform failed",
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errMsg]);
        setLoadingState("error");
        return data;
      }

      const newPlan = data.filesystem_plan as FilesystemPlan | undefined;
      // Merge new files into existing plan instead of replacing
      setFilesystemPlan((prev) => {
        if (!newPlan || !newPlan.files || newPlan.files.length === 0) return prev;
        if (!prev) return newPlan;
        // Merge: keep existing files, add new ones (skip duplicates by path)
        const existingPaths = new Set(prev.files.map((f) => f.path));
        const mergedFiles = [
          ...prev.files,
          ...newPlan.files.filter((f) => !existingPaths.has(f.path)),
        ];
        const mergedFolders = [...new Set([...prev.folders, ...(newPlan.folders || [])])];
        return {
          ...prev,
          files: mergedFiles,
          folders: mergedFolders,
          branch_name: newPlan.branch_name || prev.branch_name,
        };
      });
      console.log("[GenomeStore] Transform result:", { newPlan, reasoning: data.reasoning, explanation: data.explanation });

      const fileCount = newPlan?.files?.length || 0;
      const branchName = newPlan?.branch_name || "";
      const explanation = data.explanation || data.message || "Transformation plan generated.";
      const summary = fileCount > 0
        ? `${explanation}\n\n${fileCount} file(s) ready to commit to branch: ${branchName}`
        : explanation;

      const assistantMsg: ChatMessage = {
        id: Date.now().toString(),
        type: "assistant",
        content: summary,
        timestamp: new Date(),
        showDiff: true,
        filesystemPlan: newPlan,
        diff: data.diff || "",
        preview: data.preview || "",
        reasoning: data.reasoning || undefined,
      };

      setChatHistory((prev) => [...prev, assistantMsg]);
      setLoadingState("idle");
      return data;
    } catch {
      setLoadingState("error");
      setError("Transform failed");
      return null;
    }
  }, [selectedGenomePath, modifiedContent, originalContent]);

  const saveFilesystemPlan = useCallback(async () => {
    if (!filesystemPlan) return null;
    setLoadingState("saving");
    try {
      const res = await fetch(`${API}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filesystem_plan: filesystemPlan }),
      });
      const data = await res.json();

      if (data.status === "ok") {
        setSavedBranch(data.branch || filesystemPlan.branch_name);

        const saveMsg: ChatMessage = {
          id: Date.now().toString(),
          type: "assistant",
          content: `Saved ${data.file_count || 0} file(s) to branch: ${data.branch}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, saveMsg]);
      }

      setLoadingState("idle");
      return data;
    } catch {
      setLoadingState("error");
      setError("Save failed");
      return null;
    }
  }, [filesystemPlan]);

  const removeFileFromPlan = useCallback((index: number) => {
    setFilesystemPlan((prev) => {
      if (!prev) return prev;
      const newFiles = prev.files.filter((_, i) => i !== index);
      if (newFiles.length === 0) return null; // Clear plan if no files left
      return { ...prev, files: newFiles };
    });
  }, []);

  const clearPlan = useCallback(() => {
    setFilesystemPlan(null);
    setSavedBranch(null);
  }, []);

  const addUserMessage = useCallback((content: string) => {
    setChatHistory((prev) => [
      ...prev,
      { id: Date.now().toString(), type: "user", content, timestamp: new Date() },
    ]);
  }, []);

  const triggerAction = useCallback(async (action: string, payload: Record<string, any> = {}) => {
    try {
      const res = await fetch(`${API}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      return await res.json();
    } catch {
      return { status: "error", error: "Action failed" };
    }
  }, []);

  const fetchTranslations = useCallback(async (vendor?: string) => {
    setTranslationsLoading(true);
    try {
      const url = vendor
        ? `/api/admin/acme/translations/by-vendor/${encodeURIComponent(vendor)}`
        : `/api/admin/acme/translations`;
      const res = await fetch(url);
      const data = await res.json();
      setTranslations(data || []);
    } catch {
      setTranslations([]);
    }
    setTranslationsLoading(false);
  }, []);

  const runTranslation = useCallback(async (translationId: string) => {
    setLoadingState("transforming");
    setSavedBranch(null);
    setError(null);
    try {
      const res = await fetch(`${API}/run-translation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          translation_id: translationId,
          content: modifiedContent || originalContent || "",
          path: selectedGenomePath || "genomes",
        }),
      });
      const data = await res.json();

      if (data.status === "error") {
        let errText = `Translation failed: ${data.error || "Unknown error"}`;
        if (data.raw_response) {
          errText += `\n\nLLM response (first 500 chars):\n${data.raw_response.slice(0, 500)}`;
        }
        const errMsg: ChatMessage = {
          id: Date.now().toString(),
          type: "assistant",
          content: errText,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errMsg]);
        setLoadingState("idle");
        return data;
      }

      const newPlan = data.filesystem_plan as FilesystemPlan | undefined;
      setFilesystemPlan((prev) => {
        if (!newPlan || !newPlan.files || newPlan.files.length === 0) return prev;
        if (!prev) return newPlan;
        const existingPaths = new Set(prev.files.map((f) => f.path));
        const mergedFiles = [
          ...prev.files,
          ...newPlan.files.filter((f) => !existingPaths.has(f.path)),
        ];
        const mergedFolders = [...new Set([...prev.folders, ...(newPlan.folders || [])])];
        return { ...prev, files: mergedFiles, folders: mergedFolders, branch_name: newPlan.branch_name || prev.branch_name };
      });

      const fileCount = newPlan?.files?.length || 0;
      const explanation = data.explanation || data.message || "Translation applied.";
      const summary = fileCount > 0
        ? `${explanation}\n\n${fileCount} file(s) ready to commit to branch: ${newPlan?.branch_name || ""}`
        : explanation;

      const assistantMsg: ChatMessage = {
        id: Date.now().toString(),
        type: "assistant",
        content: summary,
        timestamp: new Date(),
        showDiff: true,
        filesystemPlan: newPlan,
        diff: data.diff || "",
        preview: data.preview || "",
        reasoning: data.reasoning || undefined,
      };
      setChatHistory((prev) => [...prev, assistantMsg]);
      setLoadingState("idle");
      return data;
    } catch (e) {
      const errMsg: ChatMessage = {
        id: Date.now().toString(),
        type: "assistant",
        content: `Translation failed: ${e instanceof Error ? e.message : "Network error"}`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, errMsg]);
      setLoadingState("idle");
      setError("Translation failed");
      return null;
    }
  }, [selectedGenomePath, modifiedContent, originalContent]);

  const generateTranslationRecipe = useCallback(async (sourceVendor: string, targetPlatform: string) => {
    // Gather chat context — extract user messages as context
    const chatContext = chatHistory
      .filter((m) => m.type === "user")
      .map((m) => m.content)
      .join("\n");

    const outputFiles = filesystemPlan?.files?.map((f) => ({ path: f.path, content: f.content })) || [];

    try {
      const res = await fetch(`${API}/generate-translation-recipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_content: originalContent || "",
          output_files: outputFiles,
          chat_context: chatContext,
          source_vendor: sourceVendor,
          target_platform: targetPlatform,
        }),
      });
      return await res.json();
    } catch {
      return { status: "error", error: "Failed to generate recipe" };
    }
  }, [chatHistory, filesystemPlan, originalContent]);

  const extractVideoGenome = useCallback(async (videoId: string, userNotes: string = "") => {
    setLoadingState("transforming");
    setSavedBranch(null);
    setError(null);
    try {
      const res = await fetch(`${API}/video-extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, user_notes: userNotes }),
      });
      const data = await res.json();

      if (data.status === "error") {
        let errText = `Video extraction failed: ${data.error || "Unknown error"}`;
        if (data.raw_response) errText += `\n\nLLM response:\n${data.raw_response.slice(0, 500)}`;
        setChatHistory(prev => [...prev, { id: Date.now().toString(), type: "assistant", content: errText, timestamp: new Date() }]);
        setLoadingState("idle");
        return data;
      }

      const newPlan = data.filesystem_plan as FilesystemPlan | undefined;
      setFilesystemPlan(prev => {
        if (!newPlan?.files?.length) return prev;
        if (!prev) return newPlan;
        const existingPaths = new Set(prev.files.map(f => f.path));
        return { ...prev, files: [...prev.files, ...newPlan.files.filter(f => !existingPaths.has(f.path))], folders: [...new Set([...prev.folders, ...(newPlan.folders || [])])], branch_name: newPlan.branch_name || prev.branch_name };
      });

      const fileCount = newPlan?.files?.length || 0;
      const msg = data.message || data.explanation || "Video genome extracted.";
      const summary = fileCount > 0 ? `${msg}\n\n${fileCount} file(s) ready to commit to branch: ${newPlan?.branch_name || ""}` : msg;

      setChatHistory(prev => [...prev, {
        id: Date.now().toString(), type: "assistant", content: summary, timestamp: new Date(),
        showDiff: true, filesystemPlan: newPlan, reasoning: data.reasoning || undefined,
      }]);
      setLoadingState("idle");
      return data;
    } catch (e) {
      setChatHistory(prev => [...prev, { id: Date.now().toString(), type: "assistant", content: `Video extraction failed: ${e instanceof Error ? e.message : "Network error"}`, timestamp: new Date() }]);
      setLoadingState("idle");
      return null;
    }
  }, []);

  const saveAsTranslation = useCallback(async (recipe: {
    name: string;
    description?: string;
    source_vendor?: string;
    source_type?: string;
    target_platform?: string;
    instructions: string;
    output_structure?: Record<string, any>;
  }) => {
    try {
      const res = await fetch(`${API}/save-translation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });
      const data = await res.json();
      // Refresh translations list after saving
      if (data.status === "ok") {
        fetchTranslations();
      }
      return data;
    } catch {
      return { status: "error", error: "Failed to save translation" };
    }
  }, [fetchTranslations]);

  return {
    selectedGenomePath,
    originalContent,
    modifiedContent,
    chatHistory,
    loadingState,
    error,
    fileTree,
    filesystemPlan,
    savedBranch,
    setSelectedGenomePath,
    listGenomes,
    loadGenome,
    chatWithGenome,
    transformGenome,
    saveFilesystemPlan,
    removeFileFromPlan,
    clearPlan,
    addUserMessage,
    triggerAction,
    translations,
    translationsLoading,
    fetchTranslations,
    runTranslation,
    extractVideoGenome,
    generateTranslationRecipe,
    saveAsTranslation,
  };
}
