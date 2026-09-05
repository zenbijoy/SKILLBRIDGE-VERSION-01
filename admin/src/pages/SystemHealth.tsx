import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Lock,
  RadioTower,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Zap,
} from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import type { SystemHealthData } from '../types/admin';

type RealtimeData = {
  socketio: {
    status: string;
    connectedSockets: number;
    roomsTracked: number;
  };
  livekit: {
    configured: boolean;
    activeRooms: number;
    host?: string;
  };
};

type CacheModalState = {
  target: 'dashboard' | 'catalog' | 'rooms';
  label: string;
  pattern: string;
} | null;

export default function SystemHealth() {
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [realtime, setRealtime] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Safe cache management state
  const [cacheModal, setCacheModal] = useState<CacheModalState>(null);
  const [clearReason, setClearReason] = useState('');
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheNotice, setCacheNotice] = useState('');
  const [cacheError, setCacheError] = useState('');

  const fetchStatus = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setError('');
    try {
      const [statusRes, realtimeRes] = await Promise.all([
        api.get<SystemHealthData>('/admin/system/status'),
        api.get<RealtimeData>('/admin/learning-ops/realtime').catch(() => null),
      ]);
      setData(statusRes.data);
      if (realtimeRes?.data) setRealtime(realtimeRes.data);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch real-time system status');
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => {
      void fetchStatus();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleExecuteCacheClear = async () => {
    if (!cacheModal) return;
    if (clearReason.trim().length < 3) {
      setCacheError('Please provide a descriptive reason for this cache invalidation action.');
      return;
    }

    setClearingCache(true);
    setCacheError('');
    setCacheNotice('');

    try {
      const res = await api.post<{ success: boolean; clearedPattern: string; clearedAt: string }>('/admin/cache/clear', {
        target: cacheModal.target,
        reason: clearReason.trim(),
      });

      setCacheNotice(`Successfully cleared cache namespace pattern "${res.data.clearedPattern}". Audit log recorded.`);
      setCacheModal(null);
      setClearReason('');
      void fetchStatus(true);
    } catch (err: unknown) {
      setCacheError(err instanceof Error ? err.message : 'Failed to execute cache invalidation.');
    } finally {
      setClearingCache(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Observability"
        title="System Status & Health"
        description="Real-time automated issue detector, infrastructure health diagnostics, and safe cache management."
        actions={
          <div className="flex items-center gap-3">
            {lastRefreshed ? (
              <span className="text-xs text-slate-400">
                Last checked: {lastRefreshed.toLocaleTimeString()}
              </span>
            ) : null}
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => void fetchStatus(true)}
              disabled={refreshing || loading}
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {loading ? (
        <section className="panel">
          <LoadingState label="Running real-time health checks across subsystems…" />
        </section>
      ) : null}

      {error ? (
        <section className="panel mb-4">
          <ErrorState message={error} onRetry={() => void fetchStatus(true)} />
        </section>
      ) : null}

      {cacheNotice ? (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span className="text-sm font-medium">{cacheNotice}</span>
          </div>
          <button onClick={() => setCacheNotice('')} className="text-xs text-emerald-400 hover:underline">Dismiss</button>
        </div>
      ) : null}

      {!loading && data ? (
        <>
          {/* Top Banner: Auto-detected Issues */}
          {data.issues.length > 0 ? (
            <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">
              <div className="flex items-start gap-3">
                <AlertOctagon size={24} className="mt-0.5 shrink-0 text-red-400" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-100">
                    System Issues Detected ({data.issues.length})
                  </h3>
                  <p className="mt-1 text-sm text-red-300">
                    The automated diagnostic engine flagged the following problems:
                  </p>
                  <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-red-200">
                    {data.issues.map((issue, idx) => (
                      <li key={idx} className="font-medium">
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={22} className="shrink-0 text-emerald-400" />
                <div>
                  <span className="font-semibold text-emerald-100">All systems operational.</span>
                  <span className="ml-2 text-sm text-emerald-300">
                    Zero active anomalies, latencies within thresholds, and auth rates normal.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Subsystem Diagnostics Grid */}
          <h2 className="mb-3 text-base font-semibold text-slate-100">Subsystem Diagnostics</h2>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Database Card */}
            <div className="panel panel-flat">
              <div className="panel-header">
                <div className="flex items-center gap-2.5">
                  <Database size={18} className="text-blue-400" />
                  <h3 className="panel-title text-sm">Database (Supabase)</h3>
                </div>
                <StatusBadge value={data.services.database.status} />
              </div>
              <div className="panel-body space-y-2.5 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Round-trip latency:</span>
                  <span
                    className={`font-mono font-medium ${
                      data.services.database.latencyMs === null
                        ? 'text-slate-400'
                        : data.services.database.latencyMs > 500
                        ? 'text-red-400'
                        : data.services.database.latencyMs > 150
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {data.services.database.latencyMs !== null ? `${data.services.database.latencyMs} ms` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Health query:</span>
                  <span className="text-slate-200">
                    {data.services.database.error ? 'Query failed' : 'Pass (SELECT 1)'}
                  </span>
                </div>
                {data.services.database.error ? (
                  <p className="text-xs text-red-400">{data.services.database.error}</p>
                ) : null}
              </div>
            </div>

            {/* Redis Card */}
            <div className="panel panel-flat">
              <div className="panel-header">
                <div className="flex items-center gap-2.5">
                  <Server size={18} className="text-rose-400" />
                  <h3 className="panel-title text-sm">Redis & In-Memory State</h3>
                </div>
                <StatusBadge value={data.services.redis.status} />
              </div>
              <div className="panel-body space-y-2.5 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Ping latency:</span>
                  <span
                    className={`font-mono font-medium ${
                      data.services.redis.latencyMs === null
                        ? 'text-slate-400'
                        : data.services.redis.latencyMs > 100
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {data.services.redis.latencyMs !== null ? `${data.services.redis.latencyMs} ms` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Connection state:</span>
                  <span className="font-mono text-slate-200">
                    {data.services.redis.metrics.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Auth Monitor Card */}
            <div className="panel panel-flat">
              <div className="panel-header">
                <div className="flex items-center gap-2.5">
                  <Lock size={18} className="text-amber-400" />
                  <h3 className="panel-title text-sm">Authentication Engine</h3>
                </div>
                <StatusBadge value={data.services.auth.isAuthDegraded ? 'degraded' : 'operational'} />
              </div>
              <div className="panel-body space-y-2.5 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Failure rate:</span>
                  <span
                    className={`font-mono font-medium ${
                      data.services.auth.isAuthDegraded ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {data.services.auth.failuresPerMinute} / min
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">5-min failure count:</span>
                  <span className="font-mono text-slate-200">
                    {data.services.auth.failuresLast5Min}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Alert threshold:</span>
                  <span className="text-slate-400">&gt; 20 / min</span>
                </div>
              </div>
            </div>

            {/* LiveKit Video Card */}
            <div className="panel panel-flat">
              <div className="panel-header">
                <div className="flex items-center gap-2.5">
                  <RadioTower size={18} className="text-violet-400" />
                  <h3 className="panel-title text-sm">LiveKit WebRTC</h3>
                </div>
                <StatusBadge value={data.services.livekit.status} />
              </div>
              <div className="panel-body space-y-2.5 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Classrooms engine:</span>
                  <span className="text-slate-200">
                    {data.services.livekit.status === 'configured' ? 'Ready' : 'Not configured'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Active rooms:</span>
                  <span className="font-mono text-slate-200">
                    {realtime?.livekit.activeRooms ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Socket.IO Card */}
            <div className="panel panel-flat">
              <div className="panel-header">
                <div className="flex items-center gap-2.5">
                  <Zap size={18} className="text-yellow-400" />
                  <h3 className="panel-title text-sm">Socket.IO Real-time</h3>
                </div>
                <StatusBadge value={data.services.socketio.status} />
              </div>
              <div className="panel-body space-y-2.5 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Connected sockets:</span>
                  <span className="font-mono font-medium text-emerald-400">
                    {realtime?.socketio.connectedSockets ?? 0}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Active room channels:</span>
                  <span className="font-mono text-slate-200">
                    {realtime?.socketio.roomsTracked ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Push Notifications Card */}
            <div className="panel panel-flat">
              <div className="panel-header">
                <div className="flex items-center gap-2.5">
                  <Smartphone size={18} className="text-cyan-400" />
                  <h3 className="panel-title text-sm">Expo Push Notifications</h3>
                </div>
                <StatusBadge value={data.services.push.status} />
              </div>
              <div className="panel-body space-y-2.5 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Delivery service:</span>
                  <span className="text-slate-200">
                    {data.services.push.status === 'configured' ? 'Active' : 'Unconfigured'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Access token:</span>
                  <span className="text-slate-200">
                    {data.services.push.status === 'configured' ? 'Configured' : 'Missing token'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Safe Redis Cache Operations */}
          <h2 className="mb-3 text-base font-semibold text-slate-100 flex items-center gap-2">
            <Server size={18} className="text-rose-400" />
            <span>Safe Cache Invalidation Operations</span>
          </h2>
          <div className="panel panel-flat mb-6">
            <div className="panel-body">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Allowlisted Namespace Invalidation</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                    Purge specific stale cache partitions safely without impacting active session tokens or global system state. Every action requires administrative justification and creates an immutable audit trail.
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg text-amber-300 text-xs shrink-0">
                  <ShieldAlert size={14} />
                  <span>FLUSHALL & FLUSHDB Strictly Disabled</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                <div className="border border-slate-800 rounded-xl p-4 bg-slate-900/40 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">Dashboard Cache</span>
                      <span className="font-mono text-[11px] text-slate-500">dashboard:*</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Purges aggregated user home dashboards, momentum metrics, and personalized widget cards.
                    </p>
                  </div>
                  <button
                    onClick={() => setCacheModal({ target: 'dashboard', label: 'Dashboard Cache', pattern: 'dashboard:*' })}
                    className="btn-secondary mt-4 w-full flex items-center justify-center gap-2 text-xs py-2"
                  >
                    <Trash2 size={13} />
                    <span>Clear Dashboard Cache</span>
                  </button>
                </div>

                <div className="border border-slate-800 rounded-xl p-4 bg-slate-900/40 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">Catalog Cache</span>
                      <span className="font-mono text-[11px] text-slate-500">catalog:*</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Purges skills taxonomies, subject categories, and club & event directory snapshots.
                    </p>
                  </div>
                  <button
                    onClick={() => setCacheModal({ target: 'catalog', label: 'Catalog Cache', pattern: 'catalog:*' })}
                    className="btn-secondary mt-4 w-full flex items-center justify-center gap-2 text-xs py-2"
                  >
                    <Trash2 size={13} />
                    <span>Clear Catalog Cache</span>
                  </button>
                </div>

                <div className="border border-slate-800 rounded-xl p-4 bg-slate-900/40 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">Rooms & Sessions Cache</span>
                      <span className="font-mono text-[11px] text-slate-500">rooms:*</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Purges cached study rooms, live participant counts, and active learning session listings.
                    </p>
                  </div>
                  <button
                    onClick={() => setCacheModal({ target: 'rooms', label: 'Rooms Cache', pattern: 'rooms:*' })}
                    className="btn-secondary mt-4 w-full flex items-center justify-center gap-2 text-xs py-2"
                  >
                    <Trash2 size={13} />
                    <span>Clear Rooms Cache</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Process Runtime & Host Metrics */}
          <h2 className="mb-3 text-base font-semibold text-slate-100">Server Runtime & Process Metrics</h2>
          <div className="panel panel-flat mb-6">
            <div className="panel-body detail-grid">
              <div className="detail-item">
                <label className="flex items-center gap-1.5">
                  <Clock size={14} className="text-slate-400" />
                  Server Uptime
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-base font-semibold text-slate-100">
                    {formatUptime(data.server.uptimeSeconds)}
                  </span>
                  {data.server.isRecentRestart ? (
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                      Recent Restart
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="detail-item">
                <label className="flex items-center gap-1.5">
                  <Clock size={14} className="text-slate-400" />
                  Started At
                </label>
                <span className="mt-1 font-mono text-sm text-slate-200">
                  {new Date(data.server.startedAt).toLocaleString()}
                </span>
              </div>

              <div className="detail-item">
                <label className="flex items-center gap-1.5">
                  <HardDrive size={14} className="text-slate-400" />
                  Memory (Heap Used / Total)
                </label>
                <span className="mt-1 font-mono text-sm text-slate-200">
                  {data.memory.heapUsedMB} MB / {data.memory.heapTotalMB} MB
                </span>
              </div>

              <div className="detail-item">
                <label className="flex items-center gap-1.5">
                  <Cpu size={14} className="text-slate-400" />
                  Resident Memory (RSS)
                </label>
                <span
                  className={`mt-1 font-mono text-sm font-semibold ${
                    data.memory.rssMB > 512 ? 'text-red-400' : 'text-slate-200'
                  }`}
                >
                  {data.memory.rssMB} MB
                </span>
              </div>

              <div className="detail-item">
                <label className="flex items-center gap-1.5">
                  <Activity size={14} className="text-slate-400" />
                  Node.js & Environment
                </label>
                <span className="mt-1 font-mono text-sm text-slate-200">
                  {data.server.nodeVersion} ({data.server.environment})
                </span>
              </div>

              <div className="detail-item">
                <label className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-slate-400" />
                  Global Rate Limit
                </label>
                <span className="mt-1 font-mono text-sm text-slate-200">
                  {data.rateLimit.globalLimitPerMinute} requests / min
                </span>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* Confirmation Modal for Safe Cache Clearing */}
      {cacheModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle size={24} />
              <h3 className="text-base font-semibold text-slate-100">
                Confirm Cache Clearance
              </h3>
            </div>

            <p className="mt-3 text-sm text-slate-300">
              You are about to invalidate <strong className="text-slate-100">{cacheModal.label}</strong> (keys matching <span className="font-mono text-amber-400">{cacheModal.pattern}</span>).
            </p>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Reason for invalidation (Required for audit log)
              </label>
              <input
                type="text"
                placeholder="e.g. Catalog content update published"
                value={clearReason}
                onChange={(e) => setClearReason(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>

            {cacheError ? (
              <p className="mt-2 text-xs text-red-400">{cacheError}</p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCacheModal(null);
                  setClearReason('');
                  setCacheError('');
                }}
                className="btn-secondary text-sm"
                disabled={clearingCache}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleExecuteCacheClear()}
                disabled={clearingCache || clearReason.trim().length < 3}
                className="btn-primary bg-rose-600 hover:bg-rose-500 text-sm flex items-center gap-2"
              >
                {clearingCache ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>{clearingCache ? 'Invalidating…' : 'Confirm Invalidation'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  return `${minutes}m ${secs}s`;
}
