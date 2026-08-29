import { useState, useEffect } from 'react';
import api from '../lib/api';
import { ShieldAlert, ShieldCheck, UserPlus, RefreshCw, XCircle, AlertTriangle } from 'lucide-react';

export function Administrators() {
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('co_admin');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  const [tempPasswordModal, setTempPasswordModal] = useState<{ email: string; password: string } | null>(null);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/members');
      setMembers(data.members || []);
      setInvitations(data.invitations || []);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load administrators');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleInvite = async (e: React.FormEvent, useTempPassword = false) => {
    e.preventDefault();
    setInviteLoading(true);
    setError('');
    try {
      if (useTempPassword) {
        const { data } = await api.post('/admin/members/temporary', { email: inviteEmail, role: inviteRole });
        setTempPasswordModal({ email: inviteEmail, password: data.tempPassword });
        setShowInviteModal(false);
      } else {
        await api.post('/admin/members/invite', { email: inviteEmail, role: inviteRole });
        setShowInviteModal(false);
      }
      fetchMembers();
      setInviteEmail('');
      setInviteRole('co_admin');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    if (!window.confirm('Are you sure you want to revoke this invitation?')) return;
    try {
      await api.delete(`/admin/invitations/${id}`);
      fetchMembers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to revoke invite');
    }
  };

  const handleChangeStatus = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/admin/members/${id}/status`, { status: newStatus });
      fetchMembers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update status');
    }
  };
  
  const handleChangeRole = async (id: string, newRole: string) => {
    try {
      await api.patch(`/admin/members/${id}/role`, { role: newRole });
      fetchMembers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update role');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Administrators</h1>
          <p className="text-sm text-slate-500">Manage control plane access and roles.</p>
        </div>
        <button onClick={() => setShowInviteModal(true)} className="btn-primary flex items-center gap-2">
          <UserPlus size={18} />
          Invite Admin
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 flex items-center gap-2"><RefreshCw className="animate-spin" size={18} /> Loading...</div>
      ) : (
        <div className="space-y-8">
          {/* Active Members */}
          <div className="panel overflow-hidden">
            <div className="panel-header border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h2 className="font-semibold text-slate-800">Active Administrators</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Role</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">MFA</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map(member => (
                    <tr key={member.user_id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{member.profiles?.full_name || 'Admin'}</div>
                        <div className="text-slate-500 text-xs">{member.profiles?.email || 'Unknown Email'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <select 
                          className="bg-slate-50 border border-slate-200 text-slate-700 rounded px-2 py-1 outline-none text-xs"
                          value={member.role}
                          onChange={(e) => handleChangeRole(member.user_id, e.target.value)}
                          disabled={member.role === 'owner'}
                        >
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="co_admin">Co-Admin</option>
                          <option value="auditor">Auditor</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          member.status === 'active' ? 'bg-green-100 text-green-700' :
                          member.status === 'suspended' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {member.mfa_required ? <ShieldCheck size={16} className="text-green-500" /> : <ShieldAlert size={16} className="text-yellow-500" />}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {member.role !== 'owner' && member.status === 'active' && (
                          <button onClick={() => handleChangeStatus(member.user_id, 'suspended')} className="text-yellow-600 hover:text-yellow-800 text-xs font-medium">Suspend</button>
                        )}
                        {member.role !== 'owner' && member.status === 'suspended' && (
                          <button onClick={() => handleChangeStatus(member.user_id, 'active')} className="text-green-600 hover:text-green-800 text-xs font-medium">Reactivate</button>
                        )}
                        {member.role !== 'owner' && member.status !== 'revoked' && (
                          <button onClick={() => handleChangeStatus(member.user_id, 'revoked')} className="ml-3 text-red-600 hover:text-red-800 text-xs font-medium">Revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-4 text-center text-slate-500">No administrators found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div className="panel overflow-hidden">
              <div className="panel-header border-b border-slate-100 bg-slate-50 px-6 py-4">
                <h2 className="font-semibold text-slate-800">Pending Invitations</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                      <th className="px-6 py-3 font-medium">Email</th>
                      <th className="px-6 py-3 font-medium">Role</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invitations.map(invite => (
                      <tr key={invite.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-700">{invite.email}</td>
                        <td className="px-6 py-4 text-slate-600 capitalize">{invite.role.replace('_', '-')}</td>
                        <td className="px-6 py-4">
                           <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                            {invite.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => handleRevokeInvite(invite.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Revoke</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Invite Administrator</h2>
              <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={20} />
              </button>
            </div>
            <form className="p-6 space-y-4" onSubmit={(e) => handleInvite(e, false)}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="admin@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="admin">Admin</option>
                  <option value="co_admin">Co-Admin</option>
                  <option value="auditor">Auditor</option>
                </select>
              </div>
              <div className="pt-4 flex items-center justify-between">
                <button 
                  type="button" 
                  onClick={(e) => handleInvite(e, true)}
                  disabled={inviteLoading}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Create w/ Temp Password
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="btn-primary"
                >
                  {inviteLoading ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Temp Password Display Modal */}
      {tempPasswordModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
             <div className="bg-amber-50 p-6 border-b border-amber-100 flex items-start gap-3">
               <AlertTriangle className="text-amber-600 shrink-0" size={24} />
               <div>
                  <h2 className="text-lg font-bold text-amber-900">Temporary Password Generated</h2>
                  <p className="text-sm text-amber-700 mt-1">This password will only be shown once. Please provide it securely to the new administrator.</p>
               </div>
             </div>
             <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Email</label>
                  <div className="font-medium text-slate-900">{tempPasswordModal.email}</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Temporary Password</label>
                  <div className="font-mono bg-slate-100 border border-slate-200 rounded p-3 text-lg text-center tracking-wider text-slate-800 mt-1">
                    {tempPasswordModal.password}
                  </div>
                </div>
                <button onClick={() => setTempPasswordModal(null)} className="btn-primary w-full mt-4">
                  I have copied this password
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
