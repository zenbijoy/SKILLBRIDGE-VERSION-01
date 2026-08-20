import { useState, type FormEvent } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <section className="login-brand-pane">
        <div className="flex items-center gap-3"><div className="brand-mark">SB</div><div><strong>SkillBridge</strong><div className="text-[11px] text-blue-200">Secure control plane</div></div></div>
        <div><h1 className="login-brand-title">Operate the learning network with clarity.</h1><p className="login-brand-copy">Moderation, user operations, runtime health and privileged audit trails in one responsive workspace backed by real API data.</p></div>
        <div className="flex items-center gap-2 text-[11px] text-blue-100"><ShieldCheck size={17} /> Moderator or administrator role required</div>
      </section>
      <section className="login-form-pane">
        <div className="login-card">
          <div className="mb-5 inline-grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><LockKeyhole size={20} /></div>
          <h1>Welcome back</h1><p>Sign in with your Supabase account. The API will also verify your moderator/admin role before the dashboard opens.</p>
          {error ? <div className="notice notice-danger mb-4">{error}</div> : null}
          <form className="login-form" onSubmit={handleLogin}>
            <div><label className="field-label">Email</label><input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operator@example.com" /></div>
            <div><label className="field-label">Password</label><input className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" /></div>
            <button className="btn-primary login-submit" type="submit" disabled={loading}>{loading ? 'Verifying access…' : 'Sign in securely'}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
