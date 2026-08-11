import React, { useState } from 'react';
import api from '../lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  status: string;
  role: string;
}

export default function User360() {
  const [activeTab, setActiveTab] = useState('profile');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const searchUsers = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/admin/users?q=${searchQuery}`);
      setUsers(response.data.users || response.data);
      setSelectedUser(null);
    } catch (err: any) {
      setError(err.message || 'Failed to search users');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await api.patch(`/admin/users/${selectedUser.id}/status`, { status });
      setSelectedUser({ ...selectedUser, status });
      setUsers(users.map(u => u.id === selectedUser.id ? { ...u, status } : u));
    } catch (err: any) {
      alert('Error updating status: ' + (err.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRoleChange = async (role: string) => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await api.post(`/admin/users/${selectedUser.id}/role`, { role });
      setSelectedUser({ ...selectedUser, role });
      setUsers(users.map(u => u.id === selectedUser.id ? { ...u, role } : u));
    } catch (err: any) {
      alert('Error updating role: ' + (err.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <h1 className="text-3xl font-bold mb-6">User 360</h1>

      <div className="flex gap-6 h-full">
        <div className="w-1/3 flex flex-col bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-4">
          <form onSubmit={searchUsers} className="mb-4 flex gap-2">
            <input
              type="text"
              placeholder="Search by name or email..."
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded focus:outline-none disabled:opacity-50"
            >
              Search
            </button>
          </form>

          {error && <div className="text-red-400 mb-4 text-sm">{error}</div>}

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-4">
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <ul className="divide-y divide-gray-700">
                {users.map(user => (
                  <li
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`p-3 cursor-pointer rounded transition-colors ${selectedUser?.id === user.id ? 'bg-blue-900 bg-opacity-40' : 'hover:bg-gray-750'}`}
                  >
                    <div className="font-semibold text-gray-200">{user.name}</div>
                    <div className="text-sm text-gray-400">{user.email}</div>
                  </li>
                ))}
                {!loading && users.length === 0 && searchQuery && (
                  <div className="text-gray-500 p-4 text-center">No users found.</div>
                )}
              </ul>
            )}
          </div>
        </div>

        <div className="w-2/3 flex flex-col">
          {selectedUser ? (
            <>
              <div className="flex space-x-4 mb-4 border-b border-gray-700 pb-2">
                {['profile', 'skills', 'rooms', 'reputation', 'impersonation', 'activity'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 rounded capitalize transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 flex-1 overflow-y-auto">
                {activeTab === 'profile' && (
                  <div>
                    <h2 className="text-2xl font-semibold mb-4 text-white border-b border-gray-700 pb-2">Profile Overview</h2>
                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                      <div>
                        <span className="block text-gray-500 mb-1">ID</span>
                        <span className="font-mono text-gray-300 bg-gray-900 px-2 py-1 rounded">{selectedUser.id}</span>
                      </div>
                      <div>
                        <span className="block text-gray-500 mb-1">Name</span>
                        <span className="text-gray-200 text-base">{selectedUser.name}</span>
                      </div>
                      <div>
                        <span className="block text-gray-500 mb-1">Email</span>
                        <span className="text-gray-200 text-base">{selectedUser.email}</span>
                      </div>
                      <div>
                        <span className="block text-gray-500 mb-1">Status</span>
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${selectedUser.status === 'suspended' ? 'bg-red-900 text-red-200' : selectedUser.status === 'banned' ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}>
                          {selectedUser.status}
                        </span>
                      </div>
                      <div>
                        <span className="block text-gray-500 mb-1">Role</span>
                        <span className="text-gray-200 text-base">{selectedUser.role}</span>
                      </div>
                    </div>

                    <div className="mt-8">
                      <h3 className="text-lg font-medium text-gray-300 mb-3 border-b border-gray-700 pb-1">Administrative Actions</h3>
                      <div className="flex flex-wrap gap-3">
                        {selectedUser.status !== 'suspended' && (
                          <button disabled={actionLoading} onClick={() => handleStatusChange('suspended')} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-sm font-medium disabled:opacity-50 transition-colors">
                            Suspend User
                          </button>
                        )}
                        {selectedUser.status !== 'banned' && (
                          <button disabled={actionLoading} onClick={() => handleStatusChange('banned')} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium disabled:opacity-50 transition-colors">
                            Ban User
                          </button>
                        )}
                        {(selectedUser.status === 'suspended' || selectedUser.status === 'banned') && (
                          <button disabled={actionLoading} onClick={() => handleStatusChange('active')} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium disabled:opacity-50 transition-colors">
                            Activate User
                          </button>
                        )}

                        <select
                          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 ml-auto"
                          value={selectedUser.role}
                          onChange={(e) => handleRoleChange(e.target.value)}
                          disabled={actionLoading}
                        >
                          <option value="user">User</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'skills' && (
                  <div>
                    <h2 className="text-xl mb-4 text-white">Skills</h2>
                    <div className="p-4 bg-gray-900 rounded border border-gray-700">
                      <p className="text-gray-400 italic">No skills data available via API yet.</p>
                    </div>
                  </div>
                )}

                {activeTab === 'rooms' && (
                  <div>
                    <h2 className="text-xl mb-4 text-white">Rooms & Sessions</h2>
                    <div className="p-4 bg-gray-900 rounded border border-gray-700">
                      <p className="text-gray-400 italic">No rooms data available via API yet.</p>
                    </div>
                  </div>
                )}

                {activeTab === 'reputation' && (
                  <div>
                    <h2 className="text-xl mb-4 text-white">Reputation</h2>
                    <div className="p-4 bg-gray-900 rounded border border-gray-700">
                      <p className="text-gray-400 italic">No reputation data available via API yet.</p>
                    </div>
                  </div>
                )}

                {activeTab === 'impersonation' && (
                  <div>
                    <h2 className="text-xl mb-2 text-white">Support Impersonation</h2>
                    <p className="text-sm text-gray-400 mb-4">Grant short-lived delegation for support purposes.</p>
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition-colors">Start READ_ONLY Session</button>
                  </div>
                )}

                {activeTab === 'activity' && (
                  <div>
                    <h2 className="text-xl mb-4 text-white">Activity Logs</h2>
                    <div className="p-4 bg-gray-900 rounded border border-gray-700">
                      <p className="text-sm text-gray-400 italic">No recent activity.</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-800 rounded-lg shadow-lg border border-gray-700">
              <p className="text-gray-500">Select a user to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
