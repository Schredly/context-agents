import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';
import * as api from '../services/api';

// --- Query param parsing ---

function useQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    tenant_id: params.get('tenant_id') ?? '',
    tenant_secret: params.get('tenant_secret') ?? '',
    sys_id: params.get('sys_id') ?? '',
    number: params.get('number') ?? '',
    short_description: params.get('short_description') ?? '',
    description: params.get('description') ?? '',
    category: params.get('category') ?? '',
    subcategory: params.get('subcategory') ?? '',
    business_service: params.get('business_service') ?? '',
    work_notes: params.get('work_notes') ?? '',
  };
}

function getMissingParams(p: ReturnType<typeof useQueryParams>): string[] {
  const missing: string[] = [];
  if (!p.tenant_id) missing.push('tenant_id');
  if (!p.tenant_secret) missing.push('tenant_secret');
  if (!p.sys_id) missing.push('sys_id');
  if (!p.number) missing.push('number');
  if (!p.short_description) missing.push('short_description');
  return missing;
}

// --- Types ---

type PageStatus = 'ready' | 'running' | 'resolution_ready' | 'writeback_failed' | 'updated' | 'error';

interface SkillState {
  skill_id: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  summary: string;
  events: api.AgentEventResponse[];
}

const SKILL_ORDER = ['ValidateInput', 'RetrieveDocs', 'SynthesizeResolution', 'RecordOutcome'];

const TERMINAL_STATUSES = ['completed', 'fallback_completed'];

function buildSkills(events: api.AgentEventResponse[]): SkillState[] {
  const map = new Map<string, SkillState>();
  for (const id of SKILL_ORDER) {
    map.set(id, { skill_id: id, status: 'pending', summary: '', events: [] });
  }
  for (const ev of events) {
    let skill = map.get(ev.skill_id);
    if (!skill) {
      skill = { skill_id: ev.skill_id, status: 'pending', summary: '', events: [] };
      map.set(ev.skill_id, skill);
    }
    skill.events.push(ev);
    skill.summary = ev.summary;
    if (ev.event_type === 'complete') {
      skill.status = 'completed';
    } else if (ev.event_type === 'error') {
      skill.status = 'error';
    } else if (skill.status === 'pending') {
      skill.status = 'running';
    }
  }
  return Array.from(map.values());
}

// --- Compact Skill Trace ---

function SkillTrace({ events }: { events: api.AgentEventResponse[] }) {
  if (events.length === 0) return null;

  const thinking = events.find(e => e.event_type === 'thinking');
  const toolCall = events.find(e => e.event_type === 'tool_call');
  const toolResult = events.find(e => e.event_type === 'tool_result');
  const errorEv = events.find(e => e.event_type === 'error');
  const completeEv = events.find(e => e.event_type === 'complete');

  let durationMs: number | null = null;
  if (events.length >= 2) {
    const first = new Date(events[0].timestamp).getTime();
    const last = new Date(events[events.length - 1].timestamp).getTime();
    const diff = last - first;
    if (!isNaN(diff) && diff > 0) durationMs = diff;
  }

  const m = (obj: Record<string, unknown> | null | undefined, key: string): string | undefined => {
    const v = obj?.[key];
    return v != null ? String(v) : undefined;
  };

  const tcMeta = toolCall?.metadata;
  const trMeta = toolResult?.metadata;
  const cMeta = completeEv?.metadata;

  return (
    <div className="space-y-1.5">
      {thinking && (
        <div>
          <div className="text-[11px] font-medium text-gray-400 mb-0.5">Intent</div>
          <p className="text-xs text-gray-500">{thinking.summary}</p>
        </div>
      )}
      {toolCall && (
        <div className="rounded bg-gray-50 border border-gray-200 p-2">
          <div className="text-[11px] font-medium text-gray-400 mb-0.5">Tool Call</div>
          <p className="text-xs text-gray-600">{toolCall.summary}</p>
          {tcMeta && (
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
              {m(tcMeta, 'model') && <span className="text-[10px] text-gray-400">{m(tcMeta, 'model')}</span>}
              {m(tcMeta, 'latency_ms') && <span className="text-[10px] text-gray-400">{m(tcMeta, 'latency_ms')}ms</span>}
            </div>
          )}
        </div>
      )}
      {toolResult && (
        <div>
          <div className="text-[11px] font-medium text-gray-400 mb-0.5">Result</div>
          <p className="text-xs text-gray-600">{toolResult.summary}</p>
          {(toolResult.confidence != null || m(trMeta, 'doc_count') || m(trMeta, 'latency_ms')) && (
            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
              {toolResult.confidence != null && <span className="text-[10px] text-gray-400">Confidence: {Math.round(toolResult.confidence * 100)}%</span>}
              {m(trMeta, 'doc_count') && <span className="text-[10px] text-gray-400">Docs: {m(trMeta, 'doc_count')}</span>}
              {m(trMeta, 'latency_ms') && <span className="text-[10px] text-gray-400">{m(trMeta, 'latency_ms')}ms</span>}
            </div>
          )}
        </div>
      )}
      {errorEv && (
        <div className="rounded bg-red-50 border border-red-200 p-2">
          <div className="text-[11px] font-medium text-red-400 mb-0.5">Error</div>
          <p className="text-xs text-red-600">{errorEv.summary}</p>
        </div>
      )}
      {completeEv && (
        <div className="flex items-center gap-2">
          {cMeta?.fallback === true && <span className="text-[10px] text-amber-600">Fallback used</span>}
          {durationMs != null && <span className="text-[10px] text-gray-400">Completed in {durationMs}ms</span>}
        </div>
      )}
    </div>
  );
}

// --- Status helpers ---

function statusPill(status: PageStatus) {
  switch (status) {
    case 'ready':
      return { label: 'Ready', cls: 'bg-gray-100 text-gray-600 border-gray-200' };
    case 'running':
      return { label: 'Running', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'resolution_ready':
      return { label: 'Resolution Ready', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'writeback_failed':
      return { label: 'Writeback Failed', cls: 'bg-red-50 text-red-700 border-red-200' };
    case 'updated':
      return { label: 'Updated', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'error':
      return { label: 'Error', cls: 'bg-red-50 text-red-700 border-red-200' };
  }
}

function getSkillStatusColor(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-500';
    case 'running': return 'bg-blue-500 animate-pulse';
    case 'error': return 'bg-red-500';
    default: return 'bg-gray-300';
  }
}

// --- Component ---

export function WorkerServiceNowPage() {
  const params = useQueryParams();
  const missing = getMissingParams(params);

  const [pageStatus, setPageStatus] = useState<PageStatus>('ready');
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<api.AgentRunResponse | null>(null);
  const [events, setEvents] = useState<api.AgentEventResponse[]>([]);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [extraContext, setExtraContext] = useState('');
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Build classification from query params
  const classification: { name: string; value: string }[] = [];
  if (params.category) classification.push({ name: 'Category', value: params.category });
  if (params.subcategory) classification.push({ name: 'Subcategory', value: params.subcategory });
  if (params.business_service) classification.push({ name: 'Service', value: params.business_service });

  // Connect WebSocket when runId is set
  useEffect(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (!runId || !params.tenant_id) return;

    const ws = api.connectRunEvents(
      runId,
      params.tenant_id,
      (event) => setEvents(prev => [...prev, event]),
      (_status) => {
        // Refresh run to get final result
        api.getRun(params.tenant_id, runId).then(updated => {
          setRun(updated);
          if (TERMINAL_STATUSES.includes(updated.status)) {
            setPageStatus('resolution_ready');
          } else if (updated.status === 'failed') {
            setPageStatus('error');
          }
        }).catch(() => {});
      },
    );
    wsRef.current = ws;

    return () => { ws.close(); };
  }, [runId, params.tenant_id]);

  const handleRun = async () => {
    if (missing.length > 0) return;
    setCreating(true);
    setPageStatus('running');
    setEvents([]);
    setRun(null);
    setExpandedSkills(new Set());

    try {
      const description = extraContext.trim()
        ? `${params.description}\n\n--- Extra Context ---\n${extraContext.trim()}`
        : params.description;

      const body: api.ServiceNowPreviewRequest = {
        tenant_id: params.tenant_id,
        tenant_secret: params.tenant_secret,
        sys_id: params.sys_id,
        number: params.number,
        short_description: params.short_description,
        description,
        classification,
        metadata: {
          ...(params.business_service ? { business_service: params.business_service } : {}),
          ...(extraContext.trim() ? { ui_extra_context: extraContext.trim() } : {}),
        },
      };

      const { run_id } = await api.createRunFromServiceNowPreview(body);
      setRunId(run_id);
    } catch (err) {
      setPageStatus('error');
      toast.error(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setCreating(false);
    }
  };

  const handleApproveWriteback = async () => {
    if (!runId) return;
    setApproving(true);

    try {
      await api.approveRunWriteback(
        runId,
        params.tenant_id,
        params.tenant_secret,
        params.sys_id,
      );
      setPageStatus('updated');
      toast.success('Work notes updated in ServiceNow');
    } catch (err) {
      setPageStatus('writeback_failed');
      toast.error(err instanceof Error ? err.message : 'Writeback failed');
    } finally {
      setApproving(false);
    }
  };

  const skills = buildSkills(events);
  const pill = statusPill(pageStatus);
  const hasFallback = events.some(e => e.metadata?.fallback === true);
  const isTerminal = run != null && TERMINAL_STATUSES.includes(run.status);
  const canWriteback = isTerminal && run?.result != null && pageStatus !== 'updated';

  const toggleSkill = (skillId: string) => {
    setExpandedSkills(prev => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId); else next.add(skillId);
      return next;
    });
  };

  // --- Missing params error ---
  if (missing.length > 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Toaster />
        <div className="w-full max-w-md bg-white rounded-lg border border-red-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <h1 className="text-base font-semibold text-red-700">Missing Required Parameters</h1>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            This page must be opened from a ServiceNow UI Action with the following query parameters:
          </p>
          <ul className="space-y-1">
            {missing.map(p => (
              <li key={p} className="text-sm font-mono text-red-600 bg-red-50 px-2 py-1 rounded">{p}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <div className="max-w-[520px] mx-auto py-4 px-4">

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-base font-semibold text-gray-900">AI Resolution Assistant</h1>
            <span className={`inline-flex items-center text-xs font-medium border rounded-full px-2.5 py-0.5 ${pill.cls}`}>
              {pill.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 font-mono">{params.number} &middot; {params.sys_id}</p>
        </div>

        {/* Section A — Incident Summary */}
        <details className="mb-3 border border-gray-200 rounded-lg overflow-hidden bg-white">
          <summary className="px-3 py-2.5 text-sm font-medium cursor-pointer hover:bg-gray-50 transition-colors select-none flex items-center gap-2">
            <ChevronRight className="w-3.5 h-3.5 text-gray-400 details-open-rotate" />
            Incident Summary
          </summary>
          <div className="px-3 pb-3 pt-1 border-t border-gray-100">
            <p className="text-sm text-gray-700 mb-2">{params.short_description}</p>
            {classification.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {classification.map((c, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600 border border-gray-200">
                    {c.name}: {c.value}
                  </span>
                ))}
              </div>
            )}
            {params.description && (
              <p className="text-xs text-gray-500 leading-relaxed mb-2">{params.description}</p>
            )}
            {params.work_notes && (
              <div className="bg-gray-50 rounded p-2 border border-gray-100">
                <div className="text-[11px] font-medium text-gray-400 mb-0.5">Recent Work Notes</div>
                <p className="text-xs text-gray-500 line-clamp-3">{params.work_notes}</p>
              </div>
            )}
          </div>
        </details>

        {/* Section B — Extra context */}
        {pageStatus === 'ready' && (
          <div className="mb-3">
            <textarea
              value={extraContext}
              onChange={e => setExtraContext(e.target.value)}
              placeholder="Add extra context (optional)..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
            />
          </div>
        )}

        {/* Section C — Run button */}
        {(pageStatus === 'ready' || pageStatus === 'error') && (
          <div className="mb-4">
            <button
              onClick={handleRun}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm font-medium disabled:opacity-60"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                'Run'
              )}
            </button>
          </div>
        )}

        {/* Section D — Skills Timeline */}
        {events.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-400 mb-2">Skills</div>
            <div className="space-y-1.5">
              {skills.map((skill) => {
                const isActive = skill.status === 'running';
                return (
                  <div
                    key={skill.skill_id}
                    className={`border rounded-lg overflow-hidden bg-white transition-shadow ${
                      isActive
                        ? 'border-l-[3px] border-l-blue-500 border-t-gray-200 border-r-gray-200 border-b-gray-200 shadow-sm'
                        : 'border-gray-200'
                    }`}
                  >
                    <button
                      onClick={() => toggleSkill(skill.skill_id)}
                      className={`w-full px-3 py-2.5 flex items-start gap-2.5 transition-colors ${
                        isActive ? 'bg-blue-50/40' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${getSkillStatusColor(skill.status)}`} />
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`text-xs ${isActive ? 'font-medium' : ''}`}>{skill.skill_id}</span>
                          <div className="flex items-center gap-1">
                            {isActive && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                            {expandedSkills.has(skill.skill_id)
                              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                              : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            }
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{skill.summary || 'Waiting...'}</p>
                      </div>
                    </button>

                    {expandedSkills.has(skill.skill_id) && skill.events.length > 0 && (
                      <div className="px-3 pb-2.5 pl-7 bg-gray-50 border-t border-gray-100">
                        <div className="pt-1.5">
                          <SkillTrace events={skill.events} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Running indicator */}
        {pageStatus === 'running' && !creating && (
          <div className="mb-4 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Processing...
          </div>
        )}

        {/* Section E — Result */}
        {isTerminal && run?.result && (
          <div className="mb-4 border border-gray-200 rounded-lg bg-white p-4">
            <div className="mb-1">
              <h2 className="text-sm font-semibold text-gray-900">Recommended Resolution</h2>
              {run.result.sources.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Based on {run.result.sources.length} knowledge source{run.result.sources.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {hasFallback && (
              <div className="mt-2 mb-3 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Fallback synthesis used — Claude was unavailable
              </div>
            )}

            {/* Summary */}
            <p className="text-sm text-gray-500 leading-relaxed mt-3 mb-4">{run.result.summary}</p>

            {/* Confidence */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <span className="text-xs text-gray-400">Confidence</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${run.result.confidence * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-600">{Math.round(run.result.confidence * 100)}%</span>
              </div>
            </div>

            {/* Steps */}
            {run.result.steps.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-600 mb-1.5">Resolution Steps</div>
                <ol className="space-y-0.5">
                  {run.result.steps.map((step, i) => (
                    <li key={i} className="flex gap-2 py-1.5 px-2 rounded hover:bg-gray-50 transition-colors">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-medium mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-xs text-gray-600 flex-1">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Sources */}
            {run.result.sources.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 mb-1.5">Knowledge Sources</div>
                <div className="space-y-0.5">
                  {run.result.sources.map((source, i) => (
                    <a
                      key={i}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 transition-colors group"
                    >
                      <span className="text-xs text-gray-500 group-hover:text-gray-800 transition-colors truncate mr-2">{source.title}</span>
                      <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-blue-500 transition-colors shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Run ID */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Run ID</span>
              <span className="text-[11px] font-mono text-gray-400">{run.run_id}</span>
            </div>
          </div>
        )}

        {/* Run failed */}
        {run?.status === 'failed' && (
          <div className="mb-4 border border-red-200 rounded-lg bg-red-50 px-3 py-2.5">
            <p className="text-xs text-red-700">Run failed. Check the skill trace above for details.</p>
          </div>
        )}

        {/* Section F — Writeback approval */}
        {canWriteback && (
          <div className="mb-4">
            <button
              onClick={handleApproveWriteback}
              disabled={approving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 active:bg-emerald-900 transition-colors text-sm font-medium disabled:opacity-60"
            >
              {approving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Update Task
                </>
              )}
            </button>
          </div>
        )}

        {/* Updated confirmation */}
        {pageStatus === 'updated' && (
          <div className="mb-4 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <CheckCircle className="w-3.5 h-3.5" />
            Work notes updated in ServiceNow
          </div>
        )}

        {/* Writeback failed banner */}
        {pageStatus === 'writeback_failed' && (
          <div className="mb-4 flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Writeback failed. You can retry by clicking "Update Task" again.
          </div>
        )}

      </div>
    </div>
  );
}
