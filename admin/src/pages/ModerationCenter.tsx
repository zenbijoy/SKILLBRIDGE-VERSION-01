import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Filter, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import type { AdminReport, ReportStatus } from '../types/admin';

const filters: Array<'all' | ReportStatus> = ['all', 'open', 'reviewing', 'resolved', 'dismissed'];

export default function ModerationCenter() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'all' | ReportStatus>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ reports: AdminReport[]; total: number }>('/admin/reports', {
        params: { status: filter === 'all' ? undefined : filter, limit: 100 },
      });
      setReports(response.data.reports);
      setTotal(response.data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load moderation reports');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const handleAction = async (report: AdminReport, status: 'reviewing' | 'resolved' | 'dismissed') => {
    setActionLoading(report.id);
    try {
      const action = status === 'resolved' ? 'Reviewed and resolved by control-plane operator' : status === 'dismissed' ? 'Reviewed and dismissed by control-plane operator' : 'Report moved into active review';
      const response = await api.patch<AdminReport>(`/admin/reports/${report.id}`, { status, action });
      setReports((current) => current.map((item) => item.id === report.id ? response.data : item));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update report');
    } finally {
      setActionLoading(null);
    }
  };

  const openCount = useMemo(() => reports.filter((report) => report.status === 'open').length, [reports]);
  const reviewingCount = useMemo(() => reports.filter((report) => report.status === 'reviewing').length, [reports]);

  return (
    <div>
      <PageHeader
        eyebrow="Trust & safety"
        title="Moderation center"
        description="Review user-submitted reports using the actual database field names and valid report states: open, reviewing, resolved and dismissed."
        actions={<button className="btn-secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>}
      />

      <div className="stats-grid">
        <StatCard label="Visible reports" value={reports.length} detail={`${total.toLocaleString()} in selected filter`} icon={ShieldAlert} tone="amber" />
        <StatCard label="Open" value={openCount} detail="Waiting for operator triage" icon={Filter} tone="red" />
        <StatCard label="Reviewing" value={reviewingCount} detail="Actively being investigated" icon={RefreshCw} tone="blue" />
        <StatCard label="Resolved / dismissed" value={reports.filter((r) => r.status === 'resolved' || r.status === 'dismissed').length} detail="Closed in this result set" icon={CheckCircle2} tone="green" />
      </div>

      <section className="panel panel-flat overflow-hidden">
        <div className="panel-header">
          <div><h2 className="panel-title">Report queue</h2><p className="panel-subtitle">Every state change is written to the audit log by the backend.</p></div>
          <div className="segmented">{filters.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
        </div>

        {loading ? <LoadingState label="Loading moderation queue…" /> : null}
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {!loading && !error && !reports.length ? <EmptyState title="Queue is clear" detail="No reports matched the selected state." /> : null}

        {!loading && !error && reports.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Created</th><th>Target</th><th>Reporter</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>{new Date(report.created_at).toLocaleString()}</td>
                    <td><div className="font-extrabold text-slate-700">{report.target_type}</div><div className="mono mt-1 text-slate-400">{report.target_id}</div></td>
                    <td className="mono">{report.reporter_id}</td>
                    <td className="max-w-[310px]"><div className="font-bold text-slate-700">{report.reason}</div>{report.details ? <div className="mt-1 line-clamp-2 text-[10px] text-slate-400">{report.details}</div> : null}</td>
                    <td><StatusBadge value={report.status} /></td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {report.status === 'open' ? <button className="btn-secondary" disabled={actionLoading === report.id} onClick={() => void handleAction(report, 'reviewing')}>Review</button> : null}
                        {report.status !== 'resolved' ? <button className="btn-primary" disabled={actionLoading === report.id} onClick={() => void handleAction(report, 'resolved')}><CheckCircle2 size={13} /> Resolve</button> : null}
                        {report.status !== 'dismissed' ? <button className="btn-ghost" disabled={actionLoading === report.id} onClick={() => void handleAction(report, 'dismissed')}><XCircle size={13} /> Dismiss</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
