import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  LifeBuoy,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/ToastContext';
import type { AdminReport, AuditLog } from '../types/admin';

export default function SupportCenter() {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [reportResponse, logResponse] = await Promise.all([
        api.get<{ reports: AdminReport[] }>('/admin/reports', { params: { limit: 50 } }),
        api.get<{ logs: AuditLog[] }>('/admin/audit-logs', { params: { limit: 15 } }),
      ]);
      setReports(reportResponse.data.reports);
      setLogs(logResponse.data.logs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load operations queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTriage = async (reportId: string, status: 'reviewing' | 'resolved' | 'dismissed') => {
    setActionLoading(reportId);
    try {
      const action =
        status === 'resolved'
          ? 'Fast-resolved from Operations Queue'
          : status === 'dismissed'
          ? 'Dismissed from Operations Queue'
          : 'Moved into review';
      const res = await api.patch<AdminReport>(`/admin/reports/${reportId}`, { status, action });
      setReports((prev) => prev.map((r) => (r.id === reportId ? res.data : r)));
      success(`Report updated to ${status}.`);
    } catch (err: any) {
      toastError(err?.message || 'Could not update report.');
    } finally {
      setActionLoading(null);
    }
  };

  const open = useMemo(() => reports.filter((r) => r.status === 'open').length, [reports]);
  const reviewing = useMemo(() => reports.filter((r) => r.status === 'reviewing').length, [reports]);

  return (
    <div>
      <PageHeader
        eyebrow="Operations &amp; Triage"
        title="Operations &amp; Support Queue"
        description="Active operations stream merging unresolved user reports, moderation escalation pressure, and real-time privileged administrative logs."
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => void load()}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button className="btn-primary" onClick={() => navigate('/moderation')}>
              Open Moderation Center <ArrowRight size={14} />
            </button>
          </div>
        }
      />

      {loading ? (
        <section className="panel"><LoadingState label="Loading current operations queue…" /></section>
      ) : null}
      {error ? (
        <section className="panel"><ErrorState message={error} onRetry={() => void load()} /></section>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="stats-grid">
            <StatCard label="Open reports" value={open} detail="Waiting for triage" icon={ShieldAlert} tone="red" />
            <StatCard label="In review" value={reviewing} detail="Currently being investigated" icon={LifeBuoy} tone="amber" />
            <StatCard label="Recent audit" value={logs.length} detail="Newest privileged events loaded" icon={Activity} tone="blue" />
            <StatCard label="Visible queue" value={reports.length} detail="Total reports in buffer" icon={RefreshCw} tone="violet" />
          </div>

          <div className="dashboard-grid">
            <section className="panel panel-flat overflow-hidden">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Urgent Reports Needing Triage</h2>
                  <p className="panel-subtitle">Take fast 1-click triage actions or investigate detailed records.</p>
                </div>
              </div>

              {reports.filter((r) => r.status === 'open' || r.status === 'reviewing').length ? (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>Target</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Quick Triage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports
                        .filter((r) => r.status === 'open' || r.status === 'reviewing')
                        .map((r) => (
                          <tr key={r.id}>
                            <td>
                              <span className="text-xs text-slate-500 font-mono">
                                {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </td>
                            <td>
                              <strong className="text-xs text-slate-800 block capitalize">{r.target_type}</strong>
                              <span className="mono text-[10px] text-slate-400">{r.target_id.slice(0, 8)}…</span>
                            </td>
                            <td className="max-w-[200px]">
                              <span className="text-xs text-slate-700 line-clamp-1 font-medium">{r.reason}</span>
                            </td>
                            <td>
                              <StatusBadge value={r.status} />
                            </td>
                            <td>
                              <div className="flex items-center gap-1">
                                {r.status === 'open' && (
                                  <button
                                    disabled={actionLoading === r.id}
                                    onClick={() => handleTriage(r.id, 'reviewing')}
                                    className="btn-secondary py-1 px-2 text-[10px]"
                                  >
                                    Review
                                  </button>
                                )}
                                <button
                                  disabled={actionLoading === r.id}
                                  onClick={() => handleTriage(r.id, 'resolved')}
                                  className="btn-primary py-1 px-2 text-[10px] flex items-center gap-1"
                                >
                                  <CheckCircle2 size={11} /> Resolve
                                </button>
                                <button
                                  disabled={actionLoading === r.id}
                                  onClick={() => handleTriage(r.id, 'dismissed')}
                                  className="btn-ghost py-1 px-1.5 text-[10px] text-slate-400 hover:text-slate-600"
                                >
                                  <XCircle size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="Queue is clear" detail="No open or reviewing reports in the current result set." />
              )}
            </section>

            <section className="panel panel-flat">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Operator Audit Stream</h2>
                  <p className="panel-subtitle">Newest administrative actions recorded by the backend.</p>
                </div>
                <button onClick={() => navigate('/db-ops')} className="text-xs text-blue-600 font-bold hover:underline">
                  View Full Audit Log
                </button>
              </div>
              {logs.length ? (
                <ul className="activity-list">
                  {logs.map((log) => (
                    <li className="activity-item" key={String(log.id)}>
                      <span className="activity-dot" />
                      <div className="activity-copy">
                        <strong>{log.action.replaceAll('.', ' · ')}</strong>
                        <span>
                          {log.target_type}
                          {log.target_id ? ` · ${log.target_id}` : ''} ·{' '}
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No activity yet" detail="Admin and moderator actions will be recorded here." />
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
