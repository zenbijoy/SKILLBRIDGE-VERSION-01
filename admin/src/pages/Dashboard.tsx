import { useEffect, useState } from 'react';
import api from '../lib/api';

interface Stats {
  totalUsers: number;
  activeSessions: number;
  pendingReports: number;
  recentActivity: Array<{ id: string; action: string; timestamp: string }>;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/admin/stats');
        setStats(response.data);
      } catch (err: any) {
        setError(err.message || 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
  if (error) return <div className="text-red-500 p-4 border border-red-500 rounded bg-red-900 bg-opacity-20">{error}</div>;
  if (!stats) return null;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="p-6 bg-gray-800 rounded-lg shadow-lg border border-gray-700 transition transform hover:-translate-y-1 hover:shadow-xl">
          <h2 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Total Users</h2>
          <p className="text-4xl font-bold text-white">{stats.totalUsers.toLocaleString()}</p>
        </div>
        <div className="p-6 bg-gray-800 rounded-lg shadow-lg border border-gray-700 transition transform hover:-translate-y-1 hover:shadow-xl">
          <h2 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Active Sessions</h2>
          <p className="text-4xl font-bold text-white">{stats.activeSessions.toLocaleString()}</p>
        </div>
        <div className="p-6 bg-gray-800 rounded-lg shadow-lg border border-gray-700 transition transform hover:-translate-y-1 hover:shadow-xl">
          <h2 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Pending Reports</h2>
          <p className="text-4xl font-bold text-white">{stats.pendingReports.toLocaleString()}</p>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4">Recent Activity</h2>
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
        {stats.recentActivity && stats.recentActivity.length > 0 ? (
          <ul className="divide-y divide-gray-700">
            {stats.recentActivity.map((activity) => (
              <li key={activity.id} className="p-4 hover:bg-gray-750 transition-colors">
                <div className="flex justify-between items-center">
                  <span className="text-gray-200">{activity.action}</span>
                  <span className="text-sm text-gray-500">{new Date(activity.timestamp).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 text-gray-500">No recent activity.</div>
        )}
      </div>
    </div>
  );
}
