import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import User360 from './pages/User360';
import SupportCenter from './pages/SupportCenter';
import ModerationCenter from './pages/ModerationCenter';
import APIManagement from './pages/APIManagement';
import DatabaseOperations from './pages/DatabaseOperations';
import RulesEngine from './pages/RulesEngine';
import VerificationOverride from './pages/VerificationOverride';
import Login from './pages/Login';
import { AuthGuard } from './components/AuthGuard';
import { supabase } from './lib/supabase';

function App() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `p-2 rounded block ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 hover:text-white'}`;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <div className="min-h-screen bg-gray-900 text-white flex flex-col">
                <header className="p-4 bg-gray-800 border-b border-gray-700 font-bold flex justify-between items-center">
                  <span>SkillBridge Admin Control Plane</span>
                  <button
                    onClick={handleLogout}
                    className="text-sm bg-red-600 hover:bg-red-700 text-white py-1 px-3 rounded"
                  >
                    Logout
                  </button>
                </header>
                <main className="flex-1 overflow-hidden flex">
                  <nav className="w-64 p-4 border-r border-gray-700 flex flex-col space-y-2 text-sm text-gray-300">
                    <NavLink to="/" className={navLinkClass}>Dashboard</NavLink>
                    <NavLink to="/users" className={navLinkClass}>User 360</NavLink>
                    <NavLink to="/support" className={navLinkClass}>Support Center</NavLink>
                    <NavLink to="/moderation" className={navLinkClass}>Moderation</NavLink>
                    <NavLink to="/rules" className={navLinkClass}>Rules Engine</NavLink>
                    <NavLink to="/verification" className={navLinkClass}>Verification</NavLink>
                    <NavLink to="/api-mgmt" className={navLinkClass}>API Management</NavLink>
                    <NavLink to="/db-ops" className={navLinkClass}>Database Ops</NavLink>
                  </nav>
                  <div className="flex-1 p-6 overflow-auto bg-gray-900">
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
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
