import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Gauge,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wrench,
} from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/States';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/ToastContext';
import type { SystemInfo } from '../types/admin';

interface VersionControlConfig {
  id: string;
  min_supported_version: string;
  recommended_version: string;
  maintenance_mode: boolean;
  maintenance_message: string;
  update_prompt_enabled: boolean;
  update_title: string;
  update_message: string;
  store_url_android: string | null;
  store_url_ios: string | null;
}

interface VersionAdoptionItem {
  version: string;
  count: number;
}

export default function RulesEngine() {
  const { success, error: toastError } = useToast();
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [versionConfig, setVersionConfig] = useState<VersionControlConfig | null>(null);
  const [adoption, setAdoption] = useState<VersionAdoptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [savingRelease, setSavingRelease] = useState(false);
  const [error, setError] = useState('');

  // Cache clear modal
  const [cacheTarget, setCacheTarget] = useState<'dashboard' | 'catalog' | 'rooms' | null>(null);
  const [cacheReason, setCacheReason] = useState('');
  const [clearingCache, setClearingCache] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sysRes, verRes] = await Promise.all([
        api.get<SystemInfo>('/admin/system').catch(() => null),
        api.get<{ config: VersionControlConfig; adoption: VersionAdoptionItem[] }>('/admin/version-control').catch(() => null),
      ]);

      if (sysRes?.data) setSystem(sysRes.data);
      if (verRes?.data) {
        setVersionConfig(verRes.data.config);
        setAdoption(verRes.data.adoption || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load runtime policy and version control');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Save Maintenance Mode
  const handleSaveMaintenance = async () => {
    if (!versionConfig) return;
    setSavingMaintenance(true);
    try {
      const res = await api.patch<{ config: VersionControlConfig }>('/admin/version-control', {
        maintenance_mode: versionConfig.maintenance_mode,
        maintenance_message: versionConfig.maintenance_message.trim(),
      });
      setVersionConfig(res.data.config);
      success(
        `Maintenance mode ${
          res.data.config.maintenance_mode ? 'ACTIVATED' : 'DEACTIVATED'
        } successfully.`
      );
    } catch (err: any) {
      toastError(err?.message || 'Failed to update maintenance settings.');
    } finally {
      setSavingMaintenance(false);
    }
  };

  // Save App Release & Version Rules
  const handleSaveRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionConfig) return;
    setSavingRelease(true);
    try {
      const res = await api.patch<{ config: VersionControlConfig }>('/admin/version-control', {
        min_supported_version: versionConfig.min_supported_version.trim(),
        recommended_version: versionConfig.recommended_version.trim(),
        update_prompt_enabled: versionConfig.update_prompt_enabled,
        update_title: versionConfig.update_title.trim(),
        update_message: versionConfig.update_message.trim(),
        store_url_android: versionConfig.store_url_android?.trim() || null,
        store_url_ios: versionConfig.store_url_ios?.trim() || null,
      });
      setVersionConfig(res.data.config);
      success('App version governance and update policies updated.');
    } catch (err: any) {
      toastError(err?.message || 'Failed to update version governance.');
    } finally {
      setSavingRelease(false);
    }
  };

  // Invalidate Cache
  const handleExecuteCacheClear = async () => {
    if (!cacheTarget) return;
    if (cacheReason.trim().length < 3) {
      toastError('Please enter a descriptive reason for invalidating this cache.');
      return;
    }

    setClearingCache(true);
    try {
      await api.post(`/admin/cache/clear/${cacheTarget}`, {
        reason: cacheReason.trim(),
      });
      success(`Successfully purged ${cacheTarget} cache.`);
      setCacheTarget(null);
      setCacheReason('');
    } catch (err: any) {
      toastError(err?.message || 'Failed to clear cache.');
    } finally {
      setClearingCache(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Platform Policy & Governance"
        title="Runtime Policy & Release Control"
        description="Direct administrative control over maintenance mode, client app version requirements, and distributed cache invalidation."
        actions={
          <button className="btn-secondary" onClick={() => void loadData()}>
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />

      {loading ? (
        <section className="panel"><LoadingState label="Reading platform policies and version control state…" /></section>
      ) : error ? (
        <section className="panel"><ErrorState message={error} onRetry={() => void loadData()} /></section>
      ) : (
        <div className="space-y-6">
          {/* Top KPI row */}
          <div className="stats-grid">
            <StatCard
              label="Maintenance Mode"
              value={versionConfig?.maintenance_mode ? 'Active' : 'Disabled'}
              detail={versionConfig?.maintenance_mode ? 'Public traffic paused' : 'Normal platform operations'}
              icon={Wrench}
              tone={versionConfig?.maintenance_mode ? 'red' : 'green'}
            />
            <StatCard
              label="Minimum Supported App"
              value={versionConfig?.min_supported_version || '2.0.0'}
              detail={`Recommended: ${versionConfig?.recommended_version || '2.1.0'}`}
              icon={Smartphone}
              tone="blue"
            />
            <StatCard
              label="Global Rate Limit"
              value={`${system?.runtimePolicy.globalRateLimitPerMinute || 120}/min`}
              detail="Express server-side rate limiter"
              icon={Gauge}
              tone="violet"
            />
            <StatCard
              label="Database Status"
              value={system?.database.status || 'operational'}
              detail="Policy source API connected"
              icon={ShieldCheck}
              tone={system?.database.status === 'operational' ? 'green' : 'red'}
            />
          </div>

          {/* Section 1: Maintenance Mode Control */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title flex items-center gap-2">
                  <Wrench size={18} className="text-amber-600" /> Platform Maintenance Mode
                </h2>
                <p className="panel-subtitle">
                  When enabled, non-admin mobile and web users are greeted with the maintenance screen.
                </p>
              </div>
              <StatusBadge value={versionConfig?.maintenance_mode ? 'maintenance active' : 'operational'} />
            </div>

            <div className="panel-body space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                <div>
                  <strong className="text-sm text-slate-900 block">Emergency Maintenance Switch</strong>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Toggle this switch to immediately put the entire SkillBridge platform into maintenance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (versionConfig) {
                      setVersionConfig({
                        ...versionConfig,
                        maintenance_mode: !versionConfig.maintenance_mode,
                      });
                    }
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                    versionConfig?.maintenance_mode
                      ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
                      : 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                  }`}
                >
                  <Wrench size={14} />
                  {versionConfig?.maintenance_mode ? 'Maintenance: ENABLED' : 'Maintenance: DISABLED'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Public Maintenance Message
                </label>
                <textarea
                  rows={2}
                  className="field w-full text-xs font-sans"
                  placeholder="SkillBridge is undergoing scheduled maintenance..."
                  value={versionConfig?.maintenance_message || ''}
                  onChange={(e) => {
                    if (versionConfig) {
                      setVersionConfig({ ...versionConfig, maintenance_message: e.target.value });
                    }
                  }}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  This message is dynamically fetched and displayed on the mobile app and web portal.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={savingMaintenance}
                  onClick={handleSaveMaintenance}
                  className="btn-primary text-xs flex items-center gap-2"
                >
                  <Save size={14} />
                  {savingMaintenance ? 'Saving…' : 'Save Maintenance Policy'}
                </button>
              </div>
            </div>
          </section>

          {/* Section 2: App Version Governance & Release Operations */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title flex items-center gap-2">
                  <Smartphone size={18} className="text-blue-600" /> App Version Governance &amp; Force Updates
                </h2>
                <p className="panel-subtitle">
                  Enforce minimum supported client versions and manage update prompt overlays.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveRelease} className="panel-body space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Minimum Supported App Version (SemVer)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="2.0.0"
                    value={versionConfig?.min_supported_version || ''}
                    onChange={(e) => {
                      if (versionConfig) {
                        setVersionConfig({ ...versionConfig, min_supported_version: e.target.value });
                      }
                    }}
                    className="field w-full text-xs font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Clients with a version below this will be blocked until updated.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Recommended App Version (SemVer)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="2.1.0"
                    value={versionConfig?.recommended_version || ''}
                    onChange={(e) => {
                      if (versionConfig) {
                        setVersionConfig({ ...versionConfig, recommended_version: e.target.value });
                      }
                    }}
                    className="field w-full text-xs font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Clients with this version or higher will not see update reminders.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Google Play Store URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://play.google.com/store/apps/details?id=..."
                    value={versionConfig?.store_url_android || ''}
                    onChange={(e) => {
                      if (versionConfig) {
                        setVersionConfig({ ...versionConfig, store_url_android: e.target.value });
                      }
                    }}
                    className="field w-full text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Apple App Store URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://apps.apple.com/app/id..."
                    value={versionConfig?.store_url_ios || ''}
                    onChange={(e) => {
                      if (versionConfig) {
                        setVersionConfig({ ...versionConfig, store_url_ios: e.target.value });
                      }
                    }}
                    className="field w-full text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Update Dialog Title
                  </label>
                  <input
                    type="text"
                    placeholder="New Version Available"
                    value={versionConfig?.update_title || ''}
                    onChange={(e) => {
                      if (versionConfig) {
                        setVersionConfig({ ...versionConfig, update_title: e.target.value });
                      }
                    }}
                    className="field w-full text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Update Dialog Description
                  </label>
                  <input
                    type="text"
                    placeholder="Please update SkillBridge to access new features."
                    value={versionConfig?.update_message || ''}
                    onChange={(e) => {
                      if (versionConfig) {
                        setVersionConfig({ ...versionConfig, update_message: e.target.value });
                      }
                    }}
                    className="field w-full text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="update_prompt"
                    checked={versionConfig?.update_prompt_enabled ?? true}
                    onChange={(e) => {
                      if (versionConfig) {
                        setVersionConfig({ ...versionConfig, update_prompt_enabled: e.target.checked });
                      }
                    }}
                    className="rounded border-slate-300"
                  />
                  <label htmlFor="update_prompt" className="text-xs text-slate-700 font-semibold cursor-pointer">
                    Enable in-app update prompts for outdated builds
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={savingRelease}
                  className="btn-primary text-xs flex items-center gap-2"
                >
                  <Save size={14} />
                  {savingRelease ? 'Saving…' : 'Save Release Policy'}
                </button>
              </div>

              {/* Adoption distribution */}
              {adoption.length > 0 && (
                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-700 mb-2">Live Client Version Adoption</h4>
                  <div className="flex flex-wrap gap-2">
                    {adoption.map((item) => (
                      <div
                        key={item.version}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2 text-xs"
                      >
                        <span className="font-mono font-bold text-slate-800">v{item.version}</span>
                        <span className="text-slate-500 font-mono">({item.count} devices)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </section>

          {/* Section 3: Safe Cache Management */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title flex items-center gap-2">
                  <Database size={18} className="text-indigo-600" /> Cache Invalidation &amp; Performance Flushing
                </h2>
                <p className="panel-subtitle">
                  Safely purge distributed Redis keys. Every invalidation is tracked in the audit trail.
                </p>
              </div>
            </div>

            <div className="panel-body grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between">
                <div>
                  <strong className="text-xs font-bold text-slate-900 block">User Dashboard Cache</strong>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Purges keys matching <code className="mono text-[10px]">dashboard:*</code>. Forces fresh user metrics.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCacheTarget('dashboard')}
                  className="btn-secondary text-xs mt-3 w-full flex items-center justify-center gap-1.5 text-indigo-700"
                >
                  <Trash2 size={13} /> Purge Dashboards
                </button>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between">
                <div>
                  <strong className="text-xs font-bold text-slate-900 block">Skills &amp; Catalog Cache</strong>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Purges keys matching <code className="mono text-[10px]">catalog:*</code>. Refreshes search taxonomies.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCacheTarget('catalog')}
                  className="btn-secondary text-xs mt-3 w-full flex items-center justify-center gap-1.5 text-indigo-700"
                >
                  <Trash2 size={13} /> Purge Catalog
                </button>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between">
                <div>
                  <strong className="text-xs font-bold text-slate-900 block">Rooms &amp; Spaces Cache</strong>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Purges keys matching <code className="mono text-[10px]">rooms:*</code>. Resets room lists and member counters.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCacheTarget('rooms')}
                  className="btn-secondary text-xs mt-3 w-full flex items-center justify-center gap-1.5 text-indigo-700"
                >
                  <Trash2 size={13} /> Purge Rooms
                </button>
              </div>
            </div>
          </section>

          {/* Section 4: Server Limits */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Server Runtime Guardrails</h2>
                <p className="panel-subtitle">Core server-side boundaries enforced across all incoming traffic.</p>
              </div>
            </div>
            <div className="panel-body grid gap-3">
              <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <strong className="mono text-slate-700">GLOBAL_RATE_LIMIT_PER_MINUTE</strong>
                  <p className="mt-1 text-[11px] text-slate-500">Allowed range: 30–5000 requests per minute per IP or bearer token.</p>
                </div>
                <code className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700">
                  {system?.runtimePolicy.globalRateLimitPerMinute || 120} req/min
                </code>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <strong className="mono text-slate-700">MAX_ROOM_CAPACITY</strong>
                  <p className="mt-1 text-[11px] text-slate-500">Hard boundary for active attendees inside a single classroom or space.</p>
                </div>
                <code className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700">
                  {system?.runtimePolicy.maxRoomCapacity || 50} users
                </code>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* MODAL: CACHE CLEAR CONFIRMATION */}
      {cacheTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <div className="p-2 rounded-xl bg-amber-100">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                Invalidate {cacheTarget.toUpperCase()} Cache
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              This will immediately purge all matching Redis keys. Backend queries will hit the Supabase database until the cache warms back up.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Audit Reason (Required)
              </label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Cleared cache after mass catalog taxonomy update"
                value={cacheReason}
                onChange={(e) => setCacheReason(e.target.value)}
                className="field w-full text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCacheTarget(null)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearingCache || cacheReason.trim().length < 3}
                onClick={handleExecuteCacheClear}
                className="btn-primary text-xs bg-amber-600 hover:bg-amber-700"
              >
                {clearingCache ? 'Purging…' : 'Confirm Invalidation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
