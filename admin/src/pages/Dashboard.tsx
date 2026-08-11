
export default function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-gray-800 rounded-lg shadow border border-gray-700">
          <h2 className="text-gray-400">Total Users</h2>
          <p className="text-3xl font-bold">12,345</p>
        </div>
        <div className="p-4 bg-gray-800 rounded-lg shadow border border-gray-700">
          <h2 className="text-gray-400">Active Sessions</h2>
          <p className="text-3xl font-bold">42</p>
        </div>
        <div className="p-4 bg-gray-800 rounded-lg shadow border border-gray-700">
          <h2 className="text-gray-400">Pending Reports</h2>
          <p className="text-3xl font-bold">7</p>
        </div>
      </div>
    </div>
  );
}
