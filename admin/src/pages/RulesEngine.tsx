import { useState } from 'react';

interface Config {
  newDiscoverUi: boolean;
  paidSessions: boolean;
  maxRoomCapacity: number;
  uploadLimitMb: number;
  maintenanceMode: boolean;
}

export default function RulesEngine() {
  const [config, setConfig] = useState<Config>({
    newDiscoverUi: true,
    paidSessions: false,
    maxRoomCapacity: 250,
    uploadLimitMb: 50,
    maintenanceMode: false,
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleSave = () => {
    setSaving(true);
    setMessage(null);
    // Simulate API call
    setTimeout(() => {
      setSaving(false);
      setMessage({ text: 'Configuration saved successfully!', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    }, 1000);
  };

  const handleChange = (field: keyof Config, value: boolean | number) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Rules & Feature Flags</h1>

      <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
        <p className="text-gray-400 mb-6">Manage app configuration, feature flags, and business rules.</p>

        {message && (
          <div className={`mb-6 p-4 rounded border ${message.type === 'success' ? 'bg-green-900 bg-opacity-20 border-green-500 text-green-400' : 'bg-red-900 bg-opacity-20 border-red-500 text-red-400'}`}>
            {message.text}
          </div>
        )}

        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-bold border-b border-gray-700 pb-2 mb-4 text-white">Global Feature Flags</h3>
            <div className="space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="form-checkbox h-5 w-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-opacity-25"
                  checked={config.newDiscoverUi}
                  onChange={(e) => handleChange('newDiscoverUi', e.target.checked)}
                />
                <span className="text-gray-200">Enable New Discover UI</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="form-checkbox h-5 w-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-opacity-25"
                  checked={config.paidSessions}
                  onChange={(e) => handleChange('paidSessions', e.target.checked)}
                />
                <span className="text-gray-200">Enable Paid Sessions (Beta)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="form-checkbox h-5 w-5 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500 focus:ring-opacity-25"
                  checked={config.maintenanceMode}
                  onChange={(e) => handleChange('maintenanceMode', e.target.checked)}
                />
                <span className="text-red-400 font-medium">Maintenance Mode (Disables public access)</span>
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold border-b border-gray-700 pb-2 mb-4 text-white">Business Rules</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Max Room Capacity</label>
                <input
                  type="number"
                  value={config.maxRoomCapacity}
                  onChange={(e) => handleChange('maxRoomCapacity', parseInt(e.target.value) || 0)}
                  className="bg-gray-700 border border-gray-600 rounded p-2 w-full text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Maximum users allowed in a single room</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Upload Limit (MB)</label>
                <input
                  type="number"
                  value={config.uploadLimitMb}
                  onChange={(e) => handleChange('uploadLimitMb', parseInt(e.target.value) || 0)}
                  className="bg-gray-700 border border-gray-600 rounded p-2 w-full text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Maximum file size for user uploads</p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
