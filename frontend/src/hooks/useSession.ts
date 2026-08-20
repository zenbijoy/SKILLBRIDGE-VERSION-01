import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Use onAuthStateChange as the single source of truth.
    // The listener fires an INITIAL_SESSION event synchronously after
    // subscription, so we only flip loading=false after the first event.
    let didReceiveInitial = false;
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!didReceiveInitial) {
        didReceiveInitial = true;
        setLoading(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, loading };
}

