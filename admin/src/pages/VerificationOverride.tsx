import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/States';

type OverrideAction = 'APPROVE_OVERRIDE' | 'REJECT_OVERRIDE' | 'BYPASS_REQUIRED_STEP';
interface OverrideEvent {
  id: number | string;
  actor_id?: string | null;
  target_id?: string | null;
  metadata?: { action?: OverrideAction; reason?: string } | null;
  created_at: string;
}

export default function VerificationOverride() {
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState<OverrideAction>('APPROVE_OVERRIDE');
  const [reason, setReason] = useState('');
  const [events, setEvents] = useState<OverrideEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ overrides: OverrideEvent[] }>('/admin/verification-overrides');
      setEvents(response.data.overrides);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load verification audit events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const apply = async () => {
    const id = userId.trim();
    const why = reason.trim();
    if (!id || why.length < 5) {
      setError('Enter a valid user UUID and a reason of at least 5 characters.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/admin/users/${id}/verify`, { action, reason: why });
      setSuccess('Verification decision recorded in the immutable admin audit trail.');
      setUserId('');
      setReason('');
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record verification override');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Identity operations"
        title="Verification override"
        description="Admin-only audited decisions. This control records an explicit override event without pretending there is a verification column that does not exist in the database schema."
        actions={<button className="btn-secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>}
      />

      <div className="dashboard-grid">
        <section className="panel panel-flat">
          <div className="panel-header"><div><h2 className="panel-title">Record decision</h2><p className="panel-subtitle">User UUID, decision and justification are required.</p></div><BadgeCheck size={18} className="text-blue-600" /></div>
          <div className="panel-body grid gap-4">
            {error ? <div className="notice notice-danger">{error}</div> : null}
            {success ? <div className="notice">{success}</div> : null}
            <div><label className="field-label">User UUID</label><input className="field mono" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" /></div>
            <div><label className="field-label">Decision</label><select className="field" value={action} onChange={(e) => setAction(e.target.value as OverrideAction)}><option value="APPROVE_OVERRIDE">Approve override</option><option value="REJECT_OVERRIDE">Reject override</option><option value="BYPASS_REQUIRED_STEP">Bypass required step</option></select></div>
            <div><label className="field-label">Reason</label><textarea className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the evidence and why this manual decision is necessary…" maxLength={500} /></div>
            <button className="btn-primary justify-self-start" disabled={saving} onClick={() => void apply()}><ShieldCheck size={15} /> {saving ? 'Recording…' : 'Record audited decision'}</button>
            <div className="notice notice-warning">This endpoint is admin-only. It records an audit event; it does not silently mutate a nonexistent <span className="mono">profiles.is_verified</span> field.</div>
          </div>
        </section>

        <section className="panel panel-flat overflow-hidden">
          <div className="panel-header"><div><h2 className="panel-title">Recent override events</h2><p className="panel-subtitle">Newest verification decisions from audit_logs.</p></div></div>
          {loading ? <LoadingState label="Loading verification audit…" /> : null}
          {!loading && error && !events.length ? <ErrorState message={error} onRetry={() => void load()} /> : null}
          {!loading && events.length ? (
            <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>User</th><th>Decision</th><th>Reason</th><th>Actor</th></tr></thead><tbody>{events.map((event) => <tr key={String(event.id)}><td>{new Date(event.created_at).toLocaleString()}</td><td className="mono">{event.target_id ?? '—'}</td><td>{event.metadata?.action?.replaceAll('_', ' ') ?? '—'}</td><td>{event.metadata?.reason ?? '—'}</td><td className="mono">{event.actor_id ?? 'system'}</td></tr>)}</tbody></table></div>
          ) : null}
          {!loading && !events.length && !error ? <EmptyState title="No override events" detail="Manual verification decisions will appear here after an admin records one." /> : null}
        </section>
      </div>
    </div>
  );
}
