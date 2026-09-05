import { useEffect, useState } from 'react';
import { Radio, Calendar, Activity, ShieldAlert } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadingState, ErrorState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';

export default function LearningOps() {
  const [tab, setTab] = useState<'rooms' | 'sessions'>('rooms');
  const [roomsData, setRoomsData] = useState<any[]>([]);
  const [sessionsData, setSessionsData] = useState<any[]>([]);
  const [realtime, setRealtime] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    type: 'room' | 'session';
    id: string;
    action: string;
    title: string;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadRealtime = async () => {
    try {
      const res = await api.get('/admin/learning-ops/realtime');
      setRealtime(res.data);
    } catch {}
  };

  const loadTab = async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'rooms') {
        const res = await api.get('/admin/learning-ops/rooms');
        setRoomsData(res.data.rooms);
      } else {
        const res = await api.get('/admin/learning-ops/sessions');
        setSessionsData(res.data.sessions);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load learning operations data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRealtime();
    void loadTab();
  }, [tab]);

  const handleActionConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal || !reason.trim()) return;
    setSubmitting(true);
    try {
      if (actionModal.type === 'room') {
        await api.patch(`/admin/learning-ops/rooms/${actionModal.id}`, {
          action: actionModal.action,
          reason: reason.trim(),
        });
      } else {
        await api.patch(`/admin/learning-ops/sessions/${actionModal.id}`, {
          action: actionModal.action,
          reason: reason.trim(),
        });
      }
      setActionModal(null);
      setReason('');
      void loadTab();
    } catch (err: any) {
      alert(err?.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Learning Operations"
        title="Rooms & Study Sessions"
        description="Monitor virtual learning rooms, peer study sessions, attendance records, and active realtime audio/video connections."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className={`btn-secondary ${tab === 'rooms' ? 'bg-blue-50 border-blue-300 text-blue-700' : ''}`}
              onClick={() => setTab('rooms')}
            >
              <Radio size={16} /> Learning Rooms
            </button>
            <button
              type="button"
              className={`btn-secondary ${tab === 'sessions' ? 'bg-blue-50 border-blue-300 text-blue-700' : ''}`}
              onClick={() => setTab('sessions')}
            >
              <Calendar size={16} /> Sessions & Attendance
            </button>
          </div>
        }
      />

      {/* Realtime Telemetry Summary Strip */}
      {realtime && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="panel p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 grid place-items-center">
              <Activity size={20} />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Connected Users Online</div>
              <div className="text-xl font-bold text-slate-900">{realtime.activeOnlineUsers}</div>
            </div>
          </div>
          <div className="panel p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center">
              <Radio size={20} />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Live Active Sessions</div>
              <div className="text-xl font-bold text-slate-900">{realtime.activeLearningSessions}</div>
            </div>
          </div>
          <div className="panel p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 grid place-items-center">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">LiveKit Media Gateway</div>
              <div className="text-sm font-semibold capitalize text-slate-800">
                {realtime.livekit.status} ({realtime.livekit.p2pFallbackEnabled ? 'P2P Ready' : 'Mesh'})
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState label={`Loading ${tab} data…`} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadTab} />
      ) : tab === 'rooms' ? (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Active Learning Spaces</h2>
            <span className="text-xs text-slate-500">{roomsData.length} spaces listed</span>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Room Title</th>
                  <th>Host / Owner</th>
                  <th>Members</th>
                  <th>Sessions</th>
                  <th>Visibility</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roomsData.map((room) => (
                  <tr key={room.id}>
                    <td>
                      <div className="font-semibold text-slate-900">{room.title}</div>
                      {room.topic && <div className="text-[11px] text-slate-400">{room.topic}</div>}
                    </td>
                    <td>
                      <div className="text-xs text-slate-700 font-medium">{room.owner?.full_name || 'Anonymous'}</div>
                      <div className="text-[10px] text-slate-400">@{room.owner?.username || 'user'}</div>
                    </td>
                    <td>
                      <span className="font-mono text-xs">{room.memberCount} / {room.max_capacity || 20}</span>
                    </td>
                    <td>
                      <span className="font-mono text-xs">{room.sessionCount}</span>
                    </td>
                    <td>
                      <span className="text-xs capitalize text-slate-600 font-medium">{room.visibility}</span>
                    </td>
                    <td>
                      <StatusBadge value={room.status} />
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        {room.status === 'active' ? (
                          <button
                            type="button"
                            className="btn-secondary text-[11px] py-1 px-2.5 text-amber-700 hover:bg-amber-50"
                            onClick={() => setActionModal({ type: 'room', id: room.id, action: 'archive', title: room.title })}
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary text-[11px] py-1 px-2.5 text-green-700 hover:bg-green-50"
                            onClick={() => setActionModal({ type: 'room', id: room.id, action: 'activate', title: room.title })}
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Peer Study & Tutoring Sessions</h2>
            <span className="text-xs text-slate-500">{sessionsData.length} sessions listed</span>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session Room</th>
                  <th>Teacher / Host</th>
                  <th>Schedule</th>
                  <th>Mode</th>
                  <th>Participants</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sessionsData.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <strong className="text-slate-800 text-xs">{session.room?.title || 'Study Room'}</strong>
                    </td>
                    <td>
                      <div className="text-xs text-slate-700">{session.host?.full_name || 'Host'}</div>
                    </td>
                    <td>
                      <div className="text-xs text-slate-600">{new Date(session.starts_at).toLocaleString()}</div>
                    </td>
                    <td>
                      <span className="text-xs uppercase font-mono text-slate-500">{session.mode}</span>
                    </td>
                    <td>
                      <span className="text-xs font-mono">{session.attendedCount} / {session.participantsCount} attended</span>
                    </td>
                    <td>
                      <StatusBadge value={session.status} />
                    </td>
                    <td>
                      {session.status === 'scheduled' || session.status === 'live' ? (
                        <button
                          type="button"
                          className="btn-secondary text-[11px] py-1 px-2.5 text-red-600 hover:bg-red-50"
                          onClick={() => setActionModal({ type: 'session', id: session.id, action: 'cancel', title: session.room?.title || 'Session' })}
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm grid place-items-center p-4">
          <div className="panel max-w-md w-full p-6 bg-white shadow-xl rounded-2xl">
            <h3 className="text-lg font-bold text-slate-900">
              Confirm {actionModal.action}
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              You are about to modify <strong>{actionModal.title}</strong>. This privileged operation will be logged to the audit trail.
            </p>
            <form onSubmit={handleActionConfirm} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Reason for this action</label>
                <textarea
                  className="form-input text-xs w-full mt-1"
                  rows={3}
                  required
                  placeholder="Explain why this action is being taken…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setActionModal(null); setReason(''); }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary bg-red-600 hover:bg-red-700"
                  disabled={submitting || !reason.trim()}
                >
                  {submitting ? 'Processing…' : `Confirm ${actionModal.action}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
