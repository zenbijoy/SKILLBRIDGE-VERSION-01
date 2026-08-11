import { useEffect, useState } from 'react';
import api from '../lib/api';

interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: string;
  status: string;
  createdAt: string;
}

export default function ModerationCenter() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const response = await api.get('/admin/reports');
      setReports(response.data.reports || response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'resolved' | 'dismissed') => {
    setActionLoading(id);
    try {
      await api.patch(`/admin/reports/${id}`, { status: action });
      setReports(reports.map(r => r.id === id ? { ...r, status: action } : r));
    } catch (err: any) {
      alert(`Failed to ${action} report: ` + (err.message || 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  };

  const pendingReports = reports.filter(r => r.status === 'pending');

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Moderation Center</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="p-6 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
          <h2 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Pending Reports</h2>
          <p className="text-4xl font-bold text-white">{pendingReports.length}</p>
        </div>
        <div className="p-6 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
          <h2 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Total Reports</h2>
          <p className="text-4xl font-bold text-white">{reports.length}</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Recent Reports</h2>
          <p className="text-sm text-gray-400">Review and resolve user-submitted reports.</p>
        </div>

        {error && <div className="m-6 p-4 bg-red-900 bg-opacity-20 border border-red-500 text-red-400 rounded">{error}</div>}

        {reports.length === 0 ? (
          <div className="p-6 text-gray-500 text-center">No reports found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-700 text-gray-400 text-sm uppercase tracking-wider">
                  <th className="p-4 font-medium">Date</th>
                  <th className="p-4 font-medium">Reporter</th>
                  <th className="p-4 font-medium">Reported User</th>
                  <th className="p-4 font-medium">Reason</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-750 transition-colors">
                    <td className="p-4 text-sm text-gray-300">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-sm text-gray-300 font-mono">{report.reporterId}</td>
                    <td className="p-4 text-sm text-gray-300 font-mono">{report.reportedId}</td>
                    <td className="p-4 text-sm text-gray-300 max-w-xs truncate" title={report.reason}>
                      {report.reason}
                    </td>
                    <td className="p-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                        report.status === 'pending' ? 'bg-yellow-900 text-yellow-200' :
                        report.status === 'resolved' ? 'bg-green-900 text-green-200' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {report.status}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {report.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleAction(report.id, 'resolved')}
                            disabled={actionLoading === report.id}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded disabled:opacity-50 transition-colors"
                          >
                            Resolve
                          </button>
                          <button
                            onClick={() => handleAction(report.id, 'dismissed')}
                            disabled={actionLoading === report.id}
                            className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs font-medium rounded disabled:opacity-50 transition-colors"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
