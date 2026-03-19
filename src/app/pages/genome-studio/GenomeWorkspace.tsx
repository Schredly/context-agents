import { useState, useEffect } from 'react';
import { Save, GitBranch, CheckCircle2, Loader2, Folder, FileText, X, Trash2, Languages, Play, BookmarkPlus, Search, ChevronDown, ChevronRight } from 'lucide-react';
import type { FilesystemPlan, TranslationRecord } from '../../store/useGenomeStore';

type Tab = 'source' | 'transformed' | 'plan' | 'diff' | 'preview' | 'translations';

interface GenomeWorkspaceProps {
  originalContent?: string;
  selectedPath?: string | null;
  filesystemPlan?: FilesystemPlan | null;
  onSave?: () => Promise<any>;
  onRemoveFile?: (index: number) => void;
  onClearPlan?: () => void;
  isSaving?: boolean;
  savedBranch?: string | null;
  expanded?: boolean;
  translations?: TranslationRecord[];
  translationsLoading?: boolean;
  onFetchTranslations?: () => void;
  onRunTranslation?: (id: string) => Promise<any>;
  onSaveAsTranslation?: () => void;
  isTransforming?: boolean;
  repoConnected?: boolean;
}

export function GenomeWorkspace({ originalContent, selectedPath, filesystemPlan, onSave, onRemoveFile, onClearPlan, isSaving, savedBranch, expanded, translations, translationsLoading, onFetchTranslations, onRunTranslation, onSaveAsTranslation, isTransforming, repoConnected }: GenomeWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<Tab>('source');
  const [selectedTransformFile, setSelectedTransformFile] = useState<number | null>(null);
  const [selectedTranslationId, setSelectedTranslationId] = useState<string | null>(null);
  const [translationSearch, setTranslationSearch] = useState('');
  const [translationsFetched, setTranslationsFetched] = useState(false);
  const [runningTranslationId, setRunningTranslationId] = useState<string | null>(null);

  // Auto-switch to transformed tab when plan arrives
  useEffect(() => {
    if (filesystemPlan && filesystemPlan.files.length > 0) {
      setActiveTab('transformed');
      setSelectedTransformFile(0);
    }
  }, [filesystemPlan]);

  // Auto-switch to source when a file is selected
  useEffect(() => {
    if (originalContent && !filesystemPlan) {
      setActiveTab('source');
    }
  }, [originalContent]);

  // Clear running state when transform finishes
  useEffect(() => {
    if (!isTransforming) {
      setRunningTranslationId(null);
    }
  }, [isTransforming]);

  const transformedFiles = filesystemPlan?.files || [];
  const currentTransformFile = selectedTransformFile !== null ? transformedFiles[selectedTransformFile] : null;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'source', label: 'Source' },
    { id: 'translations', label: 'Translations', count: translationsFetched && translations?.length ? translations.length : undefined },
    { id: 'transformed', label: 'Transformed', count: transformedFiles.length || undefined },
    { id: 'plan', label: 'Plan', count: filesystemPlan ? transformedFiles.length : undefined },
    { id: 'diff', label: 'Diff' },
    { id: 'preview', label: 'Preview' },
  ];

  // Filter translations by search
  const filteredTranslations = translations?.filter((t) => {
    if (!translationSearch) return true;
    const q = translationSearch.toLowerCase();
    return t.name.toLowerCase().includes(q)
      || t.source_vendor.toLowerCase().includes(q)
      || t.target_platform.toLowerCase().includes(q)
      || t.description.toLowerCase().includes(q);
  }) || [];

  const selectedTranslation = translations?.find((t) => t.id === selectedTranslationId) || null;

  const handleLoadTranslations = () => {
    onFetchTranslations?.();
    setTranslationsFetched(true);
  };

  const handleRunTranslation = async (id: string) => {
    setRunningTranslationId(id);
    await onRunTranslation?.(id);
  };

  return (
    <div className="h-full bg-white flex flex-col">
      {/* Header with Tabs */}
      <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="flex gap-0.5">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'
              }`}>
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {savedBranch ? (
            <a href={`https://github.com/Schredly/oy_genome/tree/${savedBranch}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-green-700 bg-green-50 rounded-lg border border-green-200 hover:bg-green-100 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {savedBranch}
            </a>
          ) : filesystemPlan ? (
            <div className="flex gap-1.5">
              {onSaveAsTranslation && (
                <button onClick={onSaveAsTranslation}
                  className="px-2.5 py-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 flex items-center gap-1">
                  <BookmarkPlus className="w-3 h-3" />
                  Save as Translation
                </button>
              )}
              <button onClick={onClearPlan}
                className="px-2.5 py-1.5 text-xs text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                <Trash2 className="w-3 h-3" />
                Clear All
              </button>
              <button onClick={onSave} disabled={isSaving}
                className="px-3 py-1.5 text-xs bg-orange-400 text-white rounded-lg hover:bg-orange-700 flex items-center gap-1.5 disabled:opacity-50">
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {isSaving ? 'Committing...' : 'Commit Changes'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Translations tab */}
        {activeTab === 'translations' && (
          <div className="flex-1 overflow-hidden flex">
            {/* Left: Translation list / browser */}
            <div className={`${selectedTranslation ? 'w-72' : 'flex-1 max-w-2xl mx-auto'} border-r border-gray-100 flex flex-col overflow-hidden`}>
              {!translationsFetched ? (
                /* Initial state — not loaded yet */
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <Languages className="w-10 h-10 text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-700 mb-1">Translation Recipes</p>
                  <p className="text-xs text-gray-500 mb-4 max-w-xs">
                    Load available translations to browse and apply conversion recipes to your genome.
                  </p>
                  <button
                    onClick={handleLoadTranslations}
                    disabled={translationsLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {translationsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                    Load Translations
                  </button>
                </div>
              ) : (
                /* Loaded — show search + list */
                <>
                  <div className="p-3 border-b border-gray-100 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        value={translationSearch}
                        onChange={(e) => setTranslationSearch(e.target.value)}
                        placeholder="Search translations..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">{filteredTranslations.length} translation(s)</span>
                      <button onClick={handleLoadTranslations} className="text-[10px] text-orange-600 hover:text-orange-700">
                        Refresh
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {translationsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      </div>
                    ) : filteredTranslations.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <p className="text-xs">{translationSearch ? 'No matches' : 'No translations found'}</p>
                      </div>
                    ) : filteredTranslations.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTranslationId(selectedTranslationId === t.id ? null : t.id)}
                        className={`w-full text-left p-3 rounded-lg transition-all ${
                          selectedTranslationId === t.id
                            ? 'bg-orange-50 border border-orange-300 shadow-sm'
                            : 'bg-gray-50 border border-gray-200 hover:border-gray-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Languages className={`w-3.5 h-3.5 flex-shrink-0 ${selectedTranslationId === t.id ? 'text-orange-500' : 'text-gray-400'}`} />
                          <span className="text-xs font-medium text-gray-900 truncate">{t.name}</span>
                          <span className={`text-[9px] px-1 py-0.5 rounded ${
                            t.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                          }`}>{t.status}</span>
                        </div>
                        <div className="flex gap-2 mt-1.5 ml-5">
                          <span className="text-[9px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded">{t.source_vendor || '?'}</span>
                          <span className="text-[9px] text-gray-400">&rarr;</span>
                          <span className="text-[9px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded">{t.target_platform || '?'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {/* Save as Translation at bottom */}
                  {onSaveAsTranslation && (
                    <div className="p-3 border-t border-gray-100">
                      <button onClick={onSaveAsTranslation}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        Create New Translation
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right: Selected translation detail + Run */}
            {selectedTranslation && (
              <div className="flex-1 overflow-y-auto p-5">
                <div className="max-w-xl space-y-4">
                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Languages className="w-5 h-5 text-orange-500" />
                      <h3 className="text-base font-semibold text-gray-900">{selectedTranslation.name}</h3>
                    </div>
                    {selectedTranslation.description && (
                      <p className="text-sm text-gray-600 ml-7">{selectedTranslation.description}</p>
                    )}
                  </div>

                  {/* Meta badges */}
                  <div className="flex flex-wrap gap-2 ml-7">
                    <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      Source: {selectedTranslation.source_vendor}
                    </span>
                    {selectedTranslation.source_type && (
                      <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                        Type: {selectedTranslation.source_type}
                      </span>
                    )}
                    <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                      Target: {selectedTranslation.target_platform}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      selectedTranslation.status === 'active' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {selectedTranslation.status}
                    </span>
                  </div>

                  {/* Instructions preview */}
                  {selectedTranslation.instructions && (
                    <div className="ml-7">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Instructions</p>
                      <pre className="text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                        {selectedTranslation.instructions}
                      </pre>
                    </div>
                  )}

                  {/* Run button */}
                  <div className="ml-7 pt-2">
                    {!repoConnected ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                        Connect a GitHub repository first (right sidebar) to run this translation.
                      </div>
                    ) : (
                      <button
                        onClick={() => handleRunTranslation(selectedTranslation.id)}
                        disabled={isTransforming}
                        className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors text-sm font-medium"
                      >
                        {runningTranslationId === selectedTranslation.id ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Running Translation...</>
                        ) : isTransforming ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                        ) : (
                          <><Play className="w-4 h-4" /> Run Translation</>
                        )}
                      </button>
                    )}
                    {originalContent ? (
                      <p className="text-[10px] text-gray-400 mt-2">
                        Will apply recipe to the loaded repository content.
                      </p>
                    ) : (
                      <p className="text-[10px] text-amber-600 mt-2">
                        Tip: Select a genome file for more targeted results, or run against the full repo.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Source tab */}
        {activeTab === 'source' && (
          <div className="flex-1 overflow-auto">
            {originalContent ? (
              <div className="p-4">
                {selectedPath && (
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs font-mono text-gray-500">{selectedPath}</span>
                  </div>
                )}
                <pre className="text-[13px] font-mono text-gray-800 leading-relaxed whitespace-pre-wrap">{originalContent}</pre>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p className="text-sm">Select a file from the repository to view its content.</p>
              </div>
            )}
          </div>
        )}

        {/* Transformed tab — file list + content viewer */}
        {activeTab === 'transformed' && (
          <>
            {transformedFiles.length > 0 ? (
              <>
                {/* File list sidebar */}
                <div className="w-52 border-r border-gray-200 bg-gray-50 overflow-y-auto flex-shrink-0">
                  <div className="p-2 space-y-0.5">
                    {transformedFiles.map((file, i) => (
                      <div key={i} className={`group flex items-center gap-1 px-2.5 py-2 rounded-lg transition-colors ${
                        selectedTransformFile === i ? 'bg-white shadow-sm border border-gray-200' : 'hover:bg-white/60'
                      }`}>
                        <button onClick={() => setSelectedTransformFile(i)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                          <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${selectedTransformFile === i ? 'text-green-500' : 'text-gray-400'}`} />
                          <span className="text-xs font-mono text-gray-700 truncate">{file.path.split('/').pop()}</span>
                        </button>
                        {onRemoveFile && (
                          <button onClick={() => { onRemoveFile(i); if (selectedTransformFile === i) setSelectedTransformFile(null); }}
                            className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" title="Remove file">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {/* File content */}
                <div className="flex-1 overflow-auto p-4">
                  {currentTransformFile ? (
                    <>
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                        <FileText className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-xs font-mono text-gray-500">{currentTransformFile.path}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">{currentTransformFile.content.length} chars</span>
                      </div>
                      <pre className="text-[13px] font-mono text-gray-800 leading-relaxed whitespace-pre-wrap">{currentTransformFile.content}</pre>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-8">Select a transformed file to view.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <p className="text-sm">No transformed files yet. Use the chat to transform your genome.</p>
              </div>
            )}
          </>
        )}

        {/* Plan tab */}
        {activeTab === 'plan' && (
          <div className="flex-1 overflow-auto p-4">
            {filesystemPlan ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <GitBranch className="w-4 h-4 text-orange-600" />
                  <span className="text-xs font-medium text-gray-900">Branch:</span>
                  <span className="text-xs font-mono text-orange-700 bg-orange-50 px-2 py-0.5 rounded">{filesystemPlan.branch_name}</span>
                </div>
                <p className="text-[10px] text-gray-500 font-mono">{filesystemPlan.base_path}/</p>
                {filesystemPlan.folders.map((folder, i) => (
                  <div key={i} className="flex items-center gap-2 pl-4">
                    <Folder className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-xs font-mono text-gray-700">{folder}/</span>
                  </div>
                ))}
                {transformedFiles.map((file, i) => (
                  <div key={i} className="pl-4 border-l-2 border-green-200 ml-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-xs font-mono text-gray-900">{file.path}</span>
                      <span className="text-[10px] text-gray-400">{file.content.length} chars</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p className="text-sm">No filesystem plan yet. Ask the AI to transform your genome.</p>
              </div>
            )}
          </div>
        )}

        {/* Diff tab */}
        {activeTab === 'diff' && (
          <div className="flex-1 overflow-auto p-4 bg-gray-50 font-mono text-[13px]">
            {transformedFiles.length > 0 ? (
              <div className="space-y-0.5">
                {transformedFiles.map((file, i) => (
                  <div key={i} className="text-green-700 bg-green-50 px-2 py-0.5 rounded">+ {file.path}</div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 font-sans">
                <p className="text-sm">No changes to diff.</p>
              </div>
            )}
          </div>
        )}

        {/* Preview tab */}
        {activeTab === 'preview' && (
          <div className="flex-1 overflow-auto p-4">
            {filesystemPlan ? (
              <div className="space-y-3 max-w-3xl">
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-900">
                  <strong>Plan:</strong> {transformedFiles.length} file(s) on branch <strong>{filesystemPlan.branch_name}</strong>
                </div>
                {transformedFiles.map((file, i) => (
                  <div key={i} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-[10px] font-mono text-gray-500 mb-1.5">{file.path}</p>
                    <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap max-h-40 overflow-auto">{file.content.slice(0, 500)}{file.content.length > 500 ? '\n...' : ''}</pre>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p className="text-sm">Nothing to preview.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
