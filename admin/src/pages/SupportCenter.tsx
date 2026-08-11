import { useState } from 'react';

interface Ticket {
  id: string;
  userEmail: string;
  subject: string;
  status: 'Open' | 'In Progress' | 'Closed';
  priority: 'High' | 'Medium' | 'Low';
  createdAt: string;
}

const mockTickets: Ticket[] = [
  { id: '#1024', userEmail: 'john@example.com', subject: 'Cannot join room', status: 'Open', priority: 'High', createdAt: '2023-10-27T10:00:00Z' },
  { id: '#1025', userEmail: 'alice@example.com', subject: 'Audio not working', status: 'In Progress', priority: 'Medium', createdAt: '2023-10-26T14:30:00Z' },
  { id: '#1026', userEmail: 'bob@example.com', subject: 'Billing issue', status: 'Closed', priority: 'Low', createdAt: '2023-10-25T09:15:00Z' },
  { id: '#1027', userEmail: 'charlie@example.com', subject: 'Feature request', status: 'Open', priority: 'Low', createdAt: '2023-10-27T11:45:00Z' },
];

export default function SupportCenter() {
  const [tickets] = useState<Ticket[]>(mockTickets);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Support Center</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="p-6 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
          <h2 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Open Tickets</h2>
          <p className="text-4xl font-bold text-white">{tickets.filter(t => t.status === 'Open').length}</p>
        </div>
        <div className="p-6 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
          <h2 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">In Progress</h2>
          <p className="text-4xl font-bold text-white">{tickets.filter(t => t.status === 'In Progress').length}</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">Recent Cases</h2>
            <p className="text-sm text-gray-400">View and manage user support cases.</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
            Create Case
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-700 text-gray-400 text-sm uppercase tracking-wider">
                <th className="p-4 font-medium">Case ID</th>
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">User</th>
                <th className="p-4 font-medium">Subject</th>
                <th className="p-4 font-medium">Priority</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-gray-750 transition-colors">
                  <td className="p-4 text-sm text-gray-300 font-mono">{ticket.id}</td>
                  <td className="p-4 text-sm text-gray-300">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-sm text-gray-300">{ticket.userEmail}</td>
                  <td className="p-4 text-sm text-gray-300">{ticket.subject}</td>
                  <td className="p-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                      ticket.priority === 'High' ? 'bg-red-900 text-red-200' :
                      ticket.priority === 'Medium' ? 'bg-yellow-900 text-yellow-200' :
                      'bg-blue-900 text-blue-200'
                    }`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="p-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                      ticket.status === 'Open' ? 'bg-yellow-900 text-yellow-200' :
                      ticket.status === 'In Progress' ? 'bg-blue-900 text-blue-200' :
                      'bg-green-900 text-green-200'
                    }`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded transition-colors">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
