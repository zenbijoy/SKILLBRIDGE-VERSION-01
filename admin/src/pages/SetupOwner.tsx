import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { ShieldCheck, Lock, Smartphone, CheckCircle, AlertTriangle } from 'lucide-react';

export function SetupOwner() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 1: Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Step 2: MFA
  const [mfaData, setMfaData] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // Re-authenticate to ensure recent session for sensitive changes
      const { data: userResponse, error: authError } = await supabase.auth.getUser();
      if (authError || !userResponse.user?.email) throw new Error('Could not identify user');
      
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userResponse.user.email,
        password: currentPassword
      });

      if (signInError) throw new Error('Incorrect current password.');

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setStep(2);
      await loadMfa();
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  const loadMfa = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setMfaData({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load MFA enrollment.');
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaData || mfaCode.length !== 6) return;
    setError('');
    setLoading(true);

    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaData.factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaData.factorId,
        challengeId: challenge.id,
        code: mfaCode
      });
      if (verifyError) throw verifyError;

      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  const completeSetup = async () => {
    setError('');
    setLoading(true);
    try {
      await api.post('/admin/bootstrap/complete');
      setStep(4);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to complete setup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 max-w-lg w-full overflow-hidden">
        <div className="bg-slate-900 p-6 text-center text-white">
          <ShieldCheck className="mx-auto mb-2 text-blue-400" size={36} />
          <h1 className="text-xl font-bold">Secure Account Setup</h1>
          <p className="text-sm text-slate-400 mt-1">Complete these steps to activate your administrator account.</p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm rounded-lg flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handlePasswordSubmit}>
              <div className="mb-6 flex items-center gap-3 text-slate-700 font-semibold border-b border-slate-100 pb-4">
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">1</div>
                Change Default Password
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">New Permanent Password</label>
                  <input
                    type="password"
                    required
                    minLength={12}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Must be at least 12 characters.</p>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-4 bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-70 flex justify-center items-center gap-2"
                >
                  <Lock size={18} />
                  Update Password
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleMfaSubmit}>
              <div className="mb-6 flex items-center gap-3 text-slate-700 font-semibold border-b border-slate-100 pb-4">
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">2</div>
                Enroll Two-Factor Auth
              </div>
              <div className="space-y-6">
                <p className="text-sm text-slate-600">Scan this QR code using an authenticator app (like Google Authenticator or Authy).</p>
                
                {mfaData ? (
                  <div className="flex flex-col items-center">
                    <img src={mfaData.qrCode} alt="MFA QR Code" className="w-48 h-48 border border-slate-200 rounded-lg p-2 bg-white" />
                    <p className="text-xs font-mono text-slate-500 mt-2 bg-slate-100 px-3 py-1 rounded">{mfaData.secret}</p>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-400">Loading QR Code...</div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Enter Verification Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full px-4 py-3 text-center text-xl tracking-[0.5em] font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || mfaCode.length !== 6}
                  className="w-full bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-70 flex justify-center items-center gap-2"
                >
                  <Smartphone size={18} />
                  Verify & Enable MFA
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div>
              <div className="mb-6 flex items-center gap-3 text-slate-700 font-semibold border-b border-slate-100 pb-4">
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">3</div>
                Finalize Setup
              </div>
              <p className="text-sm text-slate-600 mb-6">
                Your credentials and two-factor authentication are now configured. You can safely access the administrator dashboard.
              </p>
              <button
                onClick={completeSetup}
                disabled={loading}
                className="w-full bg-slate-900 text-white font-medium py-3 rounded-lg hover:bg-slate-800 disabled:opacity-70 flex justify-center items-center gap-2"
              >
                Finish Setup
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-6">
              <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
              <h2 className="text-lg font-bold text-slate-900">Setup Complete</h2>
              <p className="text-sm text-slate-500 mt-2 mb-6">Your account is fully secured.</p>
              <button
                onClick={() => navigate('/')}
                className="btn-primary w-full"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
