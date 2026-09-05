import { useEffect, useState } from 'react';
import { Database, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadingState, ErrorState } from '../components/States';

export default function DataQuality() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/data-quality');
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

  return (
    <div>
      <PageHeader
        eyebrow="Integrity Diagnostics"
        title="Data Quality Center"
        description="Read-only diagnostic audit identifying orphan relations, incomplete profile onboarding records, and relational schema consistency."
        actions={
          <button type="button" className="btn-secondary" onClick={loadData}>
            <RefreshCw size={15} /> Re-run Diagnostics
          </button>
        }
      />

      {loading ? (
        <LoadingState label="Running schema relational integrity checks…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : data ? (
        <div className="space-y-6">
          {/* Health Score Banner */}
          <div className="panel p-6 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white border border-blue-200 grid place-items-center shadow-sm text-blue-600">
                <Database size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-slate-900">Platform Data Integrity Score</h2>
                  <span className="badge badge-success text-xs font-mono">{data.healthScore}% Healthy</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Last verified: {new Date(data.diagnosticsRunAt).toLocaleTimeString()} · {data.totalIssuesCount} minor diagnostic items identified
                </p>
              </div>
            </div>
            <div className="text-xs text-slate-400 font-mono bg-white/80 py-1.5 px-3 rounded-lg border border-slate-200">
              Read-Only Safe Mode Enabled
            </div>
          </div>

          {/* Issues List */}
          <div className="panel">
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
                data.issues.map((item: any) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-900 text-sm">{item.issue}</strong>
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
                      <span className="font-mono font-bold text-slate-800 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm">
                        {item.count} records
                      </span>
                    </div>

                    {item.sampleIds && item.sampleIds.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/80 flex items-center gap-2">
                        <span className="text-slate-400 text-[11px]">Sample IDs:</span>
                        <div className="flex flex-wrap gap-1">
                          {item.sampleIds.map((id: string) => (
                            <span key={id} className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">
                              {id.slice(0, 8)}…
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
