import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, ArrowRight, CheckCheck, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadingState, ErrorState } from '../components/States';

interface AlertItem {
  id: string;
  title: string;
  description: string;
  category: 'security' | 'moderation' | 'system' | 'integration' | 'data_quality';
  severity: 'critical' | 'warning' | 'info';
  link: string;
  createdAt: string;
}

export default function Alerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const loadAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/alerts');
      setAlerts(res.data.alerts);
    } catch (err: any) {
      setError(err?.message || 'Failed to load operational alerts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, []);

  const handleDismiss = async (id: string) => {
    try {
      await api.post('/admin/alerts/dismiss', { id });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {}
  };

  const handleDismissAll = async () => {
    try {
      await api.post('/admin/alerts/dismiss-all');
      setAlerts([]);
    } catch {}
  };

  const filtered = filterCategory === 'all'
    ? alerts
    : alerts.filter((a) => a.category === filterCategory);

  return (
    <div>
      <PageHeader
        eyebrow="System Observability"
        title="Admin Alert Center"
        description="Real-time operational alerts derived from platform security, moderation backlog, service telemetry, and background workers."
        actions={
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={loadAlerts}>
              <RefreshCw size={15} /> Refresh
            </button>
            {alerts.length > 0 && (
              <button type="button" className="btn-secondary text-slate-700" onClick={handleDismissAll}>
                <CheckCheck size={15} /> Acknowledge All
              </button>
            )}
          </div>
        }
      />

      {/* Category Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200/80 pb-3">
        {(['all', 'security', 'moderation', 'system', 'integration'] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition-colors ${
              filterCategory === cat
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => setFilterCategory(cat)}
          >
            {cat === 'all' ? `All Alerts (${alerts.length})` : cat}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState label="Inspecting operational systems for alerts…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadAlerts} />
      ) : filtered.length === 0 ? (
        <div className="panel p-12 text-center">
          <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-2" />
          <h3 className="text-base font-bold text-slate-900">All systems operating nominally</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Zero active alerts or unaddressed operational warnings in the current category.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => (
            <div
              key={alert.id}
              className={`panel p-4 flex items-start justify-between gap-4 border-l-4 ${
                alert.severity === 'critical'
                  ? 'border-l-red-500 bg-red-50/20'
                  : alert.severity === 'warning'
                  ? 'border-l-amber-500 bg-amber-50/20'
                  : 'border-l-blue-500 bg-blue-50/20'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`mt-0.5 p-2 rounded-xl flex-shrink-0 ${
                    alert.severity === 'critical'
                      ? 'bg-red-100 text-red-700'
                      : alert.severity === 'warning'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {alert.severity === 'critical' ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{alert.title}</h3>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {alert.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{alert.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  className="btn-primary text-xs py-1 px-3 flex items-center gap-1"
                  onClick={() => navigate(alert.link)}
                >
                  Resolve <ArrowRight size={13} />
                </button>
                <button
                  type="button"
                  className="btn-secondary text-xs py-1 px-2.5 text-slate-500"
                  onClick={() => handleDismiss(alert.id)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
