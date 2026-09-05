import { useEffect, useState } from 'react';
import { Megaphone, Send, Users, Plus, X } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadingState, ErrorState } from '../components/States';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [targetRole, setTargetRole] = useState('all');
  const [targetCampus, setTargetCampus] = useState('');
  const [estimatedAudience, setEstimatedAudience] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  const loadCampaigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/campaigns');
      setCampaigns(res.data.campaigns);
    } catch (err: any) {
      setError(err?.message || 'Failed to load campaigns.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, []);

  const handleEstimate = async () => {
    setEstimating(true);
    try {
      const res = await api.post('/admin/campaigns/estimate', {
        targetRole,
        targetCampus: targetCampus.trim() || undefined,
      });
      setEstimatedAudience(res.data.estimatedAudience);
    } catch {
      setEstimatedAudience(0);
    } finally {
      setEstimating(false);
    }
  };

  useEffect(() => {
    if (modalOpen) {
      void handleEstimate();
    }
  }, [targetRole, targetCampus, modalOpen]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setDispatching(true);
    try {
      await api.post('/admin/campaigns', {
        title: title.trim(),
        body: body.trim(),
        actionUrl: actionUrl.trim() || undefined,
        targetRole,
        targetCampus: targetCampus.trim() || undefined,
        channel: 'all',
      });
      setModalOpen(false);
      setTitle('');
      setBody('');
      setActionUrl('');
      void loadCampaigns();
    } catch (err: any) {
      alert(err?.message || 'Failed to dispatch campaign.');
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Targeted Messaging"
        title="Campaign Center"
        description="Broadcast campus-wide announcements and targeted in-app or push notifications to specific student roles and universities."
        actions={
          <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
            <Plus size={16} /> New Campaign
          </button>
        }
      />

      {loading ? (
        <LoadingState label="Loading campaign history…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadCampaigns} />
      ) : (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title flex items-center gap-2">
              <Megaphone size={18} className="text-blue-600" /> Dispatched & Active Campaigns
            </h2>
            <span className="text-xs text-slate-500">{campaigns.length} campaigns</span>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign Title</th>
                  <th>Message Body</th>
                  <th>Target Criteria</th>
                  <th>Status</th>
                  <th>Sent Date</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-xs text-slate-400">
                      No campaigns dispatched yet. Click "New Campaign" to create your first announcement.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong className="text-slate-900 text-xs">{c.title}</strong>
                        {c.actionUrl && <div className="text-[10px] text-blue-600">{c.actionUrl}</div>}
                      </td>
                      <td>
                        <p className="text-xs text-slate-600 line-clamp-2 max-w-md">{c.body}</p>
                      </td>
                      <td>
                        <span className="text-xs text-slate-700 font-mono">
                          {c.targetRoles?.join(', ') || 'All Roles'}
                          {c.targetCampus ? ` · ${c.targetCampus}` : ''}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-success capitalize">{c.status}</span>
                      </td>
                      <td>
                        <span className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Campaign Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm grid place-items-center p-4">
          <div className="panel max-w-lg w-full p-6 bg-white shadow-2xl rounded-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Send size={18} className="text-blue-600" /> Create Notification Campaign
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 p-1"
                onClick={() => setModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">Campaign Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Midterm Peer Tutoring Study Hours Live!"
                  className="form-input text-xs w-full mt-1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Message Body</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Enter message notification copy…"
                  className="form-input text-xs w-full mt-1"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Deep Link Action URL (Optional)</label>
                <input
                  type="text"
                  placeholder="/rooms or /catalog"
                  className="form-input text-xs w-full mt-1"
                  value={actionUrl}
                  onChange={(e) => setActionUrl(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Target Role</label>
                  <select
                    className="form-input text-xs w-full mt-1"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                  >
                    <option value="all">All Roles</option>
                    <option value="student">Students</option>
                    <option value="tutor">Tutors</option>
                    <option value="peer_tutor">Peer Tutors</option>
                    <option value="researcher">Researchers</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Campus Filter (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Dhaka or All"
                    className="form-input text-xs w-full mt-1"
                    value={targetCampus}
                    onChange={(e) => setTargetCampus(e.target.value)}
                  />
                </div>
              </div>

              {/* Dynamic Audience Estimation */}
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between text-xs">
                <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                  <Users size={15} className="text-blue-600" /> Estimated Audience:
                </span>
                <span className="font-bold text-blue-900 font-mono">
                  {estimating ? 'Calculating…' : `${estimatedAudience ?? 0} active users`}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex items-center gap-1.5"
                  disabled={dispatching || !title.trim() || !body.trim()}
                >
                  <Send size={14} /> {dispatching ? 'Broadcasting…' : 'Send Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
