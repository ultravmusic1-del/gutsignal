import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { envResult } from '@/config/env';

import { secureStorageAdapter } from './secureStorageAdapter';

/**
 * Supabase client.
 *
 * - Sessions persist in the Keychain/Keystore (chunked — see secureStorageAdapter).
 * - `detectSessionInUrl` is off: that is a browser concern and would misfire on deep links.
 * - Auto-refresh is tied to app foreground state so a backgrounded app is not refreshing
 *   tokens on a timer.
 * - Only the PUBLISHABLE key is ever used here. The service-role key must never reach the
 *   client (CLAUDE.md §14, §58).
 */

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  if (!envResult.ok) {
    // Callers must check the boot state before reaching here; this is a programmer error.
    throw new Error(
      `Supabase client requested with invalid configuration: ${envResult.problems.join('; ')}`
    );
  }

  client = createClient(envResult.env.supabaseUrl, envResult.env.supabasePublishableKey, {
    auth: {
      storage: secureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}

/**
 * Starts/stops token auto-refresh with app foreground state.
 * Returns an unsubscribe function; call it from the boot provider's cleanup.
 */
export function bindAuthRefreshToAppState(): () => void {
  const supabase = getSupabaseClient();

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });

  if (AppState.currentState === 'active') {
    void supabase.auth.startAutoRefresh();
  }

  return () => {
    subscription.remove();
    void supabase.auth.stopAutoRefresh();
  };
}

/** Test seam — drops the memoized client. */
export function resetSupabaseClientForTests(): void {
  client = null;
}
