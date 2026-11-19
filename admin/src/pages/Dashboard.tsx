import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Compass,
  Database,
  HardDrive,
  Key,
  RefreshCw,
  Send,
  ShieldAlert,
  Users,
  Video,
  Warehouse,
  Wrench,
  Zap,
} from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import type { AdminStats, SystemInfo } from '../types/admin';

interface VersionControlConfig {
  maintenance_mode: boolean;
  maintenance_message: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [versionControl, setVersionControl] = useState<VersionControlConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);

  const load = useCallback(async () => {
    setError('');
    try {
      const [statsResponse, systemResponse, versionResponse] = await Promise.all([
        api.get<AdminStats>('/admin/stats'),
        api.get<SystemInfo>('/admin/system'),
        api.get<{ config: VersionControlConfig }>('/admin/version-control').catch(() => null),
      ]);
      setStats(statsResponse.data);
      setSystem(systemResponse.data);
      if (versionResponse?.data) {
        setVersionControl(versionResponse.data.config);
      }
      setCountdown(30);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load admin overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          void load();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  return (
    <div>
      <PageHeader
        eyebrow="Control Plane V4"
        title="Platform Overview"
        description="Live operational telemetry, marketplace metrics, security controls, and high-frequency administrative actions."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition ${
                autoRefresh
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-500 border-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              Auto-refresh: {autoRefresh ? `${countdown}s` : 'Paused'}
            </button>
            <button className="btn-secondary" onClick={() => void load()}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        }
      />

      {/* Emergency / Maintenance Warning Banner */}
      {versionControl?.maintenance_mode && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-600 text-white shadow-sm">
              <Wrench size={18} />
            </div>
            <div>
              <strong className="text-xs font-bold text-red-950 block">Platform Maintenance Mode Is Active</strong>
              <p className="text-[11px] text-red-800 mt-0.5">{versionControl.maintenance_message}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/rules')}
            className="btn-danger py-1.5 px-3 text-xs shrink-0 flex items-center gap-1.5"
          >
            Manage Mode <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* Quick Action Bar */}
      <section className="panel mb-6 p-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-slate-100 shadow-xl border-slate-700/60">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Zap size={14} className="text-amber-400" /> Administrative Quick Commands
          </span>
          <span className="text-[10px] text-slate-400 font-mono">Press Ctrl+K anytime</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          <button
            onClick={() => navigate('/rules')}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left border border-white/10 transition flex items-center gap-2.5"
          >
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300">
              <Wrench size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">Maintenance</div>
              <div className="text-[10px] text-slate-400 truncate">Toggle status</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/campaigns')}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left border border-white/10 transition flex items-center gap-2.5"
          >
            <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-300">
              <Send size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">Broadcast</div>
              <div className="text-[10px] text-slate-400 truncate">Push campaign</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/skills-intelligence?action=create')}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left border border-white/10 transition flex items-center gap-2.5"
          >
            <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
              <Compass size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">Add Skill</div>
              <div className="text-[10px] text-slate-400 truncate">Catalog entry</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/api-mgmt')}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left border border-white/10 transition flex items-center gap-2.5"
          >
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
              <Key size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">API Keys</div>
              <div className="text-[10px] text-slate-400 truncate">Quotas &amp; LiveKit</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/api-mgmt?tab=storage')}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left border border-white/10 transition flex items-center gap-2.5"
          >
            <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-300">
              <HardDrive size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">Storage R2</div>
              <div className="text-[10px] text-slate-400 truncate">Bucket pools</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/data-quality')}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left border border-white/10 transition flex items-center gap-2.5"
          >
            <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300">
              <Database size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">Auto-Repair</div>
              <div className="text-[10px] text-slate-400 truncate">Fix orphans</div>
            </div>
          </button>
        </div>
      </section>

      {loading ? (
        <div className="panel"><LoadingState label="Loading platform telemetry and metrics…" /></div>
      ) : null}
      {error ? (
        <div className="panel"><ErrorState message={error} onRetry={() => void load()} /></div>
      ) : null}

      {!loading && !error && stats ? (
        <>
          <div className="stats-grid">
            <StatCard
              label="Total Users"
              value={stats.totalUsers}
              detail={`${stats.activeUsers.toLocaleString()} active accounts`}
              icon={Users}
              tone="blue"
            />
            <StatCard
              label="Active Sessions"
              value={stats.activeSessions}
              detail="Scheduled or live learning sessions"
              icon={Video}
              tone="green"
            />
            <StatCard
              label="Open Moderation"
              value={stats.pendingReports}
              detail={`${stats.totalReports.toLocaleString()} reports across all states`}
              icon={ShieldAlert}
              tone="amber"
            />
            <StatCard
              label="Learning Rooms"
              value={stats.totalRooms}
              detail="All active campus study spaces"
              icon={Warehouse}
              tone="violet"
            />
          </div>

          <div className="dashboard-grid">
            <section className="panel panel-flat">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Recent Privileged Activity</h2>
                  <p className="panel-subtitle">Newest audit-log events generated by admin and moderation actions.</p>
                </div>
                <button onClick={() => navigate('/db-ops')} className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-bold">
                  View All <ArrowRight size={13} />
                </button>
              </div>
              {stats.recentActivity.length ? (
                <ul className="activity-list">
                  {stats.recentActivity.map((item) => (
                    <li key={item.id} className="activity-item">
                      <span className="activity-dot" />
                      <div className="activity-copy">
                        <strong>{item.action.replaceAll('.', ' · ')}</strong>
                        <span>
                          {item.targetType ? `${item.targetType}${item.targetId ? ` · ${item.targetId}` : ''} · ` : ''}
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="state-box">No audit events recorded yet.</div>
              )}
            </section>

            <section className="panel panel-flat">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Runtime &amp; System Health</h2>
                  <p className="panel-subtitle">Realtime health state reported directly by the server API.</p>
                </div>
                <button onClick={() => navigate('/system-status')} className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-bold">
                  Diagnostics <ArrowRight size={13} />
                </button>
              </div>
              <div className="panel-body grid gap-3">
                <HealthRow
                  label="API Node Engine"
                  value={system?.api.status ?? 'unknown'}
                  detail={system ? `${system.environment} · port ${system.api.port} · up ${Math.floor((system.api.uptimeSeconds || 0) / 3600)}h` : 'Unavailable'}
                />
                <HealthRow
                  label="Database Supabase"
                  value={system?.database.status ?? 'unknown'}
                  detail="Service-role PostgreSQL connectivity"
                />
                <HealthRow
                  label="Maintenance Mode"
                  value={versionControl?.maintenance_mode ? 'enabled' : 'disabled'}
                  detail={`Rate limit ${system?.runtimePolicy.globalRateLimitPerMinute ?? '—'}/min`}
                />
                <HealthRow
                  label="Redis Distributed Cache"
                  value={system?.capabilities.redis ? 'operational' : 'disabled'}
                  detail={system?.capabilities.redis ? 'Presence & sessions connected' : 'Fallback memory cache in use'}
                />
                <div className="notice text-xs">
                  All administrative actions and configuration changes are recorded into the tamper-evident PostgreSQL audit trail.
                </div>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function HealthRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3">
      <div>
        <div className="text-[11px] font-extrabold text-slate-700">{label}</div>
        <div className="mt-1 text-[10px] text-slate-400">{detail}</div>
      </div>
      <StatusBadge value={value} />
    </div>
  );
}
