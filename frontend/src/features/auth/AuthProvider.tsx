import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  initializing: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let alive = true;

    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        setSession(data?.session ?? null);
        setUser(data?.session?.user ?? null);
        setInitializing(false);
      }
    }).catch((err) => {
      console.warn("Error fetching initial session:", err);
      if (alive) {
        setSession(null);
        setUser(null);
        setInitializing(false);
      }
    });

    // Listen to real-time auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (alive) {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setInitializing(false);
      }
    });

    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, initializing }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
