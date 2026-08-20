import { useCallback, useEffect, useState } from 'react';
import { Gauge, RefreshCw, ShieldCheck, UsersRound, Wrench } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/States';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import type { SystemInfo } from '../types/admin';

export default function RulesEngine() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setSystem((await api.get<SystemInfo>('/admin/system')).data); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to load runtime policy'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader eyebrow="Platform policy" title="Runtime policy" description="Effective server-side limits. Unlike the previous simulated form, this page only shows policy the backend is actually enforcing." actions={<button className="btn-secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>} />
      {loading ? <section className="panel"><LoadingState label="Reading effective policy…" /></section> : null}
      {error ? <section className="panel"><ErrorState message={error} onRetry={() => void load()} /></section> : null}
      {!loading && !error && system ? <>
        <div className="stats-grid">
          <StatCard label="Global requests" value={`${system.runtimePolicy.globalRateLimitPerMinute}/min`} detail="Express rate limiter" icon={Gauge} tone="blue" />
          <StatCard label="Max room capacity" value={system.runtimePolicy.maxRoomCapacity} detail="Validated during room creation" icon={UsersRound} tone="violet" />
          <StatCard label="Maintenance mode" value={system.runtimePolicy.maintenanceMode ? 'Enabled' : 'Disabled'} detail="Moderators/admins retain access" icon={Wrench} tone={system.runtimePolicy.maintenanceMode ? 'red' : 'green'} />
          <StatCard label="Database" value={system.database.status} detail="Policy source API can reach Supabase" icon={ShieldCheck} tone={system.database.status === 'operational' ? 'green' : 'red'} />
        </div>
        <section className="panel panel-flat">
          <div className="panel-header"><div><h2 className="panel-title">Effective configuration</h2><p className="panel-subtitle">Change these values in the backend environment and restart/redeploy the API so the source of truth remains auditable.</p></div><StatusBadge value={system.runtimePolicy.maintenanceMode ? 'maintenance enabled' : 'operational'} /></div>
          <div className="panel-body grid gap-3">
            <ConfigLine name="GLOBAL_RATE_LIMIT_PER_MINUTE" value={String(system.runtimePolicy.globalRateLimitPerMinute)} detail="Allowed range: 30–5000 requests per minute per configured rate-limit key." />
            <ConfigLine name="MAX_ROOM_CAPACITY" value={String(system.runtimePolicy.maxRoomCapacity)} detail="Allowed range: 2–1000 and enforced by room request validation." />
            <ConfigLine name="MAINTENANCE_MODE" value={String(system.runtimePolicy.maintenanceMode)} detail="Accepts true/false, 1/0, yes/no or on/off in the upgraded parser." />
            <div className="notice notice-warning">A browser “Save configuration” button was removed because it only changed React state and never changed backend behavior. Use deployment secrets/environment management for production policy.</div>
          </div>
        </section>
      </> : null}
    </div>
  );
}
function ConfigLine({ name, value, detail }: { name: string; value: string; detail: string }) { return <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between"><div><strong className="mono text-slate-700">{name}</strong><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div><code className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700">{value}</code></div>; }
