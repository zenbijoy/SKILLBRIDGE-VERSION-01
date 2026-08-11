import { useState } from 'react';

export default function APIManagement() {
  const [keys, setKeys] = useState([
    { id: '1', name: 'Mobile App Production', created: '2026-01-10' },
    { id: '2', name: 'Web Client', created: '2026-02-15' }
  ]);

  const handleRevoke = (id: string) => {
    if (confirm('Are you sure you want to revoke this key?')) {
      setKeys(keys.filter(k => k.id !== id));
    }
  };

  const generateNewKey = () => {
    const newName = prompt('Enter a name for the new API key:');
    if (newName) {
      setKeys([...keys, { id: Math.random().toString(), name: newName, created: new Date().toISOString().split('T')[0] }]);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">API Management</h1>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
        <p className="text-gray-400 mb-6">Manage API clients, rate limits, and view provider health.</p>

        <div className="space-y-6">
          <div className="p-6 border border-gray-700 rounded-lg bg-gray-900 shadow-inner flex items-center justify-between">
            <div>
              <h3 className="font-bold text-green-400 text-lg flex items-center">
                <span className="h-3 w-3 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                System Health: Operational
              </h3>
              <p className="text-sm text-gray-400 mt-2">P95 Latency: <span className="font-mono text-gray-200">120ms</span> | Requests: <span className="font-mono text-gray-200">450/min</span></p>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Active API Keys</h3>
              <button
                onClick={generateNewKey}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
              >
                Generate New Key
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-700 text-gray-400 text-sm uppercase tracking-wider">
                    <th className="p-4 font-medium">Name</th>
                    <th className="p-4 font-medium">Key Prefix</th>
                    <th className="p-4 font-medium">Created</th>
                    <th className="p-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {keys.map((key) => (
                    <tr key={key.id} className="hover:bg-gray-750 transition-colors">
                      <td className="p-4 text-sm text-gray-200">{key.name}</td>
                      <td className="p-4 text-sm text-gray-400 font-mono">sk_live_...{key.id.substring(0, 4)}</td>
                      <td className="p-4 text-sm text-gray-400">{key.created}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleRevoke(key.id)}
                          className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                  {keys.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-gray-500">No active API keys.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
