import { useCallback, useEffect, useState } from 'react';
import {
  Database,
  Download,
  FileClock,
  Filter,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
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

  // Audit Explorer V2 Filters
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [targetIdFilter, setTargetIdFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = {
        page,
        limit,
      };
      if (actionFilter.trim()) params.action = actionFilter.trim();
      if (actorFilter.trim()) params.actor_id = actorFilter.trim();
      if (targetTypeFilter.trim()) params.target_type = targetTypeFilter.trim();
      if (targetIdFilter.trim()) params.target_id = targetIdFilter.trim();
      if (fromDate) params.from_date = new Date(fromDate).toISOString();
      if (toDate) params.to_date = new Date(toDate).toISOString();

      const [systemResponse, logsResponse] = await Promise.all([
        api.get<SystemInfo>('/admin/system'),
        api.get<{ logs: AuditLog[]; total: number }>('/admin/audit-logs', { params }),
      ]);
      setSystem(systemResponse.data);
      setLogs(logsResponse.data.logs);
      setTotal(logsResponse.data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit operations view');
    } finally {
      setLoading(false);
    }
  }, [page, limit, actionFilter, actorFilter, targetTypeFilter, targetIdFilter, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params: Record<string, string | number> = {
        export: 'csv',
        limit: 2000,
      };
      if (actionFilter.trim()) params.action = actionFilter.trim();
      if (actorFilter.trim()) params.actor_id = actorFilter.trim();
      if (targetTypeFilter.trim()) params.target_type = targetTypeFilter.trim();
      if (targetIdFilter.trim()) params.target_id = targetIdFilter.trim();
      if (fromDate) params.from_date = new Date(fromDate).toISOString();
      if (toDate) params.to_date = new Date(toDate).toISOString();

      const res = await api.get('/admin/audit-logs', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `skillbridge_audit_export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export sanitized CSV.');
    } finally {
      setExporting(false);
    }
  };

  const handleResetFilters = () => {
    setActionFilter('');
    setActorFilter('');
    setTargetTypeFilter('');
    setTargetIdFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <PageHeader
        eyebrow="Data Governance"
        title="Audit Explorer V2 & Data Operations"
        description="Comprehensive immutable audit stream with multi-dimensional filtering, metadata inspection, and sanitized CSV compliance export."
        actions={
          <div className="flex items-center gap-3">
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => void handleExportCsv()}
              disabled={exporting || loading}
            >
              <Download size={15} />
              <span>{exporting ? 'Exporting…' : 'Export Sanitized CSV'}</span>
            </button>
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* Top Diagnostics Panels */}
      {system ? (
        <div className="dashboard-grid mb-6">
          <section className="panel panel-flat">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Database Connectivity</h2>
                <p className="panel-subtitle">Authenticated persistence health probe.</p>
              </div>
              <Database size={18} className="text-blue-500" />
            </div>
            <div className="panel-body detail-grid">
              <Detail label="Engine" value="Supabase / PostgreSQL" />
              <Detail label="Cluster Status" value={system.database.status} badge />
              <Detail label="Environment" value={system.environment} />
              <Detail label="Total Audit Events" value={total.toLocaleString()} />
            </div>
          </section>

          <section className="panel panel-flat">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Security & Redaction Protocol</h2>
                <p className="panel-subtitle">Automatic sanitization rules applied to metadata.</p>
              </div>
              <ShieldAlert size={18} className="text-emerald-400" />
            </div>
            <div className="panel-body space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2 text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>All authentication tokens, service secrets, passwords, and authorization headers are permanently redacted.</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                <span>Zero raw destructive database controls exposed in browser console. Production migrations run through versioned scripts.</span>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {/* Audit Explorer V2 Filters Bar */}
      <section className="panel panel-flat mb-6">
        <div className="panel-header pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Filter size={16} className="text-slate-400" />
            <span>Audit Query Filters</span>
          </div>
          {(actionFilter || actorFilter || targetTypeFilter || targetIdFilter || fromDate || toDate) ? (
            <button
              onClick={handleResetFilters}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Reset Filters
            </button>
          ) : null}
        </div>
        <div className="panel-body pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Action</label>
              <input
                type="text"
                placeholder="e.g. admin.user or room"
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Actor ID</label>
              <input
                type="text"
                placeholder="UUID or 'system'"
                value={actorFilter}
                onChange={(e) => { setActorFilter(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target Type</label>
              <select
                value={targetTypeFilter}
                onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">All target types</option>
                <option value="user">user</option>
                <option value="room">room</option>
                <option value="session">session</option>
                <option value="report">report</option>
                <option value="moderation_case">moderation_case</option>
                <option value="campaign">campaign</option>
                <option value="club">club</option>
                <option value="event">event</option>
                <option value="resource">resource</option>
                <option value="quiz">quiz</option>
                <option value="cache">cache</option>
                <option value="app_version_control">app_version_control</option>
                <option value="system_setting">system_setting</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target ID</label>
              <input
                type="text"
                placeholder="Target entity ID"
                value={targetIdFilter}
                onChange={(e) => { setTargetIdFilter(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="panel mb-4">
          <ErrorState message={error} onRetry={() => void load()} />
        </section>
      ) : null}

      {/* Main Audit Trail Table */}
      <section className="panel panel-flat overflow-hidden">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Privileged Audit Log Stream</h2>
            <p className="panel-subtitle">
              Displaying {logs.length} events (Filtered total: {total.toLocaleString()})
            </p>
          </div>
          <FileClock size={18} className="text-slate-400" />
        </div>

        {loading ? (
          <div className="p-6">
            <LoadingState label="Querying audit records from database…" />
          </div>
        ) : logs.length > 0 ? (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Actor</th>
                    <th>IP / Origin</th>
                    <th>Safe Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={String(log.id)}>
                      <td className="text-xs text-slate-300 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td>
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-800 text-indigo-300">
                          {log.action}
                        </span>
                      </td>
                      <td className="text-xs">
                        <span className="font-semibold text-slate-200">{log.target_type}</span>
                        {log.target_id ? (
                          <span className="block font-mono text-[11px] text-slate-400 mt-0.5 truncate max-w-[140px]">
                            {log.target_id}
                          </span>
                        ) : null}
                      </td>
                      <td className="font-mono text-xs text-slate-300">
                        {log.actor_id ? (
                          <span className="truncate max-w-[120px] inline-block" title={log.actor_id}>
                            {log.actor_id.slice(0, 8)}…
                          </span>
                        ) : (
                          <span className="text-slate-500">system</span>
                        )}
                      </td>
                      <td className="font-mono text-xs text-slate-400">
                        {log.ip_address ?? '—'}
                      </td>
                      <td className="font-mono text-xs text-slate-300 max-w-xs">
                        {log.metadata ? formatSafeMetadata(log.metadata) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span>Page {page} of {totalPages}</span>
                <span className="text-slate-600">|</span>
                <span>Page size:</span>
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-200"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="No audit events matched"
            detail="Try widening your date range or clearing filter parameters."
          />
        )}
      </section>
    </div>
  );
}

function Detail({ label, value, badge = false }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="detail-item">
      <label>{label}</label>
      {badge ? (
        <div className="mt-2">
          <StatusBadge value={value} />
        </div>
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}

function formatSafeMetadata(value: Record<string, unknown>): string {
  try {
    const text = JSON.stringify(value);
    return text.length > 90 ? `${text.slice(0, 87)}…` : text;
  } catch {
    return '—';
  }
}
