import React from 'react';

export default function VerificationOverride() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Verification Override</h1>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <p className="text-gray-400 mb-4">Audited verification overrides for specific users/entities.</p>
        
        <div className="mb-6">
          <h3 className="font-bold mb-2">Create Override</h3>
          <div className="flex space-x-2">
            <input type="text" placeholder="User ID" className="bg-gray-700 border border-gray-600 rounded p-2 flex-1" />
            <select className="bg-gray-700 border border-gray-600 rounded p-2">
              <option>APPROVE_OVERRIDE</option>
              <option>REJECT_OVERRIDE</option>
              <option>BYPASS_REQUIRED_STEP</option>
            </select>
            <input type="text" placeholder="Reason (Required)" className="bg-gray-700 border border-gray-600 rounded p-2 flex-1" />
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-bold">Apply</button>
          </div>
        </div>

        <div>
          <h3 className="font-bold mb-2">Active Overrides</h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="py-2">User ID</th>
                <th className="py-2">Action</th>
                <th className="py-2">Reason</th>
                <th className="py-2">Admin</th>
                <th className="py-2">Revoke</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2">u-1234</td>
                <td className="py-2">APPROVE_OVERRIDE</td>
                <td className="py-2">Manual verification of student ID</td>
                <td className="py-2">admin@skillbridge.com</td>
                <td className="py-2"><button className="text-red-400 hover:underline">Revoke</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
