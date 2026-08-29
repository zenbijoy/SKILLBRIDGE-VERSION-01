import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Lock,
  RadioTower,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Zap,
} from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import type { SystemHealthData } from '../types/admin';

export default function SystemHealth() {
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchStatus = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setError('');
    try {
      const res = await api.get<SystemHealthData>('/admin/system/status');
      setData(res.data);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch real-time system status');
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  }, []);

  // Initial fetch and 30-second auto-refresh polling
  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => {
      void fetchStatus();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return (
    <div>
      <PageHeader
        eyebrow="Observability"
        title="System Status & Health"
        description="Real-time automated issue detector and infrastructure health diagnostics. Auto-refreshes every 30 seconds."
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
                    The automated diagnostic engine flagged the following problems. No log digging required:
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

          {/* Service Health Cards Grid */}
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
                  <h3 className="panel-title text-sm">Redis & Presence</h3>
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
                  <span className="text-slate-400">Video classrooms:</span>
                  <span className="text-slate-200">
                    {data.services.livekit.status === 'configured' ? 'Ready' : 'Not configured'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Media server:</span>
                  <span className="text-slate-200">
                    {data.services.livekit.status === 'configured' ? 'Credentials set' : 'Missing keys'}
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
                  <span className="text-slate-400">Transport:</span>
                  <span className="text-slate-200">WebSocket / Polling</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Chat & room events:</span>
                  <span className="text-emerald-400 font-medium">Operational</span>
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
