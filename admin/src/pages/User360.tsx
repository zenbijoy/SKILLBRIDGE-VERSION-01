import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  Download,
  Filter,
  KeyRound,
  RefreshCw,
  Search,
  Shield,
  UserRound,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/ToastContext';
import type { AccountStatus, AdminProfile, UserDetail } from '../types/admin';

const tabs = ['profile', 'skills', 'rooms', 'sessions', 'activity'] as const;
type Tab = (typeof tabs)[number];

const STATUS_FILTERS = ['all', 'active', 'suspended', 'banned'] as const;
const ROLE_FILTERS = ['all', 'student', 'tutor', 'moderator', 'admin'] as const;

export default function User360() {
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get('q') ?? '';
  const { success, error: toastError } = useToast();

  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(30);

  const [users, setUsers] = useState<AdminProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  // Password Reset Modal State
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [customPassword, setCustomPassword] = useState('');
  const [tempPasswordResult, setTempPasswordResult] = useState<{ password: string; email?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setActionError('');
    try {
      const response = await api.get<UserDetail>(`/admin/users/${id}`);
      setDetail(response.data);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to load user details');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const searchUsers = useCallback(
    async (searchText: string, currentStatus: string, currentRole: string, currentPage: number) => {
      setLoading(true);
      setError('');
      try {
        const queryParams: Record<string, any> = {
          page: currentPage,
          limit,
        };
        if (searchText.trim()) queryParams.q = searchText.trim();
        if (currentStatus !== 'all') queryParams.status = currentStatus;
        if (currentRole !== 'all') queryParams.role = currentRole;

        const response = await api.get<{ users: AdminProfile[]; total: number }>('/admin/users', {
          params: queryParams,
        });
        setUsers(response.data.users);
        setTotal(response.data.total);

        // Auto-select first user if none selected
        if (!selectedId && response.data.users.length > 0) {
          void loadDetail(response.data.users[0].id);
        } else if (selectedId && !response.data.users.some((user) => user.id === selectedId)) {
          if (response.data.users.length > 0) {
            void loadDetail(response.data.users[0].id);
          } else {
            setSelectedId(null);
            setDetail(null);
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to search users');
      } finally {
        setLoading(false);
      }
    },
    [limit, selectedId, loadDetail]
  );

  useEffect(() => {
    setQuery(initialQuery);
    void searchUsers(initialQuery, statusFilter, roleFilter, page);
  }, [initialQuery, statusFilter, roleFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = query.trim();
    setParams(next ? { q: next } : {});
    setPage(1);
    void searchUsers(next, statusFilter, roleFilter, 1);
  };

  const updateStatus = async (status: AccountStatus) => {
    if (!detail) return;
    setActionLoading(true);
    setActionError('');
    try {
      const response = await api.patch<AdminProfile>(`/admin/users/${detail.profile.id}/status`, { status });
      setDetail({ ...detail, profile: { ...detail.profile, ...response.data } });
      setUsers((current) =>
        current.map((user) => (user.id === detail.profile.id ? { ...user, ...response.data } : user))
      );
      success(`User account status updated to ${status}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update account status';
      setActionError(msg);
      toastError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const updateElevatedRole = async (elevatedRole: 'moderator' | 'admin' | null) => {
    if (!detail) return;
    setActionLoading(true);
    setActionError('');
    try {
      const response = await api.put<{ roles: string[] }>(`/admin/users/${detail.profile.id}/roles`, {
        elevatedRole,
      });
      const roles = response.data.roles;
      setDetail({ ...detail, profile: { ...detail.profile, roles } });
      setUsers((current) =>
        current.map((user) => (user.id === detail.profile.id ? { ...user, roles } : user))
      );
      success(`Roles updated for ${detail.profile.full_name}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Only an admin can change elevated roles';
      setActionError(msg);
      toastError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!detail) return;
    setResettingPassword(true);
    try {
      const res = await api.post<{
        success: boolean;
        temporaryPassword: string;
        email?: string;
        message: string;
      }>(`/admin/users/${detail.profile.id}/reset-password`, {
        customPassword: customPassword.trim() || undefined,
      });
      setTempPasswordResult({
        password: res.data.temporaryPassword,
        email: res.data.email,
      });
      success('Temporary password generated. Provide it securely to the user.');
    } catch (err: any) {
      toastError(err?.message || 'Failed to reset password.');
    } finally {
      setResettingPassword(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    success('Copied password to clipboard.');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleExportCsv = async () => {
    try {
      const res = await api.get('/admin/users', {
        params: {
          export: 'csv',
          q: query.trim() || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          role: roleFilter !== 'all' ? roleFilter : undefined,
        },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `skillbridge_users_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      success('Exported users to CSV.');
    } catch (err: any) {
      toastError(err?.message || 'Failed to export users.');
    }
  };

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedId) ?? detail?.profile ?? null,
    [users, selectedId, detail]
  );
  const elevatedRole = detail?.profile.roles.includes('admin')
    ? 'admin'
    : detail?.profile.roles.includes('moderator')
    ? 'moderator'
    : '';

  return (
    <div>
      <PageHeader
        eyebrow="Identity &amp; Access Control"
        title="User 360"
        description="Search real profile records, inspect participation across spaces, execute audited account actions and password management."
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => void searchUsers(query, statusFilter, roleFilter, page)}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button className="btn-secondary" onClick={handleExportCsv} title="Export filtered users to CSV">
              <Download size={15} /> Export CSV
            </button>
          </div>
        }
      />

      <div className="two-column">
        {/* Left Column: User Directory & Filters */}
        <section className="panel panel-flat overflow-hidden">
          <div className="panel-header block space-y-3">
            <form className="toolbar" onSubmit={submit}>
              <div className="toolbar-search">
                <Search size={16} />
                <input
                  className="field"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, @username or university"
                />
              </div>
              <button className="btn-primary" disabled={loading}>
                Search
              </button>
            </form>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <div className="flex items-center gap-1 text-slate-500">
                <Filter size={13} /> Status:
              </div>
              <select
                className="form-input text-xs py-1"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setPage(1);
                }}
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 text-slate-500 ml-1">Role:</div>
              <select
                className="form-input text-xs py-1"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
              >
                {ROLE_FILTERS.map((r) => (
                  <option key={r} value={r}>
                    {r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-[10px] text-slate-400 font-mono">
              {total.toLocaleString()} profiles matching current criteria
            </div>
          </div>

          {error ? <ErrorState message={error} onRetry={() => void searchUsers(query, statusFilter, roleFilter, page)} /> : null}
          {loading ? <LoadingState label="Searching profiles…" /> : null}
          {!loading && !error ? (
            <>
              <div className="user-list">
                {users.length ? (
                  users.map((user) => (
                    <button
                      key={user.id}
                      className={`user-list-item ${selectedId === user.id ? 'selected' : ''}`}
                      onClick={() => void loadDetail(user.id)}
                    >
                      <div className="user-avatar">{initials(user.full_name)}</div>
                      <div className="user-list-copy">
                        <strong>{user.full_name}</strong>
                        <span>
                          @{user.username || 'no-username'} · {user.university || 'No university'}
                        </span>
                      </div>
                      <StatusBadge value={user.account_status} />
                    </button>
                  ))
                ) : (
                  <EmptyState
                    title="No profiles found"
                    detail="Try adjusting your search keywords or relaxing status/role filters."
                  />
                )}
              </div>

              {/* Pagination Controls */}
              {total > limit && (
                <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
                  <span>Page {page} of {Math.ceil(total / limit)}</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="btn-secondary py-1 px-2.5 text-xs"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="btn-secondary py-1 px-2.5 text-xs"
                      disabled={page * limit >= total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </section>

        {/* Right Column: User 360 Detail Pane */}
        <section className="panel panel-flat overflow-hidden min-h-[480px]">
          {!selectedId ? (
            <EmptyState
              title="Select a user"
              detail="Choose a profile on the left to inspect skills, spaces, sessions, and manage credentials."
            />
          ) : null}
          {detailLoading ? <LoadingState label="Loading user 360 dossier…" /> : null}
          {actionError && !detailLoading ? <div className="m-4 notice notice-danger">{actionError}</div> : null}
          {!detailLoading && detail && selectedUser ? (
            <>
              <div className="profile-hero">
                <div className="profile-avatar-large">{initials(detail.profile.full_name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="profile-title">{detail.profile.full_name}</h2>
                    <StatusBadge value={detail.profile.account_status} />
                  </div>
                  <div className="profile-meta">
                    @{detail.profile.username || 'no-username'} · {detail.profile.university || 'University not set'} · reputation{' '}
                    {detail.profile.reputation}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {detail.profile.roles.map((role) => (
                      <span key={role} className="status-badge status-neutral">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
                <button className="btn-secondary" onClick={() => void loadDetail(detail.profile.id)}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              <div className="tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    className={`tab-button ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="panel-body">
                {activeTab === 'profile' ? (
                  <div className="grid gap-4">
                    <div className="detail-grid">
                      <Detail label="User ID" value={detail.profile.id} mono />
                      <Detail label="Account status" value={detail.profile.account_status} />
                      <Detail label="Department" value={detail.profile.department || 'Not set'} />
                      <Detail label="Batch" value={detail.profile.batch || 'Not set'} />
                      <Detail label="Created" value={new Date(detail.profile.created_at).toLocaleString()} />
                      <Detail label="Reputation Score" value={String(detail.profile.reputation)} />
                    </div>

                    {/* Administrative Controls */}
                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                          <Shield size={16} className="text-blue-600" /> Administrative Controls
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomPassword('');
                            setTempPasswordResult(null);
                            setShowPasswordResetModal(true);
                          }}
                          className="btn-secondary text-xs flex items-center gap-1.5 text-blue-700"
                        >
                          <KeyRound size={13} /> Reset Password
                        </button>
                      </div>

                      <div className="toolbar flex-wrap gap-2">
                        <button
                          className="btn-secondary text-xs"
                          disabled={actionLoading || detail.profile.account_status === 'active'}
                          onClick={() => void updateStatus('active')}
                        >
                          Activate Account
                        </button>
                        <button
                          className="btn-secondary text-xs"
                          disabled={actionLoading || detail.profile.account_status === 'suspended'}
                          onClick={() => void updateStatus('suspended')}
                        >
                          Suspend Account
                        </button>
                        <button
                          className="btn-danger text-xs"
                          disabled={actionLoading || detail.profile.account_status === 'banned'}
                          onClick={() => void updateStatus('banned')}
                        >
                          Ban Account
                        </button>
                        <select
                          className="field max-w-[190px] text-xs"
                          value={elevatedRole}
                          disabled={actionLoading}
                          onChange={(event) =>
                            void updateElevatedRole(
                              event.target.value === 'admin'
                                ? 'admin'
                                : event.target.value === 'moderator'
                                ? 'moderator'
                                : null
                            )
                          }
                        >
                          <option value="">Standard user</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </div>
                      <p className="text-[10px] leading-5 text-slate-400">
                        All account mutations generate immutable audit logs. Elevated role modifications are strictly
                        restricted to administrators.
                      </p>
                    </div>
                  </div>
                ) : null}

                {activeTab === 'skills' ? (
                  detail.skills.length ? (
                    <div className="grid gap-2">
                      {detail.skills.map((item, index) => (
                        <div className="detail-item" key={`${item.skill?.id ?? index}-${item.kind}`}>
                          <label>
                            {item.kind} · proficiency {item.proficiency}/5
                          </label>
                          <span>
                            {item.skill?.name ?? 'Unknown skill'} {item.verified ? '· verified' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No skills" detail="This user has no skill records yet." />
                  )
                ) : null}

                {activeTab === 'rooms' ? (
                  detail.rooms.length ? (
                    <div className="grid gap-2">
                      {detail.rooms.map((item, index) => (
                        <div className="detail-item" key={item.room?.id ?? index}>
                          <label>
                            {item.role} · {item.room?.status ?? 'unknown'}
                          </label>
                          <span>
                            {item.room?.title ?? 'Unknown room'} · {item.room?.topic || 'No topic'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No room history" detail="No room membership records were returned." />
                  )
                ) : null}

                {activeTab === 'sessions' ? (
                  detail.sessions.length ? (
                    <div className="grid gap-2">
                      {detail.sessions.map((item, index) => (
                        <div className="detail-item" key={item.session?.id ?? index}>
                          <label>
                            {item.session?.status ?? 'unknown'} ·{' '}
                            {item.attendance_status ?? item.status ?? 'no attendance state'}
                          </label>
                          <span>
                            {item.session?.starts_at
                              ? new Date(item.session.starts_at).toLocaleString()
                              : 'Unknown time'}{' '}
                            · {item.session?.mode ?? 'unknown mode'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No session history" detail="No participant session records were returned." />
                  )
                ) : null}

                {activeTab === 'activity' ? (
                  detail.activity.length ? (
                    <ul className="activity-list">
                      {detail.activity.map((item) => (
                        <li className="activity-item" key={item.id}>
                          <span className="activity-dot" />
                          <div className="activity-copy">
                            <strong>{item.action.replaceAll('.', ' · ')}</strong>
                            <span>{new Date(item.created_at).toLocaleString()}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="No privileged activity" detail="No audit events target this user yet." />
                  )
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      </div>

      {/* MODAL: RESET PASSWORD */}
      {showPasswordResetModal && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <KeyRound size={18} className="text-blue-600" /> Reset Password &amp; Access
              </h3>
              <button
                onClick={() => setShowPasswordResetModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Generate a secure temporary password for <strong>{detail.profile.full_name}</strong> (@
                {detail.profile.username || 'user'}). The user will use this password to log in.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Custom Temporary Password (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Leave blank to auto-generate"
                  value={customPassword}
                  onChange={(e) => setCustomPassword(e.target.value)}
                  className="field w-full text-xs font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Must be at least 8 characters if provided.
                </p>
              </div>

              {tempPasswordResult && (
                <div className="p-4 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-emerald-400 flex items-center justify-between">
                    <span>Generated Temporary Password:</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(tempPasswordResult.password)}
                      className="flex items-center gap-1 text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded text-slate-200 transition"
                    >
                      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="font-mono text-sm tracking-wider bg-slate-950 p-2 rounded-lg border border-slate-800 select-all font-bold text-center">
                    {tempPasswordResult.password}
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">
                    Copy and share this securely with the user.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPasswordResetModal(false)}
                  className="btn-secondary text-xs"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={resettingPassword}
                  onClick={handlePasswordReset}
                  className="btn-primary text-xs flex items-center gap-1.5"
                >
                  <KeyRound size={13} />
                  {resettingPassword ? 'Configuring…' : 'Generate Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="detail-item">
      <label>{label}</label>
      <span className={mono ? 'mono' : ''}>{value}</span>
    </div>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || <UserRound size={15} />
  );
}
