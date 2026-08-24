import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { bindAuthRefreshToAppState, getSupabaseClient } from '@/services/supabase/client';

export type AuthState = {
  /** Null until the initial session restore completes. */
  session: Session | null;
  /** True once the restore attempt has finished, successfully or not. */
  initialised: boolean;
  userId: string | null;
};

const AuthContext = createContext<AuthState>({
  session: null,
  initialised: false,
  userId: null,
});

/**
 * Holds the authenticated session for the app.
 *
 * The session lives here rather than in TanStack Query because it is not server state to be
 * cached and invalidated — it is a subscription. Supabase pushes changes (refresh, expiry,
 * sign-out on another device) through `onAuthStateChange`, and every consumer must see the
 * same value at the same time.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch(() => {
        // A failed restore is an unauthenticated app, not a broken one. Sign-in still works.
      })
      .finally(() => {
        if (active) setInitialised(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    const unbindRefresh = bindAuthRefreshToAppState();

    return () => {
      active = false;
      subscription.unsubscribe();
      unbindRefresh();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, initialised, userId: session?.user.id ?? null }),
    [session, initialised]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => useContext(AuthContext);
