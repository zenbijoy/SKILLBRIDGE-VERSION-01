import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadingState, ErrorState } from '../components/States';
import { useToast } from '../components/ToastContext';

interface DiagnosticIssue {
  id: string;
  issue: string;
  severity: 'critical' | 'warning' | 'info';
  count: number;
  sampleIds: string[];
  recommendedAction: string;
}

interface DataQualityData {
  healthScore: number;
  diagnosticsRunAt: string;
  readOnly: boolean;
  issues: DiagnosticIssue[];
  totalIssuesCount: number;
}

export default function DataQuality() {
  const { success, error: toastError } = useToast();
  const [data, setData] = useState<DataQualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DataQualityData>('/admin/data-quality');
      setData(res.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to run data quality diagnostics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleRepair = async (action: 'empty_rooms' | 'stale_onboarding' | 'incomplete_profiles' | 'repair_all') => {
    const actionLabel =
      action === 'repair_all'
        ? 'all detected platform anomalies'
        : action === 'empty_rooms'
        ? 'empty orphaned rooms'
        : action === 'stale_onboarding'
        ? 'stale onboarding sessions'
        : 'incomplete user profiles';

    if (
      !window.confirm(
        `Are you sure you want to execute automated repair for ${actionLabel}? This action is audited.`
      )
    ) {
      return;
    }

    setRepairing(action);
    try {
      const res = await api.post<{ success: boolean; results: Record<string, { fixed: number; details: string }> }>(
        '/admin/data-quality/repair',
        { action }
      );
      const summary = Object.values(res.data.results || {})
        .map((r) => r.details)
        .join(' ');
      success(summary || 'Automated repair executed successfully.');
      void loadData();
    } catch (err: any) {
      toastError(err?.message || 'Failed to execute data repair.');
    } finally {
      setRepairing(null);
    }
  };

  const getActionForIssue = (issueId: string): 'empty_rooms' | 'stale_onboarding' | 'incomplete_profiles' | null => {
    if (issueId.includes('room')) return 'empty_rooms';
    if (issueId.includes('onboarding')) return 'stale_onboarding';
    if (issueId.includes('profile')) return 'incomplete_profiles';
    return null;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Integrity Diagnostics &amp; Remediation"
        title="Data Quality &amp; Auto-Repair Center"
        description="Run deep relational integrity diagnostics, detect schema orphans, and execute transactional automated repairs across all databases."
        actions={
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={loadData}>
              <RefreshCw size={15} /> Re-run Diagnostics
            </button>
            {data && data.issues.length > 0 && (
              <button
                type="button"
                disabled={Boolean(repairing)}
                className="btn-primary flex items-center gap-2"
                onClick={() => handleRepair('repair_all')}
              >
                <Wrench size={15} />
                {repairing === 'repair_all' ? 'Repairing All…' : 'One-Click Platform Repair'}
              </button>
            )}
          </div>
        }
      />

      {loading ? (
        <LoadingState label="Running schema relational integrity checks…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : data ? (
        <div className="space-y-6">
          {/* Health Score Banner */}
          <div className="panel p-6 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 border-blue-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white border border-blue-200 grid place-items-center shadow-sm text-blue-600">
                <Database size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-slate-900">Platform Data Integrity Score</h2>
                  <span
                    className={`badge text-xs font-mono font-bold ${
                      data.healthScore >= 90
                        ? 'badge-success'
                        : data.healthScore >= 75
                        ? 'badge-warning'
                        : 'badge-danger'
                    }`}
                  >
                    {data.healthScore}% Healthy
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Last verified: {new Date(data.diagnosticsRunAt).toLocaleTimeString()} ·{' '}
                  {data.totalIssuesCount} diagnostic items identified
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-xs text-emerald-800 font-mono font-bold bg-emerald-50 py-1.5 px-3 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-600" />
                Active Auto-Remediation Enabled
              </div>
            </div>
          </div>

          {/* Issues List */}
          <section className="panel">
            <div className="panel-header">
              <h3 className="panel-title flex items-center gap-2">
                <AlertTriangle size={17} className="text-amber-500" /> Relational Diagnostic Findings
              </h3>
              <span className="text-xs text-slate-500">{data.issues.length} check types analyzed</span>
            </div>

            <div className="p-4 space-y-4">
              {data.issues.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
                  Zero data inconsistencies detected. All foreign keys and required profile records are fully populated.
                </div>
              ) : (
                data.issues.map((item) => {
                  const repairAction = getActionForIssue(item.id);
                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3 text-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <strong className="text-slate-900 text-sm font-bold">{item.issue}</strong>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                item.severity === 'critical'
                                  ? 'bg-red-100 text-red-700'
                                  : item.severity === 'warning'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {item.severity}
                            </span>
                          </div>
                          <p className="text-slate-600 mt-1">{item.recommendedAction}</p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono font-bold text-slate-800 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm">
                            {item.count} records
                          </span>
                          {repairAction && (
                            <button
                              type="button"
                              disabled={Boolean(repairing)}
                              onClick={() => handleRepair(repairAction)}
                              className="btn-primary py-1 px-3 text-[11px] flex items-center gap-1.5"
                            >
                              <Wrench size={13} />
                              {repairing === repairAction ? 'Repairing…' : 'Auto-Fix Issue'}
                            </button>
                          )}
                        </div>
                      </div>

                      {item.sampleIds && item.sampleIds.length > 0 && (
                        <div className="pt-2 border-t border-slate-200/80 flex items-center gap-2">
                          <span className="text-slate-400 text-[11px]">Sample Record IDs:</span>
                          <div className="flex flex-wrap gap-1">
                            {item.sampleIds.map((id: string) => (
                              <span
                                key={id}
                                className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600"
                              >
                                {id.slice(0, 8)}…
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
