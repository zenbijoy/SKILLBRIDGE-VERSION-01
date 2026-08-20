import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import { AdminShell } from './components/AdminShell';

function ProtectedApp() {
  return (
    <AuthGuard>
      <AdminShell>
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
      </AdminShell>
    </AuthGuard>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
