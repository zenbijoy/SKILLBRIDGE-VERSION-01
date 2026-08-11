import { useState } from 'react';

interface Migration {
  id: string;
  name: string;
  runAt: string;
  status: 'Success' | 'Failed' | 'Pending';
}

const mockMigrations: Migration[] = [
  { id: '202608101430', name: 'add_user_roles', runAt: '2026-08-10T14:30:00Z', status: 'Success' },
  { id: '202608110900', name: 'create_reports_table', runAt: '2026-08-11T09:00:00Z', status: 'Success' },
  { id: '202608121015', name: 'update_room_capacity_limit', runAt: '2026-08-12T10:15:00Z', status: 'Pending' },
];

export default function DatabaseOperations() {
  const [selectedEntity, setSelectedEntity] = useState('');
  const [migrations] = useState<Migration[]>(mockMigrations);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Database Operations</h1>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
        <p className="text-gray-400 mb-6">Safe data browser, migration status, and backup management.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="p-6 border border-gray-700 rounded-lg bg-gray-900 shadow-inner">
            <h3 className="text-xl font-bold text-white mb-3">Database Health</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Connections</span>
                <span className="font-mono text-gray-200">45/100</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 mb-4">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '45%' }}></div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">DB Size</span>
                <span className="font-mono text-gray-200">2.4 GB</span>
              </div>
            </div>
          </div>
          <div className="p-6 border border-gray-700 rounded-lg bg-gray-900 shadow-inner">
            <h3 className="text-xl font-bold text-white mb-3">Latest Backup</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <span className="font-bold text-green-400">Success</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Time</span>
                <span className="text-gray-200">2 hours ago</span>
              </div>
              <div className="mt-4 pt-2 border-t border-gray-800">
                <button className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors">
                  Trigger Manual Backup
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4 text-white">Migration Status</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-700 text-gray-400 text-sm uppercase tracking-wider">
                  <th className="p-4 font-medium">Version ID</th>
                  <th className="p-4 font-medium">Name</th>
                  <th className="p-4 font-medium">Run At</th>
                  <th className="p-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {migrations.map((mig) => (
                  <tr key={mig.id} className="hover:bg-gray-750 transition-colors">
                    <td className="p-4 text-sm text-gray-300 font-mono">{mig.id}</td>
                    <td className="p-4 text-sm text-gray-300">{mig.name}</td>
                    <td className="p-4 text-sm text-gray-300">
                      {new Date(mig.runAt).toLocaleString()}
                    </td>
                    <td className="p-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                        mig.status === 'Success' ? 'bg-green-900 text-green-200' :
                        mig.status === 'Failed' ? 'bg-red-900 text-red-200' :
                        'bg-yellow-900 text-yellow-200'
                      }`}>
                        {mig.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pt-6 border-t border-gray-700">
          <h3 className="text-xl font-bold mb-2 text-white">Safe Data Browser</h3>
          <p className="text-sm text-gray-400 mb-4">Browse whitelisted entities for debugging purposes.</p>
          <div className="flex space-x-4">
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="bg-gray-900 border border-gray-600 rounded p-3 text-white w-full max-w-xs focus:outline-none focus:border-blue-500"
            >
              <option value="">Select Entity...</option>
              <option value="users">users</option>
              <option value="rooms">rooms</option>
              <option value="sessions">sessions</option>
              <option value="clubs">clubs</option>
            </select>
            <button
              disabled={!selectedEntity}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors disabled:opacity-50"
            >
              Browse
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
