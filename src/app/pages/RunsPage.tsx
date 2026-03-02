import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, ChevronDown, ChevronRight, ExternalLink, Plus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTenants } from '../context/TenantContext';
import { useGoogleAuth } from '../auth/GoogleAuthContext';
import * as api from '../services/api';

// --- Types for local state ---

interface SkillState {
  skill_id: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  summary: string;
  events: api.AgentEventResponse[];
}

const SKILL_ORDER = ['ValidateInput', 'RetrieveDocs', 'SynthesizeResolution', 'RecordOutcome', 'Writeback'];

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

// --- Component ---

export function RunsPage() {
  const { currentTenantId, currentTenant } = useTenants();
  const { isAuthenticated, accessToken } = useGoogleAuth();

  const [runs, setRuns] = useState<api.AgentRunResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  // Events streamed via WebSocket
  const [events, setEvents] = useState<api.AgentEventResponse[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Feedback state
  const [fbOutcome, setFbOutcome] = useState<'success' | 'fail' | null>(null);
  const [fbReason, setFbReason] = useState<string>('resolved');
  const [fbNotes, setFbNotes] = useState('');
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbRecorded, setFbRecorded] = useState(false);

  // Metrics state
  const [metrics, setMetrics] = useState<api.MetricsResponse | null>(null);

  // New Run dialog
  const [showNewRun, setShowNewRun] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Fetch runs when tenant changes
  const fetchRuns = useCallback(async () => {
    if (!currentTenantId) { setRuns([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await api.getRuns(currentTenantId);
      setRuns(data);
    } catch {
      toast.error('Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Fetch metrics when tenant changes
  useEffect(() => {
    if (!currentTenantId) { setMetrics(null); return; }
    api.getMetrics(currentTenantId).then(setMetrics).catch(() => setMetrics(null));
  }, [currentTenantId]);

  // Load existing feedback when selecting a completed run
  useEffect(() => {
    setFbOutcome(null);
    setFbReason('resolved');
    setFbNotes('');
    setFbRecorded(false);
    if (!selectedRunId || !currentTenantId) return;
    const run = runs.find(r => r.run_id === selectedRunId);
    if (run?.status !== 'completed') return;
    api.getFeedback(selectedRunId, currentTenantId).then(fb => {
      if (fb) {
        setFbOutcome(fb.outcome);
        setFbReason(fb.reason);
        setFbNotes(fb.notes);
        setFbRecorded(true);
      }
    }).catch(() => {});
  }, [selectedRunId, currentTenantId, runs]);

  // Connect WebSocket when selecting a run
  useEffect(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (!selectedRunId || !currentTenantId) { setEvents([]); return; }

    // Connect WS which will replay existing events + stream live ones
    const ws = api.connectRunEvents(
      selectedRunId,
      currentTenantId,
      (event) => setEvents(prev => [...prev, event]),
      (_status) => {
        // Refresh the run to get final result
        if (currentTenantId && selectedRunId) {
          api.getRun(currentTenantId, selectedRunId).then(updated => {
            setRuns(prev => prev.map(r => r.run_id === updated.run_id ? updated : r));
          }).catch(() => {});
        }
      },
    );
    wsRef.current = ws;
    setEvents([]);

    return () => { ws.close(); };
  }, [selectedRunId, currentTenantId]);

  const selectedRun = runs.find(r => r.run_id === selectedRunId) ?? null;
  const skills = buildSkills(events);

  const toggleSkill = (skillId: string) => {
    setExpandedSkills(prev => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId); else next.add(skillId);
      return next;
    });
  };

  const handleCreateRun = async () => {
    if (!currentTenantId || !accessToken || !newTitle.trim()) return;
    setCreating(true);
    try {
      const workObject: api.WorkObject = {
        work_id: `WO-${Date.now()}`,
        source_system: 'ui',
        record_type: 'incident',
        title: newTitle.trim(),
        description: newDescription.trim(),
        classification: [],
      };
      const { run_id } = await api.createRun(currentTenantId, accessToken, workObject);
      setShowNewRun(false);
      setNewTitle('');
      setNewDescription('');
      toast.success('Run created');
      // Refresh and select
      await fetchRuns();
      setSelectedRunId(run_id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create run');
    } finally {
      setCreating(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!currentTenantId || !selectedRunId || !fbOutcome) return;
    setFbSubmitting(true);
    try {
      await api.submitFeedback(currentTenantId, selectedRunId, fbOutcome, fbReason, fbNotes);
      setFbRecorded(true);
      toast.success('Feedback recorded');
      // Refresh metrics
      api.getMetrics(currentTenantId).then(setMetrics).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setFbSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'running': return 'bg-blue-500 animate-pulse';
      case 'queued': return 'bg-yellow-400 animate-pulse';
      case 'failed': case 'error': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'running': return 'Running';
      case 'queued': return 'Queued';
      case 'failed': return 'Failed';
      case 'error': return 'Error';
      default: return 'Pending';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'queued': return 'bg-yellow-100 text-yellow-800';
      case 'failed': case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex h-full">
      {/* Left Column - Runs List */}
      <div className="w-80 border-r border-border bg-white overflow-auto flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg">Runs</h2>
            <button
              onClick={() => setShowNewRun(true)}
              disabled={!isAuthenticated || !currentTenantId}
              title={!isAuthenticated ? 'Sign in with Google first' : !currentTenantId ? 'Select a tenant first' : 'New Run'}
              className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            {currentTenant ? currentTenant.name : 'No tenant selected'}
            {' '}&middot; {runs.length} run{runs.length !== 1 ? 's' : ''}
          </p>
          {!isAuthenticated && (
            <p className="text-xs text-yellow-700 mt-1">Sign in with Google to create runs</p>
          )}
        </div>

        {/* Metrics Summary */}
        {metrics && (
          <div className="px-4 py-3 border-b border-border">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 rounded p-2">
                <div className="text-muted-foreground">Success Rate</div>
                <div className="text-sm font-medium">
                  {metrics.success_rate != null ? `${Math.round(metrics.success_rate * 100)}%` : '—'}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <div className="text-muted-foreground">Avg Confidence</div>
                <div className="text-sm font-medium">
                  {metrics.avg_confidence != null ? `${Math.round(metrics.avg_confidence * 100)}%` : '—'}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <div className="text-muted-foreground">Doc Hit Rate</div>
                <div className="text-sm font-medium">
                  {metrics.doc_hit_rate != null ? `${Math.round(metrics.doc_hit_rate * 100)}%` : '—'}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <div className="text-muted-foreground">Total Runs</div>
                <div className="text-sm font-medium">{metrics.total_runs}</div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-sm text-muted-foreground text-center">
              No runs yet.{' '}
              {isAuthenticated && currentTenantId
                ? 'Click + to create one.'
                : 'Select a tenant and sign in to start.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border overflow-auto">
            {runs.map((run) => (
              <button
                key={run.run_id}
                onClick={() => setSelectedRunId(run.run_id)}
                className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                  selectedRunId === run.run_id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono truncate mr-2">{run.run_id}</span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(run.status)}`} />
                </div>
                <div className="text-sm truncate">{run.work_object.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(run.started_at), 'MMM d, h:mm a')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right Column - Run Detail */}
      <div className="flex-1 overflow-auto">
        {/* New Run Form */}
        {showNewRun && (
          <div className="p-8 max-w-2xl">
            <h2 className="text-xl mb-4">New Run</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g., VPN connection issue"
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Description</label>
                <textarea
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Describe the issue..."
                  rows={4}
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateRun}
                  disabled={creating || !newTitle.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {creating ? 'Creating...' : 'Start Run'}
                </button>
                <button
                  onClick={() => { setShowNewRun(false); setNewTitle(''); setNewDescription(''); }}
                  className="px-4 py-2 border border-border rounded-md hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Run Detail */}
        {!showNewRun && selectedRun ? (
          <div className="p-8 max-w-4xl">
            {/* Run Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl">{selectedRun.work_object.title}</h1>
                <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(selectedRun.status)}`}>
                  {getStatusText(selectedRun.status)}
                </span>
              </div>
              <p className="text-xs font-mono text-muted-foreground mb-1">{selectedRun.run_id}</p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(selectedRun.started_at), 'MMMM d, yyyy at h:mm:ss a')}
              </p>
              {selectedRun.work_object.description && (
                <p className="text-sm text-muted-foreground mt-2">{selectedRun.work_object.description}</p>
              )}
            </div>

            {/* Skills Timeline */}
            <div className="mb-8">
              <h2 className="text-lg mb-4">Skills Timeline</h2>
              <div className="space-y-3">
                {skills.map((skill) => (
                  <div key={skill.skill_id} className="border border-border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSkill(skill.skill_id)}
                      className="w-full p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${getStatusColor(skill.status)}`} />
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm">{skill.skill_id}</span>
                          {skill.status === 'running' && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                          {expandedSkills.has(skill.skill_id)
                            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          }
                        </div>
                        <p className="text-sm text-muted-foreground">{skill.summary || 'Waiting...'}</p>
                      </div>
                    </button>

                    {expandedSkills.has(skill.skill_id) && skill.events.length > 0 && (
                      <div className="px-4 pb-4 pl-9 bg-gray-50">
                        <div className="text-xs text-muted-foreground mb-2">Events:</div>
                        <ul className="space-y-1">
                          {skill.events.map((ev, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex">
                              <span className={`mr-2 text-xs font-mono shrink-0 w-20 ${
                                ev.event_type === 'complete' ? 'text-green-600'
                                : ev.event_type === 'error' ? 'text-red-600'
                                : 'text-gray-400'
                              }`}>{ev.event_type}</span>
                              <span>{ev.summary}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Result Panel */}
            {selectedRun.status === 'completed' && selectedRun.result && (
              <div className="border border-border rounded-lg p-6 bg-white">
                <h2 className="text-lg mb-4">Result</h2>

                {/* Summary */}
                <div className="mb-6">
                  <div className="text-sm text-muted-foreground mb-2">Summary</div>
                  <p className="text-sm leading-relaxed">{selectedRun.result.summary}</p>
                </div>

                {/* Steps */}
                {selectedRun.result.steps.length > 0 && (
                  <div className="mb-6">
                    <div className="text-sm text-muted-foreground mb-2">Recommended Steps</div>
                    <ul className="space-y-2">
                      {selectedRun.result.steps.map((step, index) => (
                        <li key={index} className="text-sm flex">
                          <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Sources */}
                {selectedRun.result.sources.length > 0 && (
                  <div className="mb-6">
                    <div className="text-sm text-muted-foreground mb-2">Sources</div>
                    <div className="space-y-2">
                      {selectedRun.result.sources.map((source, index) => (
                        <a
                          key={index}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <span>{source.title}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confidence Score */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">Confidence Score</div>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: `${selectedRun.result.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-sm">{Math.round(selectedRun.result.confidence * 100)}%</span>
                  </div>
                </div>

                {/* Run ID */}
                <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
                  <div className="text-sm text-muted-foreground">Run ID</div>
                  <div className="text-sm font-mono">{selectedRun.run_id}</div>
                </div>
              </div>
            )}

            {/* Feedback Form */}
            {selectedRun.status === 'completed' && (
              <div className="border border-border rounded-lg p-6 bg-white mt-6">
                <h2 className="text-lg mb-4">
                  {fbRecorded ? (
                    <span className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Feedback Recorded
                    </span>
                  ) : 'Rate this Result'}
                </h2>

                <div className="space-y-4">
                  {/* Outcome toggle */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setFbOutcome('success'); setFbRecorded(false); }}
                      className={`px-4 py-2 rounded-md text-sm border transition-colors ${
                        fbOutcome === 'success'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-border hover:bg-gray-50'
                      }`}
                    >
                      Success
                    </button>
                    <button
                      onClick={() => { setFbOutcome('fail'); setFbRecorded(false); }}
                      className={`px-4 py-2 rounded-md text-sm border transition-colors ${
                        fbOutcome === 'fail'
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-border hover:bg-gray-50'
                      }`}
                    >
                      Fail
                    </button>
                  </div>

                  {/* Reason select */}
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">Reason</label>
                    <select
                      value={fbReason}
                      onChange={e => { setFbReason(e.target.value); setFbRecorded(false); }}
                      className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="resolved">Resolved</option>
                      <option value="partial">Partial</option>
                      <option value="wrong-doc">Wrong Document</option>
                      <option value="missing-context">Missing Context</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">Notes (optional)</label>
                    <textarea
                      value={fbNotes}
                      onChange={e => { setFbNotes(e.target.value); setFbRecorded(false); }}
                      rows={2}
                      placeholder="Any additional comments..."
                      className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleSubmitFeedback}
                    disabled={!fbOutcome || fbSubmitting}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                  >
                    {fbSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {fbRecorded ? 'Resubmit' : 'Submit Feedback'}
                  </button>
                </div>
              </div>
            )}

            {(selectedRun.status === 'running' || selectedRun.status === 'queued') && (
              <div className="border border-border rounded-lg p-6 bg-blue-50">
                <p className="text-sm text-blue-900 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  This run is in progress. Events will stream live below the timeline.
                </p>
              </div>
            )}

            {selectedRun.status === 'failed' && (
              <div className="border border-border rounded-lg p-6 bg-red-50">
                <p className="text-sm text-red-900">
                  This run failed. Check the skill timeline above for error details.
                </p>
              </div>
            )}
          </div>
        ) : !showNewRun ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a run to view details</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
