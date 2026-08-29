import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import { AdminShell } from './components/AdminShell';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const User360 = lazy(() => import('./pages/User360'));
const SupportCenter = lazy(() => import('./pages/SupportCenter'));
const ModerationCenter = lazy(() => import('./pages/ModerationCenter'));
const APIManagement = lazy(() => import('./pages/APIManagement'));
const DatabaseOperations = lazy(() => import('./pages/DatabaseOperations'));
const RulesEngine = lazy(() => import('./pages/RulesEngine'));
const VerificationOverride = lazy(() => import('./pages/VerificationOverride'));
const Login = lazy(() => import('./pages/Login'));
const ProductExperience = lazy(() => import('./pages/ProductExperience'));
const SystemHealth = lazy(() => import('./pages/SystemHealth'));
const SetupOwner = lazy(() => import('./pages/SetupOwner').then(m => ({ default: m.SetupOwner })));
const Administrators = lazy(() => import('./pages/Administrators').then(m => ({ default: m.Administrators })));

function ProtectedApp() {
  return (
    <AuthGuard>
      <Routes>
        <Route path="/setup-owner" element={<Suspense fallback={null}><SetupOwner /></Suspense>} />
        <Route path="/*" element={
          <AdminShell>
            <Suspense fallback={<div className="panel"><div className="panel-body">Loading control plane…</div></div>}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/system-status" element={<SystemHealth />} />
                <Route path="/system-health" element={<SystemHealth />} />
                <Route path="/users" element={<User360 />} />
                <Route path="/administrators" element={<Administrators />} />
                <Route path="/support" element={<SupportCenter />} />
                <Route path="/moderation" element={<ModerationCenter />} />
                <Route path="/rules" element={<RulesEngine />} />
                <Route path="/experience" element={<ProductExperience />} />
                <Route path="/verification" element={<VerificationOverride />} />
                <Route path="/api-mgmt" element={<APIManagement />} />
                <Route path="/db-ops" element={<DatabaseOperations />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AdminShell>
        } />
      </Routes>
    </AuthGuard>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Suspense fallback={null}><Login /></Suspense>} />
        <Route path="/*" element={<ProtectedApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
