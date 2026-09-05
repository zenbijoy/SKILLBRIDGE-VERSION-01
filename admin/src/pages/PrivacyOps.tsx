import { useEffect, useState } from 'react';
import { ShieldCheck, UserX, FileLock2, History, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { LoadingState, ErrorState } from '../components/States';

export default function PrivacyOps() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/privacy');
      setData(res.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load privacy operations.');
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
        eyebrow="Compliance & Governance"
        title="Privacy & Account Operations"
        description="Monitor user account deactivations, deletion requests, and privacy configuration audit trails in compliance with academic privacy rules."
        actions={
          <button type="button" className="btn-secondary" onClick={loadData}>
            <RefreshCw size={15} /> Refresh Logs
          </button>
        }
      />

      {loading ? (
        <LoadingState label="Inspecting account privacy & deactivation status…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : data ? (
        <div className="space-y-6">
          <div className="stats-grid">
            <StatCard
              label="Deactivated Accounts"
              value={data.metrics.deactivatedAccountsCount.toLocaleString()}
              detail="Voluntarily deactivated"
              icon={UserX}
              tone="amber"
            />
            <StatCard
              label="Private Profiles"
              value={data.metrics.privateProfilesCount.toLocaleString()}
              detail="Limited to connections"
              icon={FileLock2}
              tone="violet"
            />
            <StatCard
              label="Audited Privacy Events"
              value={data.metrics.privacyAuditLogsCount.toLocaleString()}
              detail="Deactivations & status changes"
              icon={History}
              tone="blue"
            />
            <StatCard
              label="Compliance Posture"
              value="Verified"
              detail="Audit trails immutable"
              icon={ShieldCheck}
              tone="green"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Deactivated Accounts */}
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title flex items-center gap-2">
                  <UserX size={16} className="text-amber-600" /> Deactivated Student Accounts
                </h2>
                <span className="text-xs text-slate-500">{data.deactivatedAccounts.length} accounts</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Status</th>
                      <th>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.deactivatedAccounts.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center py-6 text-xs text-slate-400">
                          No currently deactivated student accounts.
                        </td>
                      </tr>
                    ) : (
                      data.deactivatedAccounts.map((user: any) => (
                        <tr key={user.id}>
                          <td>
                            <strong className="text-slate-800 text-xs">{user.full_name}</strong>
                            <div className="text-[10px] text-slate-400">@{user.username || 'user'}</div>
                          </td>
                          <td>
                            <span className="badge badge-warning capitalize">{user.account_status}</span>
                          </td>
                          <td>
                            <span className="text-xs text-slate-400">
                              {new Date(user.updated_at).toLocaleDateString()}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Privacy & Account Mutation Audit Trail */}
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title flex items-center gap-2">
                  <History size={16} className="text-blue-600" /> Account Lifecycle Audit Trail
                </h2>
                <span className="text-xs text-slate-500">Last 50 events</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Target ID</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.auditTrail.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center py-6 text-xs text-slate-400">
                          No privacy-related audit entries recorded.
                        </td>
                      </tr>
                    ) : (
                      data.auditTrail.map((log: any) => (
                        <tr key={log.id}>
                          <td>
                            <span className="font-mono text-xs font-semibold text-slate-800">{log.action}</span>
                          </td>
                          <td>
                            <span className="font-mono text-[10px] text-slate-500">{log.target_id?.slice(0, 8) || 'system'}</span>
                          </td>
                          <td>
                            <span className="text-xs text-slate-400">
                              {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
