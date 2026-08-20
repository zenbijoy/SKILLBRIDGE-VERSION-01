import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { RefreshCw, Search, Shield, UserRound } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import type { AccountStatus, AdminProfile, UserDetail } from '../types/admin';

const tabs = ['profile', 'skills', 'rooms', 'sessions', 'activity'] as const;
type Tab = (typeof tabs)[number];

export default function User360() {
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
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

  const searchUsers = useCallback(async (searchText: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ users: AdminProfile[]; total: number }>('/admin/users', { params: { q: searchText.trim() || undefined, limit: 50 } });
      setUsers(response.data.users);
      setTotal(response.data.total);
      if (selectedId && !response.data.users.some((user) => user.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to search users');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

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

  useEffect(() => {
    setQuery(initialQuery);
    void searchUsers(initialQuery);
  }, [initialQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = query.trim();
    setParams(next ? { q: next } : {});
    void searchUsers(next);
  };

  const updateStatus = async (status: AccountStatus) => {
    if (!detail) return;
    setActionLoading(true);
    setActionError('');
    try {
      const response = await api.patch<AdminProfile>(`/admin/users/${detail.profile.id}/status`, { status });
      setDetail({ ...detail, profile: { ...detail.profile, ...response.data } });
      setUsers((current) => current.map((user) => user.id === detail.profile.id ? { ...user, ...response.data } : user));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not update account status');
    } finally {
      setActionLoading(false);
    }
  };

  const updateElevatedRole = async (elevatedRole: 'moderator' | 'admin' | null) => {
    if (!detail) return;
    setActionLoading(true);
    setActionError('');
    try {
      const response = await api.put<{ roles: string[] }>(`/admin/users/${detail.profile.id}/roles`, { elevatedRole });
      const roles = response.data.roles;
      setDetail({ ...detail, profile: { ...detail.profile, roles } });
      setUsers((current) => current.map((user) => user.id === detail.profile.id ? { ...user, roles } : user));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Only an admin can change elevated roles');
    } finally {
      setActionLoading(false);
    }
  };

  const selectedUser = useMemo(() => users.find((user) => user.id === selectedId) ?? detail?.profile ?? null, [users, selectedId, detail]);
  const elevatedRole = detail?.profile.roles.includes('admin') ? 'admin' : detail?.profile.roles.includes('moderator') ? 'moderator' : '';

  return (
    <div>
      <PageHeader eyebrow="Identity & access" title="User 360" description="Search real profile records, inspect participation and take audited account actions without relying on mock user fields." />

      <div className="two-column">
        <section className="panel panel-flat overflow-hidden">
          <div className="panel-header block">
            <form className="toolbar" onSubmit={submit}>
              <div className="toolbar-search"><Search size={16} /><input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, username or university" /></div>
              <button className="btn-primary" disabled={loading}>Search</button>
            </form>
            <div className="mt-2 text-[10px] text-slate-400">{total.toLocaleString()} matching profiles</div>
          </div>

          {error ? <ErrorState message={error} onRetry={() => void searchUsers(query)} /> : null}
          {loading ? <LoadingState label="Searching profiles…" /> : null}
          {!loading && !error ? (
            <div className="user-list">
              {users.length ? users.map((user) => (
                <button key={user.id} className={`user-list-item ${selectedId === user.id ? 'selected' : ''}`} onClick={() => void loadDetail(user.id)}>
                  <div className="user-avatar">{initials(user.full_name)}</div>
                  <div className="user-list-copy"><strong>{user.full_name}</strong><span>@{user.username || 'no-username'} · {user.university || 'No university'}</span></div>
                  <StatusBadge value={user.account_status} />
                </button>
              )) : <EmptyState title="No profiles found" detail="Try a broader name, username or university search." />}
            </div>
          ) : null}
        </section>

        <section className="panel panel-flat overflow-hidden min-h-[480px]">
          {!selectedId ? <EmptyState title="Select a user" detail="Choose a profile on the left to load skills, rooms, sessions and audit history." /> : null}
          {detailLoading ? <LoadingState label="Loading user 360…" /> : null}
          {actionError && !detailLoading ? <div className="m-4 notice notice-danger">{actionError}</div> : null}
          {!detailLoading && detail && selectedUser ? (
            <>
              <div className="profile-hero">
                <div className="profile-avatar-large">{initials(detail.profile.full_name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="profile-title">{detail.profile.full_name}</h2><StatusBadge value={detail.profile.account_status} /></div>
                  <div className="profile-meta">@{detail.profile.username || 'no-username'} · {detail.profile.university || 'University not set'} · reputation {detail.profile.reputation}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{detail.profile.roles.map((role) => <span key={role} className="status-badge status-neutral">{role}</span>)}</div>
                </div>
                <button className="btn-secondary" onClick={() => void loadDetail(detail.profile.id)}><RefreshCw size={14} /> Refresh</button>
              </div>

              <div className="tabs">{tabs.map((tab) => <button key={tab} className={`tab-button ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
              <div className="panel-body">
                {activeTab === 'profile' ? (
                  <div className="grid gap-4">
                    <div className="detail-grid">
                      <Detail label="User ID" value={detail.profile.id} mono />
                      <Detail label="Account status" value={detail.profile.account_status} />
                      <Detail label="Department" value={detail.profile.department || 'Not set'} />
                      <Detail label="Batch" value={detail.profile.batch || 'Not set'} />
                      <Detail label="Created" value={new Date(detail.profile.created_at).toLocaleString()} />
                      <Detail label="Reputation" value={String(detail.profile.reputation)} />
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-black text-slate-700"><Shield size={15} /> Administrative actions</div>
                      <div className="toolbar">
                        <button className="btn-secondary" disabled={actionLoading || detail.profile.account_status === 'active'} onClick={() => void updateStatus('active')}>Activate</button>
                        <button className="btn-secondary" disabled={actionLoading || detail.profile.account_status === 'suspended'} onClick={() => void updateStatus('suspended')}>Suspend</button>
                        <button className="btn-danger" disabled={actionLoading || detail.profile.account_status === 'banned'} onClick={() => void updateStatus('banned')}>Ban</button>
                        <select className="field max-w-[190px]" value={elevatedRole} disabled={actionLoading} onChange={(event) => void updateElevatedRole(event.target.value === 'admin' ? 'admin' : event.target.value === 'moderator' ? 'moderator' : null)}>
                          <option value="">Standard user</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <p className="mt-3 text-[10px] leading-5 text-slate-400">Role escalation is admin-only on the backend. Moderators can review users but cannot grant themselves or others admin access.</p>
                    </div>
                  </div>
                ) : null}

                {activeTab === 'skills' ? detail.skills.length ? (
                  <div className="grid gap-2">{detail.skills.map((item, index) => <div className="detail-item" key={`${item.skill?.id ?? index}-${item.kind}`}><label>{item.kind} · proficiency {item.proficiency}/5</label><span>{item.skill?.name ?? 'Unknown skill'} {item.verified ? '· verified' : ''}</span></div>)}</div>
                ) : <EmptyState title="No skills" detail="This user has no skill records yet." /> : null}

                {activeTab === 'rooms' ? detail.rooms.length ? (
                  <div className="grid gap-2">{detail.rooms.map((item, index) => <div className="detail-item" key={item.room?.id ?? index}><label>{item.role} · {item.room?.status ?? 'unknown'}</label><span>{item.room?.title ?? 'Unknown room'} · {item.room?.topic || 'No topic'}</span></div>)}</div>
                ) : <EmptyState title="No room history" detail="No room membership records were returned." /> : null}

                {activeTab === 'sessions' ? detail.sessions.length ? (
                  <div className="grid gap-2">{detail.sessions.map((item, index) => <div className="detail-item" key={item.session?.id ?? index}><label>{item.session?.status ?? 'unknown'} · {item.attendance_status ?? item.status ?? 'no attendance state'}</label><span>{item.session?.starts_at ? new Date(item.session.starts_at).toLocaleString() : 'Unknown time'} · {item.session?.mode ?? 'unknown mode'}</span></div>)}</div>
                ) : <EmptyState title="No session history" detail="No participant session records were returned." /> : null}

                {activeTab === 'activity' ? detail.activity.length ? (
                  <ul className="activity-list">{detail.activity.map((item) => <li className="activity-item" key={item.id}><span className="activity-dot" /><div className="activity-copy"><strong>{item.action.replaceAll('.', ' · ')}</strong><span>{new Date(item.created_at).toLocaleString()}</span></div></li>)}</ul>
                ) : <EmptyState title="No privileged activity" detail="No audit events target this user yet." /> : null}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="detail-item"><label>{label}</label><span className={mono ? 'mono' : ''}>{value}</span></div>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || <UserRound size={15} />;
}
