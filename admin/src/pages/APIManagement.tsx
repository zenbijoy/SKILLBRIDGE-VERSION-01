
export default function APIManagement() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">API Management</h1>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <p className="text-gray-400 mb-4">Manage API clients, rate limits, and view provider health.</p>
        
        <div className="space-y-4">
          <div className="p-4 border border-gray-700 rounded bg-gray-900">
            <h3 className="font-bold text-green-400">System Health: Operational</h3>
            <p className="text-sm mt-1">P95 Latency: 120ms | Requests: 450/min</p>
          </div>
          
          <div>
            <h3 className="font-bold mb-2">Active API Keys</h3>
            <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm mb-2">Generate New Key</button>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-2">Name</th>
                  <th className="py-2">Created</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-2">Mobile App Production</td>
                  <td className="py-2">2026-01-10</td>
                  <td className="py-2"><button className="text-red-400 hover:underline">Revoke</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
