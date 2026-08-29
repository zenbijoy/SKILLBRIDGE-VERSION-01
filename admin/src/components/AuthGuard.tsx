import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';

export function AuthGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'authorized' | 'anonymous' | 'forbidden' | 'setup_required'>('loading');
  const location = useLocation();

  useEffect(() => {
    let alive = true;

    const verify = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session) {
        setState('anonymous');
        return;
      }
      try {
        const res = await api.get('/admin/me');
        if (!alive) return;
        if (res.data.mustChangeCredentials) {
          setState('setup_required');
        } else if (res.data.status === 'suspended' || res.data.status === 'revoked') {
          setState('forbidden');
        } else if (res.data.role) {
          setState('authorized');
        } else {
          setState('forbidden');
        }
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (!alive) return;
        setState(status === 401 ? 'anonymous' : 'forbidden');
      }
    };

    void verify();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'SIGNED_OUT' || !session) {
        setState('anonymous');
      } else {
        void verify();
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-500">
        <div className="state-box">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          Checking admin access…
        </div>
      </div>
    );
  }

  if (state === 'anonymous') return <Navigate to="/login" state={{ from: location }} replace />;

  if (state === 'forbidden') {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="panel max-w-lg p-8 text-center">
          <ShieldX className="mx-auto mb-4 text-red-500" size={36} />
          <h1 className="text-xl font-black text-slate-900">Admin access required</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Your Supabase session is valid, but this account does not have a moderator or admin role in SkillBridge.
          </p>
          <div className="flex justify-center gap-3 mt-5">
            <button className="btn-secondary" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'setup_required') {
    if (location.pathname !== '/setup-owner') {
      return <Navigate to="/setup-owner" state={{ from: location }} replace />;
    }
    return <>{children}</>;
  }

  // Prevent accessing /setup-owner if not required
  if (state === 'authorized' && location.pathname === '/setup-owner') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
