import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, LifeBuoy, RefreshCw, ShieldAlert } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import type { AdminReport, AuditLog } from '../types/admin';

export default function SupportCenter() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [reportResponse, logResponse] = await Promise.all([
        api.get<{ reports: AdminReport[] }>('/admin/reports', { params: { limit: 40 } }),
        api.get<{ logs: AuditLog[] }>('/admin/audit-logs', { params: { limit: 15 } }),
      ]);
      setReports(reportResponse.data.reports); setLogs(logResponse.data.logs);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to load operations queue'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const open = useMemo(() => reports.filter((r) => r.status === 'open').length, [reports]);
  const reviewing = useMemo(() => reports.filter((r) => r.status === 'reviewing').length, [reports]);

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Operations queue" description="A real operational view built from moderation reports and audit activity. The previous hard-coded support tickets from 2023 have been removed." actions={<button className="btn-secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>} />
      {loading ? <section className="panel"><LoadingState label="Loading current operations queue…" /></section> : null}
      {error ? <section className="panel"><ErrorState message={error} onRetry={() => void load()} /></section> : null}
      {!loading && !error ? <>
        <div className="stats-grid"><StatCard label="Open reports" value={open} detail="Waiting for triage" icon={ShieldAlert} tone="red" /><StatCard label="In review" value={reviewing} detail="Currently being investigated" icon={LifeBuoy} tone="amber" /><StatCard label="Recent audit" value={logs.length} detail="Newest privileged events loaded" icon={Activity} tone="blue" /><StatCard label="Visible queue" value={reports.length} detail="Newest moderation cases loaded" icon={RefreshCw} tone="violet" /></div>
        <div className="dashboard-grid">
          <section className="panel panel-flat overflow-hidden"><div className="panel-header"><div><h2 className="panel-title">Cases needing attention</h2><p className="panel-subtitle">Open and reviewing reports. Resolve them in Moderation Center.</p></div></div>{reports.filter((r) => r.status === 'open' || r.status === 'reviewing').length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Created</th><th>Target</th><th>Reason</th><th>Status</th></tr></thead><tbody>{reports.filter((r) => r.status === 'open' || r.status === 'reviewing').map((r) => <tr key={r.id}><td>{new Date(r.created_at).toLocaleString()}</td><td>{r.target_type}<span className="mono"> · {r.target_id}</span></td><td>{r.reason}</td><td><StatusBadge value={r.status} /></td></tr>)}</tbody></table></div> : <EmptyState title="Queue is clear" detail="No open or reviewing reports in the current result set." />}</section>
          <section className="panel panel-flat"><div className="panel-header"><div><h2 className="panel-title">Recent operator activity</h2><p className="panel-subtitle">Newest audit events.</p></div></div>{logs.length ? <ul className="activity-list">{logs.map((log) => <li className="activity-item" key={String(log.id)}><span className="activity-dot" /><div className="activity-copy"><strong>{log.action.replaceAll('.', ' · ')}</strong><span>{log.target_type}{log.target_id ? ` · ${log.target_id}` : ''} · {new Date(log.created_at).toLocaleString()}</span></div></li>)}</ul> : <EmptyState title="No activity yet" detail="Admin and moderator actions will be recorded here." />}</section>
        </div>
      </> : null}
    </div>
  );
}
