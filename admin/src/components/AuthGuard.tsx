import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert, LogOut, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';

export function AuthGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'authorized' | 'anonymous' | 'forbidden' | 'setup_required'>('loading');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    let alive = true;

    const verify = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (!alive) return;

        if (sessionError || !session?.user) {
          setState('anonymous');
          return;
        }

        setUserEmail(session.user.email ?? session.user.id);

        // STEP 1: Direct verification via Supabase admin_accounts table
        // (Bypasses backend cold starts, 0 CORS issues, instant 50ms verification)
        try {
          const { data: adminRecord } = await supabase
            .from('admin_accounts')
            .select('role, status, must_change_credentials')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (!alive) return;

          if (adminRecord && adminRecord.status === 'active') {
            if (adminRecord.must_change_credentials) {
              setState('setup_required');
              return;
            }
            if (['owner', 'admin', 'co_admin', 'auditor', 'moderator'].includes(adminRecord.role)) {
              setState('authorized');
              // Silently warm up backend in background without blocking UI
              api.get('/admin/me').catch(() => {});
              return;
            }
          }
        } catch (sbErr) {
          console.warn('[AuthGuard] Supabase admin_accounts lookup error:', sbErr);
        }

        // STEP 2: Check profile roles directly in Supabase
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('roles, account_status')
            .eq('id', session.user.id)
            .maybeSingle();

          if (!alive) return;

          if (
            profile &&
            profile.account_status === 'active' &&
            Array.isArray(profile.roles) &&
            profile.roles.some((r: string) => ['owner', 'admin', 'moderator'].includes(r))
          ) {
            setState('authorized');
            api.get('/admin/me').catch(() => {});
            return;
          }
        } catch (profErr) {
          console.warn('[AuthGuard] Profiles lookup error:', profErr);
        }

        // STEP 3: Fallback check against backend /admin/me API
        try {
          const res = await api.get('/admin/me');
          if (!alive) return;

          if (res.data.mustChangeCredentials) {
            setState('setup_required');
            return;
          }
          if (res.data.status === 'active' && res.data.role) {
            setState('authorized');
            return;
          }
        } catch {
          // Backend offline, sleeping, CORS, or forbidden
        }

        if (!alive) return;
        setState('forbidden');
      } catch (err) {
        console.error('[AuthGuard] Unexpected verification error:', err);
        if (!alive) return;
        setState('forbidden');
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
          Checking administrator access…
        </div>
      </div>
    );
  }

  if (state === 'anonymous') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (state === 'forbidden') {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="panel max-w-lg p-8 text-center shadow-lg border border-slate-200 rounded-2xl bg-white">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <ShieldAlert size={26} />
          </div>
          <h1 className="text-xl font-black text-slate-900">Admin access required</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            You are currently signed in as <strong className="text-slate-900 font-semibold">{userEmail || 'an authenticated user'}</strong>.
            This account does not have moderator or administrator privileges in SkillBridge.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 mt-6">
            <button
              type="button"
              className="btn-primary inline-flex items-center justify-center gap-2"
              onClick={async () => {
                await supabase.auth.signOut();
                try {
                  localStorage.clear();
                  sessionStorage.clear();
                } catch {}
                setState('anonymous');
              }}
            >
              <LogOut size={16} /> Sign out & switch account
            </button>
            <button
              type="button"
              className="btn-secondary inline-flex items-center justify-center gap-2"
              onClick={async () => {
                setState('loading');
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                  setState('anonymous');
                  return;
                }
                const { data: adminRecord } = await supabase
                  .from('admin_accounts')
                  .select('role, status')
                  .eq('user_id', session.user.id)
                  .maybeSingle();

                if (adminRecord && adminRecord.status === 'active' && ['owner', 'admin', 'moderator'].includes(adminRecord.role)) {
                  setState('authorized');
                } else {
                  setState('forbidden');
                }
              }}
            >
              <RefreshCw size={16} /> Retry verification
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
