import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Eye,
  Film,
  Flag,
  Globe,
  Radio,
  RefreshCw,
  Server,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';

interface TelemetryData {
  activeRooms: number;
  questionsToday: number;
  totalRecordings: number;
  openClashNegotiations: number;
  pendingReports: number;
  timestamp: string;
}

interface ProvidersData {
  supabase: { status: string; url: string };
  storage: { activeProvider: string; available: boolean; r2Configured: boolean; publicDomain: string | null };
  redis: { status: string; metrics: any };
  livekit: { status: string };
  livekitEgress?: { status: string; automatedRecordings: boolean };
  youtube?: { status: string; oauthEnabled: boolean; hasApiKey: boolean; hasOAuthSecrets: boolean };
  pushNotifications: { status: string };
  edgeGateway: { status: string; routesCached: number; swrEnabled: boolean };
}

interface ModerationReport {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details?: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
  reporter_id: string;
}

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  created_at: string;
  details: any;
  admin?: { full_name: string; username: string };
}

export default function NextGenOperations() {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [providers, setProviders] = useState<ProvidersData | null>(null);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'providers' | 'flags' | 'moderation' | 'audit' | 'media'>('providers');

  // Media & Automation State
  const [recordings, setRecordings] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaActionMessage, setMediaActionMessage] = useState('');

  // Feature Flags local state
  const [flags, setFlags] = useState({
    nextgen_feed: true,
    nextgen_qna: true,
    nextgen_recordings: true,
    nextgen_materials: true,
    nextgen_clash_engine: true,
  });

  // Reveal identity modal state
  const [revealTarget, setRevealTarget] = useState<ModerationReport | null>(null);
  const [revealJustification, setRevealJustification] = useState('');
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealedResult, setRevealedResult] = useState<{ scopedHandle: string; realUser: any } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [telRes, provRes, repRes, audRes] = await Promise.all([
        api.get<TelemetryData>('/admin/nextgen/telemetry'),
        api.get<ProvidersData>('/admin/nextgen/providers'),
        api.get<{ reports: ModerationReport[] }>('/admin/reports', { params: { limit: 50 } }),
        api.get<{ logs: AuditLog[] }>('/admin/moderation/audit-logs', { params: { limit: 50 } }),
      ]);
      setTelemetry(telRes.data);
      setProviders(provRes.data);
      setReports(repRes.data.reports || []);
      setAuditLogs(audRes.data.logs || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load Next-Gen operations data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleFlag = (key: keyof typeof flags) => {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const loadMediaData = useCallback(async () => {
    setMediaLoading(true);
    try {
      const [recRes, connRes, jobsRes] = await Promise.all([
        api.get<{ recordings: any[] }>('/admin/nextgen/recordings'),
        api.get<{ connections: any[] }>('/admin/nextgen/youtube-connections'),
        api.get<{ jobs: any[] }>('/admin/nextgen/jobs'),
      ]);
      setRecordings(recRes.data.recordings || []);
      setConnections(connRes.data.connections || []);
      setJobs(jobsRes.data.jobs || []);
    } catch (err) {
      console.error('Failed loading media ops data', err);
    } finally {
      setMediaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'media') {
      void loadMediaData();
    }
  }, [activeTab, loadMediaData]);

  const handleSyncRecording = async (recId: string) => {
    try {
      setActionLoading(`sync-${recId}`);
      await api.post(`/admin/nextgen/recordings/${recId}/sync`);
      setMediaActionMessage('Recording metadata resynced successfully.');
      void loadMediaData();
    } catch {
      alert('Failed to resync recording metadata');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunJobs = async () => {
    try {
      setActionLoading('run-jobs');
      const res = await api.post<{ stats: { processed: number; succeeded: number; failed: number } }>(
        '/admin/nextgen/jobs/run',
        { limit: 10 }
      );
      setMediaActionMessage(
        `Batch processed: ${res.data.stats.succeeded} succeeded, ${res.data.stats.failed} failed.`
      );
      void loadMediaData();
    } catch {
      alert('Failed to execute job queue batch');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMediaCleanup = async () => {
    if (!confirm('Execute media sweep? This permanently removes abandoned uploads older than 24 hours.')) return;
    try {
      setActionLoading('cleanup-media');
      const res = await api.post<{ result: { scanned: number; deleted: number; errors: string[] } }>(
        '/admin/nextgen/media/cleanup',
        { cutoffHours: 24 }
      );
      setMediaActionMessage(
        `Sweep complete: Scanned ${res.data.result.scanned} files, deleted ${res.data.result.deleted}.`
      );
      void loadMediaData();
    } catch {
      alert('Failed running media sweep');
    } finally {
      setActionLoading(null);
    }
  };

  const handleModerationAction = async (reportId: string, action: 'resolve' | 'dismiss' | 'delete_content') => {
    setActionLoading(reportId);
    try {
      await api.post('/admin/moderation/action', {
        reportId,
        action,
        notes: `Executed ${action} via Next-Gen Control Plane`,
      });
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: action === 'dismiss' ? 'dismissed' : 'resolved' } : r)),
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to execute moderation action');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevealIdentity = async () => {
    if (!revealTarget || !revealJustification.trim()) return;
    setRevealLoading(true);
    try {
      const res = await api.post<{ success: boolean; scopedHandle: string; realUser: any }>(
        '/admin/moderation/reveal-identity',
        {
          reportId: revealTarget.id,
          entityType: revealTarget.target_type,
          entityId: revealTarget.target_id,
          justification: revealJustification.trim(),
        },
      );
      setRevealedResult(res.data);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Identity reveal failed or unauthorized');
    } finally {
      setRevealLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Operations & Reliability"
        title="Next-Gen Operations Control Plane"
        description="Unified management for Edge Gateway, Cloudflare R2, Multi-tier Rate Limiting, Push Notifications, and Safety-Audited Moderation."
        actions={
          <button className="btn-secondary" onClick={() => void loadData()}>
            <RefreshCw size={15} /> Refresh Telemetry
          </button>
        }
      />

      {loading ? (
        <section className="panel">
          <LoadingState label="Inspecting Next-Gen telemetry and providers…" />
        </section>
      ) : null}

      {error ? (
        <section className="panel">
          <ErrorState message={error} onRetry={() => void loadData()} />
        </section>
      ) : null}

      {!loading && !error ? (
        <>
          {/* Top Telemetry Stats */}
          <div className="stats-grid">
            <StatCard
              label="Active Rooms"
              value={String(telemetry?.activeRooms ?? 0)}
              detail="Live collaboration sessions"
              icon={Activity}
              tone="blue"
            />
            <StatCard
              label="Q&A Today"
              value={String(telemetry?.questionsToday ?? 0)}
              detail="Questions asked in last 24h"
              icon={Zap}
              tone="violet"
            />
            <StatCard
              label="Recordings Catalog"
              value={String(telemetry?.totalRecordings ?? 0)}
              detail="Indexed study archives"
              icon={Radio}
              tone="blue"
            />
            <StatCard
              label="Open Clash Proposals"
              value={String(telemetry?.openClashNegotiations ?? 0)}
              detail="Active club schedule resolutions"
              icon={AlertTriangle}
              tone="amber"
            />
            <StatCard
              label="Pending Reports"
              value={String(telemetry?.pendingReports ?? 0)}
              detail="Trust & safety queue"
              icon={Flag}
              tone={telemetry && telemetry.pendingReports > 0 ? 'red' : 'green'}
            />
          </div>

          {/* Subsystem Navigation Tabs */}
          <div className="mb-6 flex gap-2 border-b border-slate-200">
            <button
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'providers'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => setActiveTab('providers')}
            >
              Provider Health & Telemetry
            </button>
            <button
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'flags'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => setActiveTab('flags')}
            >
              Feature Flags & Kill Switches
            </button>
            <button
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'moderation'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => setActiveTab('moderation')}
            >
              Moderation Queue ({reports.filter((r) => r.status === 'open').length})
            </button>
            <button
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'audit'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => setActiveTab('audit')}
            >
              Moderation Audit Log ({auditLogs.length})
            </button>
            <button
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'media'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => setActiveTab('media')}
            >
              Media & Automation
            </button>
          </div>

          {/* TAB 1: PROVIDER HEALTH */}
          {activeTab === 'providers' && providers ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="panel p-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Globe className="text-blue-500" size={20} />
                    <h3 className="font-semibold text-slate-800">Cloudflare Edge Gateway</h3>
                  </div>
                  <StatusBadge value={providers.edgeGateway.status} />
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p><strong>Routing:</strong> SWR edge caching enabled</p>
                  <p><strong>Public Routes Cached:</strong> {providers.edgeGateway.routesCached} catalog endpoints</p>
                  <p><strong>Stale Fallback:</strong> Active on origin 5xx</p>
                </div>
              </div>

              <div className="panel p-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Server className="text-amber-500" size={20} />
                    <h3 className="font-semibold text-slate-800">Object Storage Provider</h3>
                  </div>
                  <StatusBadge value={providers.storage.activeProvider === 'r2' ? 'Cloudflare R2' : 'Supabase Storage'} />
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p><strong>Active Engine:</strong> {providers.storage.activeProvider.toUpperCase()}</p>
                  <p><strong>R2 Configured:</strong> {providers.storage.r2Configured ? 'Yes (SigV4 Presigner)' : 'Fallback Active'}</p>
                  <p><strong>CDN Domain:</strong> {providers.storage.publicDomain || 'Direct Gateway'}</p>
                </div>
              </div>

              <div className="panel p-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Database className="text-emerald-500" size={20} />
                    <h3 className="font-semibold text-slate-800">Supabase & PostgreSQL</h3>
                  </div>
                  <StatusBadge value={providers.supabase.status} />
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p><strong>Connection Status:</strong> {providers.supabase.status}</p>
                  <p><strong>Row Level Security:</strong> Active on migration 028, 029, 030</p>
                </div>
              </div>

              <div className="panel p-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Zap className="text-purple-500" size={20} />
                    <h3 className="font-semibold text-slate-800">Redis & Push Dispatcher</h3>
                  </div>
                  <StatusBadge value={providers.redis.status} />
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p><strong>Redis State:</strong> {providers.redis.status}</p>
                  <p><strong>Expo Push Engine:</strong> {providers.pushNotifications.status}</p>
                  <p><strong>LiveKit WebRTC:</strong> {providers.livekit.status}</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* TAB 2: FEATURE FLAGS & KILL SWITCHES */}
          {activeTab === 'flags' ? (
            <div className="panel p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Next-Gen Kill Switches & Feature Flags</h3>
              <p className="text-sm text-slate-500 mb-6">
                Instantly disable specific Next-Gen modules campus-wide in case of emergency without code redeployment.
              </p>

              <div className="space-y-4">
                {[
                  { key: 'nextgen_feed', label: 'Campus Feed & Anonymous Channels', desc: 'Controls public feed, anonymous posts, reactions, and threaded comments.' },
                  { key: 'nextgen_qna', label: 'Study Room Q&A Board', desc: 'Controls room questions, answers, and accepted solution verification.' },
                  { key: 'nextgen_recordings', label: 'Study Room Recordings Archive', desc: 'Controls YouTube and video session indexing for study rooms.' },
                  { key: 'nextgen_materials', label: 'Room Materials Hub (R2 / Supabase)', desc: 'Controls media object uploads, download tickets, and storage quotas.' },
                  { key: 'nextgen_clash_engine', label: 'Club OS Clash Detector & Negotiations', desc: 'Controls automated schedule conflict detection and cross-club negotiation workflows.' },
                ].map((item) => {
                  const enabled = flags[item.key as keyof typeof flags];
                  return (
                    <div key={item.key} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                      <div>
                        <p className="font-semibold text-slate-800">{item.label}</p>
                        <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
                      </div>
                      <button
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all"
                        style={{
                          backgroundColor: enabled ? '#10b981' : '#ef4444',
                          color: '#ffffff',
                          borderColor: 'transparent',
                        }}
                        onClick={() => toggleFlag(item.key as keyof typeof flags)}
                      >
                        {enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        {enabled ? 'Active' : 'Disabled'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* TAB 3: MODERATION QUEUE */}
          {activeTab === 'moderation' ? (
            <div className="panel">
              <div className="panel-header flex justify-between items-center p-4 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-900">Safety & Moderation Queue</h3>
                  <p className="text-xs text-slate-500">Reports targeting campus posts, comments, Q&A, and announcements.</p>
                </div>
              </div>

              {reports.length === 0 ? (
                <EmptyState title="No pending reports" detail="The Next-Gen moderation queue is clear." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-400 border-b border-slate-100">
                      <tr>
                        <th className="p-3">Target Entity</th>
                        <th className="p-3">Reason</th>
                        <th className="p-3">Details</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Author Identity</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reports.map((report) => (
                        <tr key={report.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-medium text-slate-900">
                            <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 uppercase font-mono">
                              {report.target_type}
                            </span>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">{report.target_id.slice(0, 8)}…</div>
                          </td>
                          <td className="p-3 font-semibold text-slate-800">{report.reason}</td>
                          <td className="p-3 text-xs max-w-xs truncate">{report.details || '—'}</td>
                          <td className="p-3"><StatusBadge value={report.status} /></td>
                          <td className="p-3">
                            {['post', 'comment'].includes(report.target_type) ? (
                              <button
                                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                onClick={() => {
                                  setRevealTarget(report);
                                  setRevealedResult(null);
                                  setRevealJustification('');
                                }}
                              >
                                <Eye size={13} />
                                Masked (Inspect)
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">Standard User</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {report.status === 'open' ? (
                              <div className="flex justify-end gap-1">
                                <button
                                  className="px-2 py-1 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  disabled={actionLoading === report.id}
                                  onClick={() => handleModerationAction(report.id, 'resolve')}
                                >
                                  Resolve
                                </button>
                                <button
                                  className="px-2 py-1 text-xs font-semibold rounded bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  disabled={actionLoading === report.id}
                                  onClick={() => handleModerationAction(report.id, 'delete_content')}
                                >
                                  Delete
                                </button>
                                <button
                                  className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  disabled={actionLoading === report.id}
                                  onClick={() => handleModerationAction(report.id, 'dismiss')}
                                >
                                  Dismiss
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Processed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {/* TAB 4: MODERATION AUDIT LOG */}
          {activeTab === 'audit' ? (
            <div className="panel">
              <div className="panel-header p-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900">Safety & Moderation Audit Trail</h3>
                <p className="text-xs text-slate-500">Immutable audit logs of all moderator actions, content takedowns, and identity reveals.</p>
              </div>

              {auditLogs.length === 0 ? (
                <EmptyState title="No audit entries" detail="No moderation actions recorded yet." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-400 border-b border-slate-100">
                      <tr>
                        <th className="p-3">Timestamp</th>
                        <th className="p-3">Moderator</th>
                        <th className="p-3">Action</th>
                        <th className="p-3">Target</th>
                        <th className="p-3">Reason / Justification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="p-3 text-xs text-slate-400 font-mono">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="p-3 font-semibold text-slate-800">
                            {log.admin?.full_name || 'System Admin'}
                          </td>
                          <td className="p-3 font-mono text-xs">
                            <span
                              className={`px-2 py-0.5 rounded ${
                                log.action.includes('reveal')
                                  ? 'bg-amber-100 text-amber-800 font-bold'
                                  : log.action.includes('delete')
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="p-3 text-xs font-mono">
                            {log.entity_type}:{log.entity_id.slice(0, 8)}
                          </td>
                          <td className="p-3 text-xs text-slate-700 max-w-sm truncate">
                            {log.reason || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {/* TAB 5: MEDIA & AUTOMATION */}
          {activeTab === 'media' ? (
            mediaLoading && recordings.length === 0 ? (
              <section className="panel">
                <LoadingState label="Inspecting media providers, channel links, and background jobs…" />
              </section>
            ) : (
              <div className="space-y-6">
                {mediaActionMessage ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center justify-between">
                    <span>{mediaActionMessage}</span>
                    <button className="text-emerald-600 font-bold" onClick={() => setMediaActionMessage('')}>✕</button>
                  </div>
                ) : null}

                {/* Status and Action Header */}
                <div className="grid gap-4 md:grid-cols-3">
                <div className="panel p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Film className="text-red-500" size={20} />
                    <h4 className="font-bold text-slate-800">YouTube OAuth Pipeline</h4>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <p>Status: <StatusBadge value={providers?.youtube?.oauthEnabled ? 'active' : 'unconfigured'} /></p>
                    <p>API Key: <span className="font-mono">{providers?.youtube?.hasApiKey ? 'Configured' : 'Missing (Using Fallback)'}</span></p>
                    <p>OAuth Secrets: <span className="font-mono">{providers?.youtube?.hasOAuthSecrets ? 'Configured' : 'Not Set'}</span></p>
                    <p>Active Channel Links: <span className="font-bold">{connections.length}</span></p>
                  </div>
                </div>

                <div className="panel p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Radio className="text-indigo-500" size={20} />
                    <h4 className="font-bold text-slate-800">LiveKit Egress Automation</h4>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <p>Status: <StatusBadge value={providers?.livekitEgress?.automatedRecordings ? 'active' : 'dormant'} /></p>
                    <p className="text-slate-500 mt-1">Egress automation is held disabled to prevent non-free cloud compute charges.</p>
                  </div>
                </div>

                <div className="panel p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="text-emerald-500" size={20} />
                    <h4 className="font-bold text-slate-800">Queue & Sweep Operations</h4>
                  </div>
                  <div className="flex flex-col gap-2 mt-3">
                    <button
                      className="btn-secondary text-xs flex items-center justify-center gap-1.5"
                      disabled={actionLoading === 'run-jobs'}
                      onClick={() => void handleRunJobs()}
                    >
                      <RefreshCw size={14} className={actionLoading === 'run-jobs' ? 'animate-spin' : ''} />
                      {actionLoading === 'run-jobs' ? 'Processing…' : 'Run Job Queue Batch'}
                    </button>
                    <button
                      className="btn-secondary text-xs flex items-center justify-center gap-1.5 text-rose-600 hover:text-rose-700"
                      disabled={actionLoading === 'cleanup-media'}
                      onClick={() => void handleMediaCleanup()}
                    >
                      <Trash2 size={14} />
                      {actionLoading === 'cleanup-media' ? 'Sweeping…' : 'Run Media Sweep (24h+)'}
                    </button>
                  </div>
                </div>
              </div>

              {/* YouTube Connections */}
              <div className="panel p-5">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Film size={18} className="text-red-500" /> Connected Teacher YouTube Channels ({connections.length})
                </h4>
                {connections.length === 0 ? (
                  <EmptyState title="No Connected Channels" detail="No teachers or creators have linked their YouTube channels yet." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                          <th className="p-2">Teacher / Creator</th>
                          <th className="p-2">Channel Title</th>
                          <th className="p-2">Channel ID</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Last Synced</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {connections.map((conn) => (
                          <tr key={conn.id} className="hover:bg-slate-50/50">
                            <td className="p-2 font-medium text-slate-800">
                              {conn.user?.full_name || 'Teacher'}
                            </td>
                            <td className="p-2 font-semibold text-indigo-600">
                              {conn.channel_title}
                            </td>
                            <td className="p-2 font-mono text-xs text-slate-500">{conn.channel_id}</td>
                            <td className="p-2">
                              <StatusBadge value={conn.status} />
                            </td>
                            <td className="p-2 text-xs text-slate-500">
                              {conn.last_synced_at ? new Date(conn.last_synced_at).toLocaleString() : 'Never'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Room Recordings Table */}
              <div className="panel p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    <Radio size={18} className="text-blue-500" /> Room Recordings Archive ({recordings.length})
                  </h4>
                  <button className="btn-secondary text-xs" onClick={() => void loadMediaData()}>
                    <RefreshCw size={13} /> Refresh
                  </button>
                </div>
                {recordings.length === 0 ? (
                  <EmptyState title="No Recordings Found" detail="No room recordings found in archive." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                          <th className="p-2">Title</th>
                          <th className="p-2">Room</th>
                          <th className="p-2">Video ID</th>
                          <th className="p-2">Duration</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {recordings.map((rec) => (
                          <tr key={rec.id} className="hover:bg-slate-50/50">
                            <td className="p-2 max-w-xs truncate font-medium text-slate-800">
                              {rec.title}
                            </td>
                            <td className="p-2 text-xs text-slate-600">{rec.room?.title || rec.room_id?.slice(0, 8)}</td>
                            <td className="p-2 font-mono text-xs text-indigo-600">
                              {rec.youtube_video_id || '—'}
                            </td>
                            <td className="p-2 text-xs text-slate-500">
                              {rec.duration_seconds ? `${Math.floor(rec.duration_seconds / 60)}m ${rec.duration_seconds % 60}s` : '—'}
                            </td>
                            <td className="p-2">
                              <StatusBadge value={rec.status || 'ready'} />
                            </td>
                            <td className="p-2 flex items-center gap-2">
                              {rec.youtube_video_id ? (
                                <a
                                  href={`https://www.youtube.com/watch?v=${rec.youtube_video_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                >
                                  Watch <ExternalLink size={12} />
                                </a>
                              ) : null}
                              <button
                                className="px-2 py-1 text-xs rounded bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
                                disabled={actionLoading === `sync-${rec.id}`}
                                onClick={() => void handleSyncRecording(rec.id)}
                              >
                                {actionLoading === `sync-${rec.id}` ? 'Syncing…' : 'Sync Meta'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Background Jobs Queue */}
              <div className="panel p-5">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Clock size={18} className="text-violet-500" /> Recent Background Jobs ({jobs.length})
                </h4>
                {jobs.length === 0 ? (
                  <EmptyState title="No Jobs Found" detail="No background jobs currently logged in the queue." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                          <th className="p-2">Job Type</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Attempts</th>
                          <th className="p-2">Scheduled / Error</th>
                          <th className="p-2">Created At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {jobs.map((job) => (
                          <tr key={job.id} className="hover:bg-slate-50/50">
                            <td className="p-2 font-mono text-xs font-bold text-slate-800">{job.job_type}</td>
                            <td className="p-2">
                              <StatusBadge value={job.status} />
                            </td>
                            <td className="p-2 text-xs font-mono text-slate-600">
                              {job.attempts} / {job.max_attempts}
                            </td>
                            <td className="p-2 text-xs text-rose-600 max-w-xs truncate">
                              {job.last_error || '—'}
                            </td>
                            <td className="p-2 text-xs text-slate-500">
                              {new Date(job.created_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )) : null}

          {/* IDENTITY REVEAL MODAL */}
          {revealTarget ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="text-amber-500" size={22} />
                    <h3 className="font-bold text-slate-900">Protected Identity Reveal</h3>
                  </div>
                  <button
                    className="text-slate-400 hover:text-slate-600"
                    onClick={() => {
                      setRevealTarget(null);
                      setRevealedResult(null);
                    }}
                  >
                    <XCircle size={20} />
                  </button>
                </div>

                <div className="mt-4 space-y-4 text-sm text-slate-600">
                  <p>
                    Target: <strong className="font-mono text-slate-900">{revealTarget.target_type} {revealTarget.target_id.slice(0, 8)}…</strong>
                  </p>
                  <p className="text-xs text-slate-500">
                    Deanonymization is strictly audited under SkillBridge Trust & Safety policies. All reveals are logged in the immutable audit trail with your admin identity.
                  </p>

                  {!revealedResult ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mandatory Justification (Min 10 chars):
                      </label>
                      <textarea
                        className="w-full p-2.5 rounded-lg border border-slate-200 text-sm focus:border-indigo-500 focus:outline-none"
                        rows={3}
                        placeholder="Explain why this identity reveal is required for moderation or safety investigation…"
                        value={revealJustification}
                        onChange={(e) => setRevealJustification(e.target.value)}
                      />
                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => setRevealTarget(null)}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                          disabled={revealLoading || revealJustification.trim().length < 10}
                          onClick={() => void handleRevealIdentity()}
                        >
                          {revealLoading ? 'Authorizing…' : 'Confirm Reveal & Log Audit'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center gap-2 text-emerald-600 font-semibold text-xs">
                        <CheckCircle2 size={16} /> Identity Revealed & Audit Logged
                      </div>
                      <p><strong>Handle:</strong> {revealedResult.scopedHandle}</p>
                      <p><strong>Full Name:</strong> {revealedResult.realUser?.full_name}</p>
                      <p><strong>Username:</strong> @{revealedResult.realUser?.username}</p>
                      <p><strong>Email:</strong> {revealedResult.realUser?.email || 'Confidential'}</p>
                      <p><strong>Department:</strong> {revealedResult.realUser?.department || 'N/A'}</p>
                      <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => {
                            setRevealTarget(null);
                            setRevealedResult(null);
                          }}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
