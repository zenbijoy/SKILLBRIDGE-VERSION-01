import { useEffect, useState } from 'react';
import { Users2, Calendar, FileText, Award, Search, Check, EyeOff } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadingState, ErrorState } from '../components/States';

export default function CommunityOps() {
  const [tab, setTab] = useState<'clubs' | 'events' | 'resources' | 'quizzes'>('clubs');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/community', {
        params: { tab, q: search.trim() || undefined },
      });
      setItems(res.data.items);
    } catch (err: any) {
      setError(err?.message || 'Failed to load community content.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [tab]);

  const handleAction = async (entityId: string, action: string) => {
    const reason = window.prompt(`Reason for ${action}:`);
    if (!reason) return;
    try {
      await api.patch(`/admin/community/${tab}/${entityId}`, { action, reason });
      void loadData();
    } catch (err: any) {
      alert(err?.message || 'Action failed');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Community Operations"
        title="Clubs, Events & Shared Resources"
        description="Review student-led clubs, campus events, shared academic files, and skill assessment quizzes."
        actions={
          <div className="flex flex-wrap gap-1 bg-slate-200/70 p-1 rounded-xl">
            {(
              [
                { id: 'clubs', label: 'Clubs', icon: Users2 },
                { id: 'events', label: 'Events', icon: Calendar },
                { id: 'resources', label: 'Resources', icon: FileText },
                { id: 'quizzes', label: 'Quizzes', icon: Award },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                  tab === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                onClick={() => setTab(t.id)}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Search Input */}
      <div className="panel p-4 mb-5 flex items-center gap-2">
        <Search size={16} className="text-slate-400" />
        <input
          type="text"
          className="form-input text-xs w-full"
          placeholder={`Search ${tab} by title or keyword…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void loadData()}
        />
        <button type="button" className="btn-secondary text-xs" onClick={() => void loadData()}>
          Search
        </button>
      </div>

      {loading ? (
        <LoadingState label={`Loading ${tab}…`} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : (
        <div className="panel">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title / Name</th>
                  <th>Owner / Creator</th>
                  <th>Metrics</th>
                  <th>Created</th>
                  <th>Moderation Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-xs text-slate-400">
                      No {tab} found matching current filters.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong className="text-slate-900 text-xs">{item.name || item.title}</strong>
                        {item.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-1 max-w-sm mt-0.5">{item.description}</p>
                        )}
                      </td>
                      <td>
                        <span className="text-xs text-slate-700">
                          {item.lead?.full_name || item.host?.full_name || item.uploader?.full_name || 'Anonymous'}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs font-mono text-slate-600">
                          {tab === 'clubs' && `${item.membersCount || 0} members`}
                          {tab === 'events' && `${item.applicationsCount || 0} applications`}
                          {tab === 'quizzes' && `${item.questionCount || 0} Qs · ${item.attemptCount || 0} attempts`}
                          {tab === 'resources' && 'Active'}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-slate-400">
                          {new Date(item.created_at || item.starts_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn-secondary py-1 px-2.5 text-[11px] text-emerald-700"
                            onClick={() => handleAction(item.id, 'approve')}
                          >
                            <Check size={13} /> Approve
                          </button>
                          <button
                            type="button"
                            className="btn-secondary py-1 px-2.5 text-[11px] text-slate-600"
                            onClick={() => handleAction(item.id, 'hide')}
                          >
                            <EyeOff size={13} /> Hide
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
