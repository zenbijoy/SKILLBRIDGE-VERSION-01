import { useState } from 'react';
import api from '../lib/api';

export default function VerificationOverride() {
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('APPROVE_OVERRIDE');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleApply = async () => {
    if (!userId || !reason) {
      setMessage({ text: 'User ID and Reason are required.', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await api.post(`/admin/users/${userId}/verify`, { action, reason });
      setMessage({ text: 'Override applied successfully!', type: 'success' });
      setUserId('');
      setReason('');
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || err.message || 'Failed to apply override', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Verification Override</h1>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
        <p className="text-gray-400 mb-6">Audited verification overrides for specific users/entities.</p>

        {message && (
          <div className={`mb-6 p-4 rounded border ${message.type === 'success' ? 'bg-green-900 bg-opacity-20 border-green-500 text-green-400' : 'bg-red-900 bg-opacity-20 border-red-500 text-red-400'}`}>
            {message.text}
          </div>
        )}

        <div className="mb-8 p-6 bg-gray-900 rounded border border-gray-700">
          <h3 className="text-xl font-bold mb-4 text-white">Create Override</h3>
          <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
            <input
              type="text"
              placeholder="User ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded p-3 flex-1 text-white focus:outline-none focus:border-blue-500"
            />
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="APPROVE_OVERRIDE">APPROVE_OVERRIDE</option>
              <option value="REJECT_OVERRIDE">REJECT_OVERRIDE</option>
              <option value="BYPASS_REQUIRED_STEP">BYPASS_REQUIRED_STEP</option>
            </select>
            <input
              type="text"
              placeholder="Reason (Required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded p-3 flex-1 text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleApply}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors disabled:opacity-50"
            >
              {loading ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-bold mb-4 text-white">Active Overrides</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-700 text-gray-400 text-sm uppercase tracking-wider">
                  <th className="p-4 font-medium">User ID</th>
                  <th className="p-4 font-medium">Action</th>
                  <th className="p-4 font-medium">Reason</th>
                  <th className="p-4 font-medium">Admin</th>
                  <th className="p-4 font-medium text-right">Revoke</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                <tr className="hover:bg-gray-750 transition-colors">
                  <td className="p-4 text-sm text-gray-300 font-mono">u-1234</td>
                  <td className="p-4 text-sm font-bold text-blue-400">APPROVE_OVERRIDE</td>
                  <td className="p-4 text-sm text-gray-300">Manual verification of student ID</td>
                  <td className="p-4 text-sm text-gray-400">admin@skillbridge.com</td>
                  <td className="p-4 text-right">
                    <button className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors">Revoke</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
