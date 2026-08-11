import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import User360 from './pages/User360';
import SupportCenter from './pages/SupportCenter';
import ModerationCenter from './pages/ModerationCenter';
import APIManagement from './pages/APIManagement';
import DatabaseOperations from './pages/DatabaseOperations';
import RulesEngine from './pages/RulesEngine';
import VerificationOverride from './pages/VerificationOverride';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <header className="p-4 bg-gray-800 border-b border-gray-700 font-bold flex justify-between">
          <span>SkillBridge Admin Control Plane</span>
        </header>
        <main className="flex-1 overflow-auto flex">
          <nav className="w-64 p-4 border-r border-gray-700 flex flex-col space-y-2 text-sm text-gray-300">
            <a href="/" className="hover:text-white">Dashboard</a>
            <a href="/users" className="hover:text-white">User 360</a>
            <a href="/support" className="hover:text-white">Support Center</a>
            <a href="/moderation" className="hover:text-white">Moderation</a>
            <a href="/rules" className="hover:text-white">Rules Engine</a>
            <a href="/verification" className="hover:text-white">Verification</a>
            <a href="/api-mgmt" className="hover:text-white">API Management</a>
            <a href="/db-ops" className="hover:text-white">Database Ops</a>
          </nav>
          <div className="flex-1 p-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/users" element={<User360 />} />
              <Route path="/support" element={<SupportCenter />} />
              <Route path="/moderation" element={<ModerationCenter />} />
              <Route path="/rules" element={<RulesEngine />} />
              <Route path="/verification" element={<VerificationOverride />} />
              <Route path="/api-mgmt" element={<APIManagement />} />
              <Route path="/db-ops" element={<DatabaseOperations />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
