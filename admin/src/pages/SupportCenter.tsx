import React from 'react';

export default function SupportCenter() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Support Center</h1>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <p className="text-gray-400">View and manage user support cases.</p>
        <div className="mt-4">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="py-2">Case ID</th>
                <th className="py-2">User</th>
                <th className="py-2">Subject</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2">#1024</td>
                <td className="py-2">john@example.com</td>
                <td className="py-2">Cannot join room</td>
                <td className="py-2"><span className="text-yellow-400">Open</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
