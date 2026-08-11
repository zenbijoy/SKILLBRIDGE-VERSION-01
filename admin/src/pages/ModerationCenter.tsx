
export default function ModerationCenter() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Moderation Center</h1>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <p className="text-gray-400">Review reported content and user behavior.</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="p-4 border border-gray-700 rounded">
            <h3 className="font-bold">Pending Reports</h3>
            <p className="text-2xl">12</p>
          </div>
          <div className="p-4 border border-gray-700 rounded">
            <h3 className="font-bold">Active Suspensions</h3>
            <p className="text-2xl">5</p>
          </div>
        </div>
      </div>
    </div>
  );
}
