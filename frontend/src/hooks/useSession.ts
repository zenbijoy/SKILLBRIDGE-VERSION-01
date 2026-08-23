import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    // Get initial session with catch handler
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) {
          setSession(data?.session ?? null);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("Error fetching initial session:", err);
        if (alive) {
          setSession(null);
          setLoading(false);
        }
      });

    // Listen to real-time auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (alive) {
        setSession(currentSession);
        setLoading(false);
      }
    });

    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, []);

  return { session, loading };
}
