import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Flag, LayoutDashboard, RefreshCw, Save, Sparkles } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';

type DashboardConfig = {
  id: string;
  widget_key: string;
  title_en: string;
  title_bn: string;
  default_order: number;
  is_required: boolean;
  is_enabled: boolean;
  target_roles: string[];
  target_campus: string | null;
  min_app_version: string;
};

type Announcement = {
  id: string;
  title_en: string;
  title_bn: string;
  body_en: string;
  body_bn: string;
  tone: string;
  is_active: boolean;
  is_dismissible: boolean;
  starts_at: string;
  ends_at: string | null;
};

type FeatureFlag = {
  id: string;
  key: string;
  description: string | null;
  is_enabled: boolean;
  rollout_percentage: number;
  target_roles: string[];
};

type ContentSet = {
  id: string;
  content_type: 'welcome' | 'onboarding' | 'tour';
  locale: 'en' | 'bn';
  version: number;
  content: unknown;
  is_active: boolean;
  updated_at: string;
};

const CONTENT_TYPES = ['welcome', 'onboarding', 'tour'] as const;
const LOCALES = ['en', 'bn'] as const;
const AUDIENCE_ROLES = ['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin'] as const;

export default function ProductExperience() {
  const [widgets, setWidgets] = useState<DashboardConfig[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [contentSets, setContentSets] = useState<ContentSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canAdminister, setCanAdminister] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState({
    title_en: '', title_bn: '', body_en: '', body_bn: '', action_url: '',
    action_label_en: '', action_label_bn: '', starts_at: '', ends_at: '',
    target_roles: [...AUDIENCE_ROLES] as string[], target_campus: '',
  });
  const [contentType, setContentType] = useState<(typeof CONTENT_TYPES)[number]>('tour');
  const [contentLocale, setContentLocale] = useState<(typeof LOCALES)[number]>('en');
  const [contentJson, setContentJson] = useState('[]');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [profileResponse, widgetResponse, announcementResponse, flagResponse, contentResponse] = await Promise.all([
        api.get<{ profile: { roles: string[] } }>('/profiles/me'),
        api.get<{ configs: DashboardConfig[] }>('/admin/dashboard-configs'),
        api.get<{ announcements: Announcement[] }>('/admin/announcements'),
        api.get<{ flags: FeatureFlag[] }>('/admin/feature-flags'),
        api.get<{ contentSets: ContentSet[] }>('/admin/experience-content'),
      ]);
      setCanAdminister(profileResponse.data.profile.roles.includes('admin'));
      setWidgets(widgetResponse.data.configs.map((item) => ({
        ...item,
        target_roles: item.target_roles?.length ? item.target_roles : [...AUDIENCE_ROLES],
        min_app_version: item.min_app_version || '2.0.0',
      })));
      setAnnouncements(announcementResponse.data.announcements);
      setFlags(flagResponse.data.flags.map((item) => ({
        ...item,
        target_roles: item.target_roles?.length ? item.target_roles : [...AUDIENCE_ROLES],
      })));
      setContentSets(contentResponse.data.contentSets);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to load product experience configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeContent = useMemo(
    () => contentSets.find((item) => item.content_type === contentType && item.locale === contentLocale && item.is_active),
    [contentLocale, contentSets, contentType],
  );
  const actionRequested = Boolean(announcementDraft.action_url.trim());
  const invalidSchedule = Boolean(
    announcementDraft.starts_at
    && announcementDraft.ends_at
    && new Date(announcementDraft.ends_at).getTime() <= new Date(announcementDraft.starts_at).getTime(),
  );

  useEffect(() => {
    setContentJson(JSON.stringify(activeContent?.content ?? (contentType === 'onboarding' ? {} : []), null, 2));
  }, [activeContent, contentType]);

  const perform = async (key: string, action: () => Promise<void>, success: string) => {
    setSaving(key); setError(''); setNotice('');
    try {
      await action();
      setNotice(success);
      await load();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Operation failed');
    } finally {
      setSaving('');
    }
  };

  const toggleWidget = (widget: DashboardConfig) => void perform(
    `widget:${widget.id}`,
    async () => { await api.patch(`/admin/dashboard-configs/${widget.id}`, { is_enabled: !widget.is_enabled }); },
    `${widget.title_en} is now ${widget.is_enabled ? 'disabled' : 'enabled'}.`,
  );

  const toggleFlag = (flag: FeatureFlag) => void perform(
    `flag:${flag.key}`,
    async () => { await api.patch(`/admin/feature-flags/${encodeURIComponent(flag.key)}`, { is_enabled: !flag.is_enabled }); },
    `${flag.key} is now ${flag.is_enabled ? 'disabled' : 'enabled'}.`,
  );

  const updateWidgetRoles = (widget: DashboardConfig, role: (typeof AUDIENCE_ROLES)[number]) => {
    const roles = widget.target_roles.includes(role)
      ? widget.target_roles.filter((item) => item !== role)
      : [...widget.target_roles, role];
    if (!roles.length) return;
    void perform(`widget:${widget.id}`, async () => {
      await api.patch(`/admin/dashboard-configs/${widget.id}`, { target_roles: roles });
    }, `${widget.title_en} audience updated.`);
  };

  const updateFlagRoles = (flag: FeatureFlag, role: (typeof AUDIENCE_ROLES)[number]) => {
    const roles = flag.target_roles.includes(role)
      ? flag.target_roles.filter((item) => item !== role)
      : [...flag.target_roles, role];
    if (!roles.length) return;
    void perform(`flag:${flag.key}`, async () => {
      await api.patch(`/admin/feature-flags/${encodeURIComponent(flag.key)}`, { target_roles: roles });
    }, `${flag.key} audience updated.`);
  };

  const updateRollout = (flag: FeatureFlag, rollout: number) => void perform(
    `flag:${flag.key}`,
    async () => { await api.patch(`/admin/feature-flags/${encodeURIComponent(flag.key)}`, { rollout_percentage: rollout }); },
    `${flag.key} rollout updated to ${rollout}%.`,
  );

  const publishAnnouncement = () => void perform('announcement:new', async () => {
    await api.post('/admin/announcements', {
      title_en: announcementDraft.title_en,
      title_bn: announcementDraft.title_bn,
      body_en: announcementDraft.body_en,
      body_bn: announcementDraft.body_bn,
      ...(announcementDraft.action_url.trim() ? {
        action_url: announcementDraft.action_url.trim(),
        action_label_en: announcementDraft.action_label_en.trim(),
        action_label_bn: announcementDraft.action_label_bn.trim(),
      } : {}),
      ...(announcementDraft.starts_at ? { starts_at: new Date(announcementDraft.starts_at).toISOString() } : {}),
      ...(announcementDraft.ends_at ? { ends_at: new Date(announcementDraft.ends_at).toISOString() } : {}),
      target_roles: announcementDraft.target_roles,
      ...(announcementDraft.target_campus.trim() ? { target_campus: announcementDraft.target_campus.trim() } : {}),
      tone: 'info',
      is_active: true,
      is_dismissible: true,
    });
    setAnnouncementDraft({ title_en: '', title_bn: '', body_en: '', body_bn: '', action_url: '', action_label_en: '', action_label_bn: '', starts_at: '', ends_at: '', target_roles: [...AUDIENCE_ROLES], target_campus: '' });
  }, 'Announcement published.');

  const archiveAnnouncement = (announcement: Announcement) => void perform(
    `announcement:${announcement.id}`,
    async () => { await api.patch(`/admin/announcements/${announcement.id}`, { is_active: !announcement.is_active }); },
    `Announcement ${announcement.is_active ? 'archived' : 'reactivated'}.`,
  );

  const publishContent = () => void perform(`content:${contentType}:${contentLocale}`, async () => {
    let content: unknown;
    try { content = JSON.parse(contentJson); }
    catch { throw new Error('Content must be valid JSON.'); }
    if (!content || (typeof content !== 'object')) throw new Error('Content must be a JSON array or object.');
    await api.post(`/admin/experience-content/${contentType}/${contentLocale}/publish`, { content });
  }, `${contentType} ${contentLocale.toUpperCase()} version published.`);

  return (
    <div>
      <PageHeader
        eyebrow="Product experience"
        title="Dashboard, onboarding & guided tour"
        description="Manage server-driven widgets, versioned onboarding content, tour chapters, staged flags, and dashboard announcements. Every mutation is validated and audited by the backend."
        actions={<button className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</button>}
      />

      {loading ? <section className="panel"><LoadingState label="Loading product experience configuration…" /></section> : null}
      {error ? <section className="panel"><ErrorState message={error} onRetry={() => void load()} /></section> : null}
      {notice ? <div className="notice notice-success mb-4">{notice}</div> : null}
      {!loading && !canAdminister ? <div className="notice notice-warning mb-4">Read-only view. Product experience changes require the administrator role.</div> : null}

      {!loading ? <div className="grid gap-5">
        <section className="panel panel-flat">
          <div className="panel-header"><div><h2 className="panel-title flex items-center gap-2"><LayoutDashboard size={18} /> Dashboard widgets</h2><p className="panel-subtitle">Global availability and required-widget policy. User ordering remains personalized.</p></div><StatusBadge value={`${widgets.filter((item) => item.is_enabled).length} enabled`} /></div>
          <div className="panel-body grid gap-3 md:grid-cols-2">
            {widgets.map((widget) => <article key={widget.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3"><div><strong>{widget.title_en}</strong><p className="mono mt-1 text-[10px] text-slate-400">{widget.widget_key}</p></div><StatusBadge value={widget.is_enabled ? 'enabled' : 'disabled'} /></div>
              <p className="mt-2 text-xs text-slate-500">Order {widget.default_order} · minimum app {widget.min_app_version} · {widget.is_required ? 'required' : 'optional'}</p>
              <div className="mt-3 flex flex-wrap gap-1" aria-label={`${widget.title_en} audience`}>
                {AUDIENCE_ROLES.map((role) => <button key={role} className={widget.target_roles.includes(role) ? 'badge badge-info' : 'badge'} disabled={!canAdminister || saving === `widget:${widget.id}` || (widget.target_roles.includes(role) && widget.target_roles.length === 1)} onClick={() => updateWidgetRoles(widget, role)}>{role}</button>)}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] font-semibold text-slate-500">Campus target<input disabled={!canAdminister} className="form-input mt-1" defaultValue={widget.target_campus ?? ''} placeholder="All campuses" onBlur={(event) => { const value = event.currentTarget.value.trim() || null; if (value !== widget.target_campus) void perform(`widget:${widget.id}`, async () => { await api.patch(`/admin/dashboard-configs/${widget.id}`, { target_campus: value }); }, `${widget.title_en} campus target updated.`); }} /></label>
                <label className="text-[11px] font-semibold text-slate-500">Minimum app version<input disabled={!canAdminister} className="form-input mt-1" defaultValue={widget.min_app_version} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value && value !== widget.min_app_version) void perform(`widget:${widget.id}`, async () => { await api.patch(`/admin/dashboard-configs/${widget.id}`, { min_app_version: value }); }, `${widget.title_en} minimum version updated.`); }} /></label>
              </div>
              <button className="btn-secondary mt-3" disabled={!canAdminister || saving === `widget:${widget.id}`} onClick={() => toggleWidget(widget)}>{widget.is_enabled ? 'Disable globally' : 'Enable globally'}</button>
            </article>)}
          </div>
        </section>

        <section className="panel panel-flat">
          <div className="panel-header"><div><h2 className="panel-title flex items-center gap-2"><Flag size={18} /> Feature flags</h2><p className="panel-subtitle">Deterministic percentage rollouts are evaluated per user by the API.</p></div></div>
          <div className="panel-body grid gap-3">
            {flags.map((flag) => <article key={flag.key} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><strong className="mono">{flag.key}</strong><p className="mt-1 text-xs text-slate-500">{flag.description || 'No description'}</p></div><div className="flex items-center gap-2"><StatusBadge value={flag.is_enabled ? 'enabled' : 'disabled'} /><button className="btn-secondary" disabled={!canAdminister || saving === `flag:${flag.key}`} onClick={() => toggleFlag(flag)}>{flag.is_enabled ? 'Disable' : 'Enable'}</button></div></div>
              <div className="mt-3 flex items-center gap-3"><label className="text-xs font-semibold text-slate-600" htmlFor={`rollout-${flag.key}`}>Rollout</label><input disabled={!canAdminister} id={`rollout-${flag.key}`} type="range" min="0" max="100" value={flag.rollout_percentage} onChange={(event) => setFlags((current) => current.map((item) => item.key === flag.key ? { ...item, rollout_percentage: Number(event.target.value) } : item))} className="flex-1" /><b className="w-12 text-right text-xs">{flag.rollout_percentage}%</b><button className="btn-secondary" disabled={!canAdminister || saving === `flag:${flag.key}`} onClick={() => updateRollout(flag, flag.rollout_percentage)}>Save rollout</button></div>
              <div className="mt-3 flex flex-wrap gap-1" aria-label={`${flag.key} audience`}>
                {AUDIENCE_ROLES.map((role) => <button key={role} className={flag.target_roles.includes(role) ? 'badge badge-info' : 'badge'} disabled={!canAdminister || saving === `flag:${flag.key}` || (flag.target_roles.includes(role) && flag.target_roles.length === 1)} onClick={() => updateFlagRoles(flag, role)}>{role}</button>)}
              </div>
            </article>)}
          </div>
        </section>

        <section className="panel panel-flat">
          <div className="panel-header"><div><h2 className="panel-title flex items-center gap-2"><BellRing size={18} /> Announcements</h2><p className="panel-subtitle">Publish localized, persistently dismissible dashboard broadcasts.</p></div></div>
          <div className="panel-body grid gap-4 lg:grid-cols-2">
            <fieldset disabled={!canAdminister} className="grid gap-3 rounded-xl border border-slate-200 p-4">
              <h3 className="font-bold">New announcement</h3>
              <input className="form-input" value={announcementDraft.title_en} onChange={(event) => setAnnouncementDraft((draft) => ({ ...draft, title_en: event.target.value }))} placeholder="English title" maxLength={160} />
              <input className="form-input" value={announcementDraft.title_bn} onChange={(event) => setAnnouncementDraft((draft) => ({ ...draft, title_bn: event.target.value }))} placeholder="Bangla title" maxLength={160} />
              <textarea className="form-input min-h-24" value={announcementDraft.body_en} onChange={(event) => setAnnouncementDraft((draft) => ({ ...draft, body_en: event.target.value }))} placeholder="English body" maxLength={2000} />
              <textarea className="form-input min-h-24" value={announcementDraft.body_bn} onChange={(event) => setAnnouncementDraft((draft) => ({ ...draft, body_bn: event.target.value }))} placeholder="Bangla body" maxLength={2000} />
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="form-input" type="datetime-local" value={announcementDraft.starts_at} onChange={(event) => setAnnouncementDraft((draft) => ({ ...draft, starts_at: event.target.value }))} aria-label="Announcement starts at" />
                <input className="form-input" type="datetime-local" value={announcementDraft.ends_at} onChange={(event) => setAnnouncementDraft((draft) => ({ ...draft, ends_at: event.target.value }))} aria-label="Announcement ends at" />
              </div>
              <input className="form-input" value={announcementDraft.action_url} onChange={(event) => setAnnouncementDraft((draft) => ({ ...draft, action_url: event.target.value }))} placeholder="Optional internal path or HTTPS action URL" maxLength={500} />
              {actionRequested ? <div className="grid gap-2 sm:grid-cols-2">
                <input className="form-input" value={announcementDraft.action_label_en} onChange={(event) => setAnnouncementDraft((draft) => ({ ...draft, action_label_en: event.target.value }))} placeholder="English action label" maxLength={80} />
                <input className="form-input" value={announcementDraft.action_label_bn} onChange={(event) => setAnnouncementDraft((draft) => ({ ...draft, action_label_bn: event.target.value }))} placeholder="Bangla action label" maxLength={80} />
              </div> : null}
              <input className="form-input" value={announcementDraft.target_campus} onChange={(event) => setAnnouncementDraft((draft) => ({ ...draft, target_campus: event.target.value }))} placeholder="Optional campus target" maxLength={120} />
              <div className="flex flex-wrap gap-1" aria-label="Announcement audience">{AUDIENCE_ROLES.map((role) => <button key={role} className={announcementDraft.target_roles.includes(role) ? 'badge badge-info' : 'badge'} disabled={announcementDraft.target_roles.includes(role) && announcementDraft.target_roles.length === 1} onClick={() => setAnnouncementDraft((draft) => ({ ...draft, target_roles: draft.target_roles.includes(role) ? draft.target_roles.filter((item) => item !== role) : [...draft.target_roles, role] }))}>{role}</button>)}</div>
              <button className="btn-primary" disabled={saving === 'announcement:new' || invalidSchedule || [announcementDraft.title_en, announcementDraft.title_bn, announcementDraft.body_en, announcementDraft.body_bn].some((value) => value.trim().length < 2) || (actionRequested && [announcementDraft.action_label_en, announcementDraft.action_label_bn].some((value) => !value.trim()))} onClick={publishAnnouncement}><Save size={15} /> Publish</button>
            </fieldset>
            <div className="grid content-start gap-3">
              {announcements.map((announcement) => <article key={announcement.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><strong>{announcement.title_en}</strong><p className="mt-1 text-xs text-slate-500">{announcement.body_en}</p></div><StatusBadge value={announcement.is_active ? 'active' : 'archived'} /></div><button className="btn-secondary mt-3" disabled={!canAdminister || saving === `announcement:${announcement.id}`} onClick={() => archiveAnnouncement(announcement)}>{announcement.is_active ? 'Archive' : 'Reactivate'}</button></article>)}
            </div>
          </div>
        </section>

        <section className="panel panel-flat">
          <div className="panel-header"><div><h2 className="panel-title flex items-center gap-2"><Sparkles size={18} /> Versioned experience content</h2><p className="panel-subtitle">Publishing creates an immutable next version and activates it atomically. Tour version changes trigger eligible users to see the new tour.</p></div><StatusBadge value={activeContent ? `v${activeContent.version} active` : 'no active version'} /></div>
          <div className="panel-body grid gap-3">
            <div className="flex flex-wrap gap-2">{CONTENT_TYPES.map((type) => <button key={type} className={contentType === type ? 'btn-primary' : 'btn-secondary'} onClick={() => setContentType(type)}>{type}</button>)}<span className="mx-1 border-l border-slate-200" />{LOCALES.map((locale) => <button key={locale} className={contentLocale === locale ? 'btn-primary' : 'btn-secondary'} onClick={() => setContentLocale(locale)}>{locale.toUpperCase()}</button>)}</div>
            <textarea readOnly={!canAdminister} className="form-input mono min-h-96 text-xs" spellCheck={false} value={contentJson} onChange={(event) => setContentJson(event.target.value)} aria-label="Experience content JSON" />
            <div className="notice notice-warning">Validate routes and localization before publishing. Existing versions remain in history for audit and rollback analysis.</div>
            <button className="btn-primary w-fit" disabled={!canAdminister || saving === `content:${contentType}:${contentLocale}`} onClick={publishContent}><Save size={15} /> Publish next version</button>
          </div>
        </section>
      </div> : null}
    </div>
  );
}
