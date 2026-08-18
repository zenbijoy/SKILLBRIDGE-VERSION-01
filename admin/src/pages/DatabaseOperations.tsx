import { useCallback, useEffect, useState } from 'react';
import { Database, FileClock, RefreshCw, Server } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import type { AuditLog, SystemInfo } from '../types/admin';

export default function DatabaseOperations() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [systemResponse, logsResponse] = await Promise.all([api.get<SystemInfo>('/admin/system'), api.get<{ logs: AuditLog[]; total: number }>('/admin/audit-logs', { params: { limit: 50 } })]);
      setSystem(systemResponse.data); setLogs(logsResponse.data.logs); setTotal(logsResponse.data.total);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to load data operations view'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader eyebrow="Data governance" title="Audit & data operations" description="Database reachability plus the real privileged audit stream. Fake migration and backup buttons have been removed." actions={<button className="btn-secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>} />
      {loading ? <section className="panel"><LoadingState label="Loading database health and audit trail…" /></section> : null}
      {error ? <section className="panel"><ErrorState message={error} onRetry={() => void load()} /></section> : null}
      {!loading && !error && system ? <>
        <div className="dashboard-grid">
          <section className="panel panel-flat"><div className="panel-header"><div><h2 className="panel-title">Database health</h2><p className="panel-subtitle">Lightweight authenticated connectivity probe.</p></div><Database size={18} className="text-blue-600" /></div><div className="panel-body detail-grid"><Detail label="Provider" value="Supabase / PostgreSQL" /><Detail label="Status" value={system.database.status} badge /><Detail label="API environment" value={system.environment} /><Detail label="Audit events" value={total.toLocaleString()} /></div></section>
          <section className="panel panel-flat"><div className="panel-header"><div><h2 className="panel-title">Safety boundary</h2><p className="panel-subtitle">What this dashboard intentionally does not expose.</p></div><Server size={18} className="text-slate-400" /></div><div className="panel-body grid gap-3"><div className="notice">Production migrations and backups should run through versioned migration scripts and infrastructure tooling—not from an unrestricted browser button.</div><div className="notice notice-warning">Service-role keys, raw connection strings and secret provider values are never returned by <span className="mono">/admin/system</span>.</div></div></section>
        </div>
        <section className="panel panel-flat mt-4 overflow-hidden"><div className="panel-header"><div><h2 className="panel-title">Privileged audit trail</h2><p className="panel-subtitle">Showing the newest {logs.length} of {total.toLocaleString()} recorded events.</p></div><FileClock size={18} className="text-slate-400" /></div>{logs.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Actor</th><th>Metadata</th></tr></thead><tbody>{logs.map((log) => <tr key={String(log.id)}><td>{new Date(log.created_at).toLocaleString()}</td><td className="mono">{log.action}</td><td>{log.target_type}{log.target_id ? <span className="mono"> · {log.target_id}</span> : null}</td><td className="mono">{log.actor_id ?? 'system'}</td><td className="mono">{log.metadata ? compact(log.metadata) : '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="No audit events yet" detail="Privileged moderation and admin actions will appear here." />}</section>
      </> : null}
    </div>
  );
}
function Detail({ label, value, badge = false }: { label: string; value: string; badge?: boolean }) { return <div className="detail-item"><label>{label}</label>{badge ? <div className="mt-2"><StatusBadge value={value} /></div> : <span>{value}</span>}</div>; }
function compact(value: Record<string, unknown>) { const text = JSON.stringify(value); return text.length > 90 ? `${text.slice(0, 87)}…` : text; }
