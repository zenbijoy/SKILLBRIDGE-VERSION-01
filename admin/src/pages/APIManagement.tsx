import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BrainCircuit,
  CheckCircle2,
  CloudCog,
  ExternalLink,
  HardDrive,
  Key,
  Plus,
  RadioTower,
  RefreshCw,
  Server,
  ShieldAlert,
  Smartphone,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/ToastContext';
import type { SystemInfo } from '../types/admin';

interface ApiKeyItem {
  id: string;
  service: string;
  keyName: string;
  maskedKey: string;
  apiSecretSet: boolean;
  baseUrl: string | null;
  monthlyLimit: number;
  currentUsage: number;
  isActive: boolean;
  isEnabled: boolean;
  usagePercent: number;
  createdAt: string;
}

interface StoragePoolItem {
  id: string;
  name: string;
  accountId: string;
  bucketName: string;
  publicDomain?: string;
  maxCapacityBytes: number;
  usedBytes: number;
  fileCount: number;
  status: 'active' | 'full' | 'standby' | 'disabled';
  priority?: number;
}

export default function APIManagement() {
  const [params, setParams] = useSearchParams();
  const activeTab = (params.get('tab') as 'keys' | 'storage' | 'runtime') || 'keys';
  const { success, error: toastError } = useToast();

  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [livekitInfo, setLivekitInfo] = useState<{ freeMonthlyMinutes: number; note: string } | null>(null);
  const [storagePools, setStoragePools] = useState<StoragePoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [showAddKeyModal, setShowAddKeyModal] = useState(params.get('action') === 'add-key');
  const [showAddPoolModal, setShowAddPoolModal] = useState(params.get('action') === 'add-pool');
  const [submitting, setSubmitting] = useState(false);

  // New Key Form State
  const [keyForm, setKeyForm] = useState({
    service: 'livekit',
    keyName: '',
    apiKey: '',
    apiSecret: '',
    baseUrl: '',
    monthlyLimit: 10000,
    isEnabled: true,
  });

  // New Storage Pool Form State
  const [poolForm, setPoolForm] = useState({
    name: '',
    accountId: '',
    bucketName: '',
    accessKeyId: '',
    secretAccessKey: '',
    publicDomain: '',
    maxCapacityGb: 10,
    setAsActive: false,
  });
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sysRes, keysRes, storageRes] = await Promise.all([
        api.get<SystemInfo>('/admin/system').catch(() => null),
        api.get<{ apiKeys: ApiKeyItem[]; livekitFreeTier: any }>('/admin/api-keys').catch(() => null),
        api.get<{ pools: StoragePoolItem[] }>('/admin/storage/pools').catch(() => null),
      ]);

      if (sysRes?.data) setSystem(sysRes.data);
      if (keysRes?.data) {
        setApiKeys(keysRes.data.apiKeys || []);
        setLivekitInfo(keysRes.data.livekitFreeTier || null);
      }
      if (storageRes?.data) {
        setStoragePools(storageRes.data.pools || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations and API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const setTab = (tab: 'keys' | 'storage' | 'runtime') => {
    setParams({ tab });
  };

  // --- API Key Handlers ---
  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyForm.keyName.trim() || !keyForm.apiKey.trim()) {
      toastError('Key Name and API Key are required.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/admin/api-keys', {
        service: keyForm.service,
        keyName: keyForm.keyName.trim(),
        apiKey: keyForm.apiKey.trim(),
        apiSecret: keyForm.apiSecret.trim() || undefined,
        baseUrl: keyForm.baseUrl.trim() || undefined,
        monthlyLimit: Number(keyForm.monthlyLimit) || 10000,
        isEnabled: keyForm.isEnabled,
      });
      success(`API Key "${keyForm.keyName}" created and assigned successfully.`);
      setShowAddKeyModal(false);
      setKeyForm({
        service: 'livekit',
        keyName: '',
        apiKey: '',
        apiSecret: '',
        baseUrl: '',
        monthlyLimit: 10000,
        isEnabled: true,
      });
      void loadData();
    } catch (err: any) {
      toastError(err?.message || 'Failed to register API key.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleKey = async (id: string, currentlyEnabled: boolean) => {
    try {
      await api.post(`/admin/api-keys/${id}/toggle`, { isEnabled: !currentlyEnabled });
      success(`Key state updated.`);
      setApiKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, isEnabled: !currentlyEnabled } : k))
      );
    } catch (err: any) {
      toastError(err?.message || 'Failed to toggle API key state.');
    }
  };

  const handleDeleteKey = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the key "${name}"? This action is audited.`)) return;
    try {
      await api.delete(`/admin/api-keys/${id}`);
      success(`API key deleted.`);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err: any) {
      toastError(err?.message || 'Failed to delete key.');
    }
  };

  // --- Storage Pool Handlers ---
  const handleTestPoolCredentials = async () => {
    if (!poolForm.accountId || !poolForm.bucketName || !poolForm.accessKeyId || !poolForm.secretAccessKey) {
      toastError('Fill in Account ID, Bucket, and Access Keys before testing.');
      return;
    }

    setTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const res = await api.post<{ success: boolean; message: string }>('/admin/storage/pools/test', {
        accountId: poolForm.accountId.trim(),
        bucketName: poolForm.bucketName.trim(),
        accessKeyId: poolForm.accessKeyId.trim(),
        secretAccessKey: poolForm.secretAccessKey.trim(),
      });
      setConnectionTestResult(res.data);
      if (res.data.success) {
        success('Storage credentials verified! Bucket reachable.');
      } else {
        toastError(res.data.message || 'Verification failed.');
      }
    } catch (err: any) {
      setConnectionTestResult({ success: false, message: err?.message || 'Connection test failed.' });
      toastError(err?.message || 'Connection test failed.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleCreatePool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poolForm.name || !poolForm.accountId || !poolForm.bucketName || !poolForm.accessKeyId || !poolForm.secretAccessKey) {
      toastError('All bucket credentials and identifiers are required.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/admin/storage/pools', {
        name: poolForm.name.trim(),
        accountId: poolForm.accountId.trim(),
        bucketName: poolForm.bucketName.trim(),
        accessKeyId: poolForm.accessKeyId.trim(),
        secretAccessKey: poolForm.secretAccessKey.trim(),
        publicDomain: poolForm.publicDomain.trim() || undefined,
        maxCapacityGb: Number(poolForm.maxCapacityGb) || 10,
        setAsActive: poolForm.setAsActive,
      });
      success(`Storage pool "${poolForm.name}" created successfully.`);
      setShowAddPoolModal(false);
      setConnectionTestResult(null);
      setPoolForm({
        name: '',
        accountId: '',
        bucketName: '',
        accessKeyId: '',
        secretAccessKey: '',
        publicDomain: '',
        maxCapacityGb: 10,
        setAsActive: false,
      });
      void loadData();
    } catch (err: any) {
      toastError(err?.message || 'Failed to create storage pool.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetPoolActive = async (id: string, name: string) => {
    try {
      await api.patch(`/admin/storage/pools/${id}`, { status: 'active' });
      success(`Pool "${name}" marked as active.`);
      void loadData();
    } catch (err: any) {
      toastError(err?.message || 'Failed to update pool status.');
    }
  };

  const handleDeletePool = async (id: string, name: string) => {
    if (!window.confirm(`Delete storage pool "${name}"? Recorded files remain in Cloudflare R2.`)) return;
    try {
      await api.delete(`/admin/storage/pools/${id}`);
      success(`Storage pool removed.`);
      setStoragePools((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      toastError(err?.message || 'Failed to delete pool.');
    }
  };

  const capabilities = system
    ? [
        { name: 'Redis', enabled: system.capabilities.redis, icon: Server, detail: 'Caching, presence and distributed coordination capability.' },
        { name: 'LiveKit', enabled: system.capabilities.livekit, icon: RadioTower, detail: 'Real-time audio/video SFU learning room infrastructure.' },
        { name: 'Expo Push', enabled: system.capabilities.push, icon: Smartphone, detail: 'Mobile push notification delivery engine.' },
        { name: 'AI Engine', enabled: system.capabilities.ai, icon: BrainCircuit, detail: 'AI assistance, quiz generation and semantic tutor search.' },
      ]
    : [];

  return (
    <div>
      <PageHeader
        eyebrow="Infrastructure & Credentials"
        title="Integrations & API Control"
        description="Full control over provider API keys, quota caps, and multi-bucket Cloudflare R2 object storage."
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => void loadData()}>
              <RefreshCw size={15} /> Refresh
            </button>
            {activeTab === 'keys' && (
              <button className="btn-primary" onClick={() => setShowAddKeyModal(true)}>
                <Plus size={16} /> Add API Key
              </button>
            )}
            {activeTab === 'storage' && (
              <button className="btn-primary" onClick={() => setShowAddPoolModal(true)}>
                <Plus size={16} /> Add Storage Pool
              </button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-200 pb-3">
        <button
          onClick={() => setTab('keys')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'keys'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Key size={15} /> API Keys &amp; Quotas
          <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
            {apiKeys.length}
          </span>
        </button>

        <button
          onClick={() => setTab('storage')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'storage'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <HardDrive size={15} /> Cloudflare R2 Pools
          <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
            {storagePools.length}
          </span>
        </button>

        <button
          onClick={() => setTab('runtime')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'runtime'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <CloudCog size={15} /> Runtime Status
        </button>
      </div>

      {loading ? (
        <section className="panel"><LoadingState label="Inspecting credentials and infrastructure status…" /></section>
      ) : error ? (
        <section className="panel"><ErrorState message={error} onRetry={() => void loadData()} /></section>
      ) : (
        <>
          {/* TAB 1: API KEYS */}
          {activeTab === 'keys' && (
            <div className="space-y-6">
              {livekitInfo && (
                <div className="panel p-4 bg-gradient-to-r from-blue-50/70 to-indigo-50/50 border-blue-200/80 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-sm">
                      <RadioTower size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">LiveKit Cloud Tier Advisory</h4>
                      <p className="text-[11px] text-slate-600 mt-0.5">{livekitInfo.note}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-blue-700 shrink-0">
                    {livekitInfo.freeMonthlyMinutes.toLocaleString()} min/mo free
                  </span>
                </div>
              )}

              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Active Provider API Credentials</h2>
                    <p className="panel-subtitle">Keys are securely masked and validated against server runtime policies.</p>
                  </div>
                  <button className="btn-secondary text-xs" onClick={() => setShowAddKeyModal(true)}>
                    <Plus size={14} /> Add Key
                  </button>
                </div>

                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Name &amp; Key</th>
                        <th>Quota Usage</th>
                        <th>State</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                            No provider API keys configured in the database. Add keys to enable dynamic rotation.
                          </td>
                        </tr>
                      ) : (
                        apiKeys.map((key) => {
                          const isNearLimit = key.usagePercent >= 80;
                          const isAtLimit = key.usagePercent >= 95;
                          return (
                            <tr key={key.id}>
                              <td>
                                <span className="font-mono text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                                  {key.service}
                                </span>
                              </td>
                              <td>
                                <strong className="text-xs text-slate-900 block">{key.keyName}</strong>
                                <span className="font-mono text-[11px] text-slate-500">{key.maskedKey}</span>
                                {key.baseUrl && (
                                  <span className="block text-[10px] text-slate-400 truncate max-w-xs">
                                    {key.baseUrl}
                                  </span>
                                )}
                              </td>
                              <td className="w-48">
                                <div className="flex items-center justify-between text-[11px] mb-1">
                                  <span className="font-mono text-slate-700">
                                    {key.currentUsage.toLocaleString()} / {key.monthlyLimit.toLocaleString()}
                                  </span>
                                  <span
                                    className={`font-bold font-mono text-[10px] ${
                                      isAtLimit ? 'text-red-600' : isNearLimit ? 'text-amber-600' : 'text-slate-500'
                                    }`}
                                  >
                                    {key.usagePercent}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      isAtLimit
                                        ? 'bg-red-500'
                                        : isNearLimit
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(100, key.usagePercent)}%` }}
                                  />
                                </div>
                              </td>
                              <td>
                                <div className="flex items-center gap-1.5">
                                  {key.isActive ? (
                                    <span className="badge badge-success text-[10px]">Active</span>
                                  ) : (
                                    <span className="badge badge-neutral text-[10px]">Standby</span>
                                  )}
                                  <button
                                    onClick={() => handleToggleKey(key.id, key.isEnabled)}
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded transition ${
                                      key.isEnabled
                                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                    }`}
                                    title="Toggle enabled state"
                                  >
                                    {key.isEnabled ? 'Enabled' : 'Disabled'}
                                  </button>
                                </div>
                              </td>
                              <td>
                                <button
                                  onClick={() => handleDeleteKey(key.id, key.keyName)}
                                  className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition"
                                  title="Delete API key"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: STORAGE POOLS */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Cloudflare R2 Object Storage Pools</h2>
                    <p className="panel-subtitle">Multi-bucket storage pools for recorded sessions, media assets, and classroom files.</p>
                  </div>
                  <button className="btn-secondary text-xs" onClick={() => setShowAddPoolModal(true)}>
                    <Plus size={14} /> Add Storage Pool
                  </button>
                </div>

                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Pool Name</th>
                        <th>Bucket &amp; Account</th>
                        <th>Public CDN Domain</th>
                        <th>Capacity Utilization</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {storagePools.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                            No external R2 storage pools configured. Falling back to local/default storage.
                          </td>
                        </tr>
                      ) : (
                        storagePools.map((pool) => {
                          const usedGb = (pool.usedBytes / (1024 * 1024 * 1024)).toFixed(2);
                          const maxGb = (pool.maxCapacityBytes / (1024 * 1024 * 1024)).toFixed(0);
                          const percent = pool.maxCapacityBytes > 0 ? Math.round((pool.usedBytes / pool.maxCapacityBytes) * 100) : 0;

                          return (
                            <tr key={pool.id}>
                              <td>
                                <strong className="text-xs text-slate-900 block">{pool.name}</strong>
                                <span className="text-[10px] text-slate-400">{pool.fileCount} stored objects</span>
                              </td>
                              <td>
                                <span className="font-mono text-xs font-bold text-slate-800">{pool.bucketName}</span>
                                <span className="block text-[10px] text-slate-400 font-mono">Acct: {pool.accountId.slice(0, 10)}…</span>
                              </td>
                              <td>
                                {pool.publicDomain ? (
                                  <a
                                    href={pool.publicDomain}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                  >
                                    {pool.publicDomain.replace(/^https?:\/\//, '')}
                                    <ExternalLink size={12} />
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-400">Direct S3 API only</span>
                                )}
                              </td>
                              <td className="w-40">
                                <div className="text-[11px] font-mono text-slate-700 flex justify-between mb-1">
                                  <span>{usedGb} GB / {maxGb} GB</span>
                                  <span className="font-bold">{percent}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                                  <div
                                    className={`h-full rounded-full ${
                                      percent > 90 ? 'bg-red-500' : percent > 75 ? 'bg-amber-500' : 'bg-blue-600'
                                    }`}
                                    style={{ width: `${Math.min(100, percent)}%` }}
                                  />
                                </div>
                              </td>
                              <td>
                                <StatusBadge value={pool.status} />
                              </td>
                              <td>
                                <div className="flex items-center gap-2">
                                  {pool.status !== 'active' && (
                                    <button
                                      onClick={() => handleSetPoolActive(pool.id, pool.name)}
                                      className="btn-secondary py-1 px-2 text-[11px]"
                                    >
                                      Make Active
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeletePool(pool.id, pool.name)}
                                    className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition"
                                    title="Delete pool"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: RUNTIME STATUS */}
          {activeTab === 'runtime' && system && (
            <div className="space-y-6">
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">API Runtime Telemetry</h2>
                    <p className="panel-subtitle">Authenticated backend operational health status.</p>
                  </div>
                  <CloudCog size={18} className="text-blue-600" />
                </div>
                <div className="panel-body detail-grid">
                  <div className="detail-item"><label>API status</label><div className="mt-2"><StatusBadge value={system.api.status} /></div></div>
                  <div className="detail-item"><label>Environment</label><span>{system.environment}</span></div>
                  <div className="detail-item"><label>Port</label><span>{String(system.api.port)}</span></div>
                  <div className="detail-item"><label>Uptime</label><span>{formatUptime(system.api.uptimeSeconds)}</span></div>
                  <div className="detail-item"><label>Global Rate Limit</label><span>{system.runtimePolicy.globalRateLimitPerMinute}/minute</span></div>
                  <div className="detail-item"><label>Started At</label><span>{new Date(system.api.startedAt).toLocaleString()}</span></div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Subsystem Capabilities</h2>
                    <p className="panel-subtitle">Green indicates configured server-side environment variables.</p>
                  </div>
                </div>
                <div className="panel-body capability-grid">
                  {capabilities.map(({ name, enabled, icon: Icon, detail }) => (
                    <div className="capability-card" key={name}>
                      <div className={`capability-dot ${enabled ? 'capability-on' : 'capability-off'}`} />
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="text-slate-500" />
                        <strong>{name}</strong>
                      </div>
                      <p>{detail}</p>
                      <div className="mt-3">
                        <StatusBadge value={enabled ? 'configured' : 'not configured'} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {/* MODAL: ADD API KEY */}
      {showAddKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Key size={18} className="text-blue-600" /> Add Provider API Key
              </h3>
              <button
                onClick={() => setShowAddKeyModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Provider Service</label>
                <select
                  value={keyForm.service}
                  onChange={(e) => setKeyForm({ ...keyForm, service: e.target.value })}
                  className="field w-full text-xs"
                >
                  <option value="livekit">LiveKit SFU (WebRTC Audio &amp; Video)</option>
                  <option value="gemini">Google Gemini AI (Key Pool Rotation)</option>
                  <option value="youtube">YouTube Data API (Lectures &amp; Channels)</option>
                  <option value="push">Expo Push Notification Gateway</option>
                  <option value="ai">Custom AI Provider / Endpoint</option>
                  <option value="turn">Coturn / STUN-TURN Server</option>
                  <option value="other">Other Service</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Key Label / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. LiveKit Production Primary"
                  value={keyForm.keyName}
                  onChange={(e) => setKeyForm({ ...keyForm, keyName: e.target.value })}
                  className="field w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">API Key / Token</label>
                <input
                  type="password"
                  required
                  placeholder="Paste raw API credential"
                  value={keyForm.apiKey}
                  onChange={(e) => setKeyForm({ ...keyForm, apiKey: e.target.value })}
                  className="field w-full text-xs font-mono"
                />
              </div>

              {(keyForm.service === 'livekit' || keyForm.service === 'other') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">API Secret (Optional)</label>
                  <input
                    type="password"
                    placeholder="LiveKit Secret or Provider Secret"
                    value={keyForm.apiSecret}
                    onChange={(e) => setKeyForm({ ...keyForm, apiSecret: e.target.value })}
                    className="field w-full text-xs font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Host / Base URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://your-livekit.cloud or https://api.openai.com"
                  value={keyForm.baseUrl}
                  onChange={(e) => setKeyForm({ ...keyForm, baseUrl: e.target.value })}
                  className="field w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Monthly Quota Limit</label>
                <input
                  type="number"
                  min={1}
                  max={10000000}
                  value={keyForm.monthlyLimit}
                  onChange={(e) => setKeyForm({ ...keyForm, monthlyLimit: Number(e.target.value) })}
                  className="field w-full text-xs font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Threshold alerts fire when usage reaches 80% and 95%.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="key_enabled"
                  checked={keyForm.isEnabled}
                  onChange={(e) => setKeyForm({ ...keyForm, isEnabled: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <label htmlFor="key_enabled" className="text-xs text-slate-700 font-semibold cursor-pointer">
                  Activate this key immediately
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddKeyModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs">
                  {submitting ? 'Registering…' : 'Register Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD STORAGE POOL */}
      {showAddPoolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <HardDrive size={18} className="text-blue-600" /> Add Cloudflare R2 Storage Pool
              </h3>
              <button
                onClick={() => setShowAddPoolModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePool} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pool Name / Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Primary Recordings R2"
                  value={poolForm.name}
                  onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })}
                  className="field w-full text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cloudflare Account ID</label>
                  <input
                    type="text"
                    required
                    placeholder="Account Hex ID"
                    value={poolForm.accountId}
                    onChange={(e) => setPoolForm({ ...poolForm, accountId: e.target.value })}
                    className="field w-full text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">R2 Bucket Name</label>
                  <input
                    type="text"
                    required
                    placeholder="skillbridge-media"
                    value={poolForm.bucketName}
                    onChange={(e) => setPoolForm({ ...poolForm, bucketName: e.target.value })}
                    className="field w-full text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Access Key ID</label>
                  <input
                    type="password"
                    required
                    placeholder="S3 API Access Key"
                    value={poolForm.accessKeyId}
                    onChange={(e) => setPoolForm({ ...poolForm, accessKeyId: e.target.value })}
                    className="field w-full text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Secret Access Key</label>
                  <input
                    type="password"
                    required
                    placeholder="S3 API Secret Key"
                    value={poolForm.secretAccessKey}
                    onChange={(e) => setPoolForm({ ...poolForm, secretAccessKey: e.target.value })}
                    className="field w-full text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Public CDN Domain (Optional)</label>
                  <input
                    type="url"
                    placeholder="https://media.myschool.edu"
                    value={poolForm.publicDomain}
                    onChange={(e) => setPoolForm({ ...poolForm, publicDomain: e.target.value })}
                    className="field w-full text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Max Capacity (GB)</label>
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={poolForm.maxCapacityGb}
                    onChange={(e) => setPoolForm({ ...poolForm, maxCapacityGb: Number(e.target.value) })}
                    className="field w-full text-xs font-mono"
                  />
                </div>
              </div>

              {connectionTestResult && (
                <div
                  className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                    connectionTestResult.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {connectionTestResult.success ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  ) : (
                    <ShieldAlert size={16} className="text-rose-600 shrink-0" />
                  )}
                  <span>{connectionTestResult.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={testingConnection}
                  onClick={handleTestPoolCredentials}
                  className="btn-ghost text-xs text-blue-600 flex items-center gap-1.5"
                >
                  <Wrench size={13} /> {testingConnection ? 'Testing R2…' : 'Test Connectivity'}
                </button>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="set_active"
                    checked={poolForm.setAsActive}
                    onChange={(e) => setPoolForm({ ...poolForm, setAsActive: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  <label htmlFor="set_active" className="text-xs text-slate-700 font-semibold cursor-pointer">
                    Set as active pool
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddPoolModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs">
                  {submitting ? 'Creating Pool…' : 'Create Pool'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}
