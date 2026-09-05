import { useEffect, useState } from 'react';
import { ShieldAlert, MessageSquare, ArrowRight } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadingState, ErrorState } from '../components/States';

export default function TrustCases() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [newNote, setNewNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const loadCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/trust-cases');
      setCases(res.data.cases);
    } catch (err: any) {
      setError(err?.message || 'Failed to load trust cases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCases();
  }, []);

  const handleUpdateCase = async (caseId: string, patch: any) => {
    try {
      await api.patch(`/admin/trust-cases/${caseId}`, patch);
      void loadCases();
      if (selectedCase?.id === caseId) {
        setSelectedCase((prev: any) => ({ ...prev, ...patch }));
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to update case.');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !newNote.trim()) return;
    setSubmittingNote(true);
    try {
      await api.patch(`/admin/trust-cases/${selectedCase.id}`, { note: newNote.trim() });
      setNewNote('');
      void loadCases();
    } catch (err: any) {
      alert(err?.message || 'Failed to add note');
    } finally {
      setSubmittingNote(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Trust & Safety Cases"
        title="Incident Triage & Moderation Cases"
        description="Structured escalation workflow for user reports, harassment investigations, and moderation cases with durable audit logs."
      />

      {loading ? (
        <LoadingState label="Loading incident cases…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadCases} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cases Table (2 cols on large screen) */}
          <div className="lg:col-span-2 panel">
            <div className="panel-header">
              <h2 className="panel-title flex items-center gap-2">
                <ShieldAlert size={18} className="text-red-600" /> Active Moderation Cases
              </h2>
              <span className="text-xs text-slate-500">{cases.length} cases</span>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Target / Reason</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Reported</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-xs text-slate-400">
                        Zero open moderation cases. All user reports have been resolved.
                      </td>
                    </tr>
                  ) : (
                    cases.map((c) => (
                      <tr
                        key={c.id}
                        className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${
                          selectedCase?.id === c.id ? 'bg-blue-50/50' : ''
                        }`}
                        onClick={() => setSelectedCase(c)}
                      >
                        <td>
                          <div className="font-semibold text-slate-900 text-xs capitalize">
                            {c.targetType}: {c.reason}
                          </div>
                          {c.details && <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{c.details}</p>}
                        </td>
                        <td>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              c.severity === 'critical'
                                ? 'bg-red-100 text-red-800'
                                : c.severity === 'high'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {c.severity}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              c.status === 'open'
                                ? 'badge-danger'
                                : c.status === 'investigating'
                                ? 'badge-warning'
                                : 'badge-success'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td>
                          <span className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary py-1 px-2.5 text-[11px] text-blue-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCase(c);
                            }}
                          >
                            Inspect <ArrowRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Case Detail / Inspector Panel */}
          <div className="panel p-5">
            {selectedCase ? (
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">Case #{selectedCase.id.slice(0, 8)}</span>
                    <h3 className="text-base font-bold text-slate-900 capitalize mt-0.5">{selectedCase.reason}</h3>
                  </div>
                  <span className="badge badge-warning capitalize">{selectedCase.status}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1.5 border border-slate-100">
                  <div>
                    <span className="text-slate-500">Target Type:</span>{' '}
                    <strong className="text-slate-800 capitalize">{selectedCase.targetType}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Target ID:</span>{' '}
                    <span className="font-mono text-slate-600 text-[10px]">{selectedCase.targetId}</span>
                  </div>
                  {selectedCase.reporter && (
                    <div>
                      <span className="text-slate-500">Reported By:</span>{' '}
                      <span className="text-slate-800 font-medium">{selectedCase.reporter.full_name}</span>
                    </div>
                  )}
                  {selectedCase.details && (
                    <div className="pt-2 border-t border-slate-200/60 mt-2">
                      <span className="text-slate-500 block mb-1">Details:</span>
                      <p className="text-slate-700 italic">{selectedCase.details}</p>
                    </div>
                  )}
                </div>

                {/* Status & Severity Controls */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">Severity</label>
                    <select
                      className="form-input text-xs w-full mt-1"
                      value={selectedCase.severity}
                      onChange={(e) => handleUpdateCase(selectedCase.id, { severity: e.target.value })}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">Status</label>
                    <select
                      className="form-input text-xs w-full mt-1"
                      value={selectedCase.status}
                      onChange={(e) => handleUpdateCase(selectedCase.id, { status: e.target.value })}
                    >
                      <option value="open">Open</option>
                      <option value="investigating">Investigating</option>
                      <option value="actioned">Actioned</option>
                      <option value="dismissed">Dismissed</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>

                {/* Internal Notes History */}
                <div className="pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-2">
                    <MessageSquare size={14} className="text-slate-500" /> Internal Notes & Audit Trail
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selectedCase.internalNotes && selectedCase.internalNotes.length > 0 ? (
                      selectedCase.internalNotes.map((note: any, idx: number) => (
                        <div key={idx} className="p-2 bg-slate-50 rounded-lg text-xs border border-slate-100">
                          <p className="text-slate-700">{note.note}</p>
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            {new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">No notes recorded yet.</div>
                    )}
                  </div>

                  <form onSubmit={handleAddNote} className="mt-3 flex gap-1.5">
                    <input
                      type="text"
                      className="form-input text-xs flex-1"
                      placeholder="Add an internal note…"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="btn-secondary text-xs"
                      disabled={submittingNote || !newNote.trim()}
                    >
                      Add
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-slate-400">
                <ShieldAlert size={28} className="mx-auto text-slate-300 mb-2" />
                Select a moderation case to view complete audit trail and triage options.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
