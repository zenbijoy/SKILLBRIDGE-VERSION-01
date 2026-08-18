import { useCallback, useEffect, useState } from 'react';
import { BrainCircuit, CloudCog, RadioTower, RefreshCw, Server, Smartphone } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import type { SystemInfo } from '../types/admin';

export default function APIManagement() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<SystemInfo>('/admin/system');
      setSystem(response.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to read integration status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const capabilities = system ? [
    { name: 'Redis', enabled: system.capabilities.redis, icon: Server, detail: 'Caching, presence and distributed coordination capability.' },
    { name: 'LiveKit', enabled: system.capabilities.livekit, icon: RadioTower, detail: 'Real-time audio/video learning room infrastructure.' },
    { name: 'Expo Push', enabled: system.capabilities.push, icon: Smartphone, detail: 'Push notification delivery capability.' },
    { name: 'AI Provider', enabled: system.capabilities.ai, icon: BrainCircuit, detail: 'Optional provider URL + API credential configured server-side.' },
  ] : [];

  return (
    <div>
      <PageHeader eyebrow="Infrastructure" title="Integrations & API" description="Read-only operational visibility into backend integrations. Credentials stay server-side and are never rendered in the browser." actions={<button className="btn-secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>} />
      {loading ? <section className="panel"><LoadingState label="Checking backend capabilities…" /></section> : null}
      {error ? <section className="panel"><ErrorState message={error} onRetry={() => void load()} /></section> : null}
      {!loading && !error && system ? (
        <>
          <section className="panel panel-flat mb-4">
            <div className="panel-header"><div><h2 className="panel-title">API runtime</h2><p className="panel-subtitle">Reported directly by the authenticated admin endpoint.</p></div><CloudCog size={18} className="text-blue-600" /></div>
            <div className="panel-body detail-grid">
              <Detail label="API status" value={system.api.status} badge />
              <Detail label="Environment" value={system.environment} />
              <Detail label="Port" value={String(system.api.port)} />
              <Detail label="Uptime" value={formatUptime(system.api.uptimeSeconds)} />
              <Detail label="Global rate limit" value={`${system.runtimePolicy.globalRateLimitPerMinute}/minute`} />
              <Detail label="Started" value={new Date(system.api.startedAt).toLocaleString()} />
            </div>
          </section>
          <section className="panel panel-flat">
            <div className="panel-header"><div><h2 className="panel-title">Provider capabilities</h2><p className="panel-subtitle">“Configured” means required environment variables are present; secret values are intentionally hidden.</p></div></div>
            <div className="panel-body capability-grid">{capabilities.map(({ name, enabled, icon: Icon, detail }) => <div className="capability-card" key={name}><div className={`capability-dot ${enabled ? 'capability-on' : 'capability-off'}`} /><div className="flex items-center gap-2"><Icon size={16} className="text-slate-500" /><strong>{name}</strong></div><p>{detail}</p><div className="mt-3"><StatusBadge value={enabled ? 'configured' : 'not configured'} /></div></div>)}</div>
            <div className="panel-body pt-0"><div className="notice">API keys are managed through backend environment/secrets management, not generated as fake browser-only keys. This prevents the old dashboard from giving a false impression that a key had been provisioned.</div></div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Detail({ label, value, badge = false }: { label: string; value: string; badge?: boolean }) {
  return <div className="detail-item"><label>{label}</label>{badge ? <div className="mt-2"><StatusBadge value={value} /></div> : <span>{value}</span>}</div>;
}
function formatUptime(seconds: number) { const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600); const minutes = Math.floor((seconds % 3600) / 60); return `${days}d ${hours}h ${minutes}m`; }
