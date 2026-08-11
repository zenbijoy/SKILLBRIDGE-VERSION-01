
export default function DatabaseOperations() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Database Operations</h1>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <p className="text-gray-400 mb-4">Safe data browser and backup management.</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 border border-gray-700 rounded bg-gray-900">
            <h3 className="font-bold">Database Health</h3>
            <p className="text-sm mt-1">Connections: 45/100</p>
            <p className="text-sm">DB Size: 2.4 GB</p>
          </div>
          <div className="p-4 border border-gray-700 rounded bg-gray-900">
            <h3 className="font-bold">Latest Backup</h3>
            <p className="text-sm mt-1">Status: <span className="text-green-400">Success</span></p>
            <p className="text-sm">Time: 2 hours ago</p>
          </div>
        </div>

        <div>
          <h3 className="font-bold mb-2">Safe Data Browser</h3>
          <p className="text-sm text-gray-400 mb-2">Browse whitelisted entities.</p>
          <select className="bg-gray-700 border border-gray-600 rounded p-2 text-white w-full max-w-xs">
            <option>Select Entity...</option>
            <option>users</option>
            <option>rooms</option>
            <option>sessions</option>
            <option>clubs</option>
          </select>
        </div>
      </div>
    </div>
  );
}
