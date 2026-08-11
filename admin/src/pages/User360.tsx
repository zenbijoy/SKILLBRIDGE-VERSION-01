import React, { useState } from 'react';

export default function User360() {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">User 360</h1>
      <div className="flex space-x-4 mb-4 border-b border-gray-700 pb-2">
        {['profile', 'skills', 'rooms', 'reputation', 'impersonation', 'activity'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded capitalize ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {tab}
          </button>
        ))}
      </div>
      
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        {activeTab === 'profile' && (
          <div>
            <h2 className="text-xl mb-2">Profile Overview</h2>
            <div className="space-y-2">
              <p><span className="text-gray-400">ID:</span> 0000-0000-0000-0000</p>
              <p><span className="text-gray-400">Name:</span> John Doe</p>
              <p><span className="text-gray-400">Email:</span> john@example.com</p>
              <p><span className="text-gray-400">Status:</span> <span className="text-green-400">Active</span></p>
              <div className="mt-4">
                <button className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded mr-2">Suspend User</button>
                <button className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded">Deactivate</button>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'skills' && (
          <div>
            <h2 className="text-xl mb-2">Skills</h2>
            <ul className="list-disc pl-5">
              <li>React (Expert)</li>
              <li>TypeScript (Advanced)</li>
              <li>Node.js (Intermediate)</li>
            </ul>
          </div>
        )}

        {activeTab === 'rooms' && (
          <div>
            <h2 className="text-xl mb-2">Rooms & Sessions</h2>
            <p>Owned: 2 | Joined: 5</p>
          </div>
        )}

        {activeTab === 'reputation' && (
          <div>
            <h2 className="text-xl mb-2">Reputation</h2>
            <p>Score: 450</p>
            <p>Tier: Gold</p>
          </div>
        )}

        {activeTab === 'impersonation' && (
          <div>
            <h2 className="text-xl mb-2">Support Impersonation</h2>
            <p className="text-sm text-gray-400 mb-4">Grant short-lived delegation for support purposes.</p>
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Start READ_ONLY Session</button>
          </div>
        )}

        {activeTab === 'activity' && (
          <div>
            <h2 className="text-xl mb-2">Activity Logs</h2>
            <p className="text-sm text-gray-400">No recent activity.</p>
          </div>
        )}
      </div>
    </div>
  );
}
