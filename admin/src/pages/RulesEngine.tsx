
export default function RulesEngine() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Rules & Feature Flags</h1>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <p className="text-gray-400 mb-4">Manage app configuration, feature flags, and business rules.</p>
        
        <div className="space-y-6">
          <div>
            <h3 className="font-bold border-b border-gray-700 pb-2 mb-2">Global Feature Flags</h3>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input type="checkbox" className="form-checkbox bg-gray-700 border-gray-600 rounded" defaultChecked />
                <span>Enable New Discover UI</span>
              </label>
              <label className="flex items-center space-x-2">
                <input type="checkbox" className="form-checkbox bg-gray-700 border-gray-600 rounded" />
                <span>Enable Paid Sessions (Beta)</span>
              </label>
            </div>
          </div>

          <div>
            <h3 className="font-bold border-b border-gray-700 pb-2 mb-2">Business Rules</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Max Room Capacity</label>
                <input type="number" defaultValue={250} className="bg-gray-700 border border-gray-600 rounded p-1 w-32" />
              </div>
              <div>
                <label className="block text-sm mb-1">Upload Limit (MB)</label>
                <input type="number" defaultValue={50} className="bg-gray-700 border border-gray-600 rounded p-1 w-32" />
              </div>
            </div>
          </div>
          
          <button className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-bold">Save Configuration</button>
        </div>
      </div>
    </div>
  );
}
