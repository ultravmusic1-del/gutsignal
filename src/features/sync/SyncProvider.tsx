import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { track } from '@/services/analytics/analytics';
import { openDatabase } from '@/services/db/database';
import { clearOtherAccountsFromDevice } from '@/services/db/localAccount';
import { createMealSyncEntity } from '@/services/logs/mealRemote';
import { createSimpleLogEntities } from '@/services/logs/logEntities';
import { clearCursors } from '@/services/sync/cursors';
import { createNetworkMonitor } from '@/services/sync/network';
import { pendingCount } from '@/services/sync/outbox';
import { createSyncEngine, type SyncEngine, type SyncResult } from '@/services/sync/syncEngine';

export type SyncState = {
  /** Records written on this device that the server has not confirmed. */
  pendingCount: number;
  /** Requests a sync. Never throws — callers are UI code that must not care. */
  syncNow: () => void;
  /**
   * Runs a sync and waits for it.
   *
   * Only for the one place that genuinely has to know the outcome before continuing: sign-out,
   * which must send what it can before telling the user what is left (`CLAUDE.md` §15). Everywhere
   * else should use `syncNow` and carry on — waiting on the network is exactly what the offline
   * design exists to avoid.
   */
  flush: () => Promise<void>;
  /** Re-reads the pending count. Called after a local write. */
  refresh: () => void;
};

const SyncContext = createContext<SyncState>({
  pendingCount: 0,
  syncNow: () => {},
  flush: async () => {},
  refresh: () => {},
});

/**
 * Owns the sync engine's lifetime.
 *
 * The engine itself knows nothing about React — this is the only place the two meet. It starts
 * when a session appears, stops on sign-out, and is prompted on foreground. Reconnection is
 * handled inside the engine, which subscribes to connectivity directly.
 *
 * Nothing here blocks rendering. A sync that is slow, failing, or impossible must be invisible
 * to someone trying to log a symptom (docs/PROJECT_PLAN.md §6).
 */
/**
 * Reports why a run failed, once per run.
 *
 * Lives here rather than in the engine, which stays free of analytics so it remains portable to
 * the Edge runtime (risk R-09). Offline runs report nothing: a journey through a tunnel is not a
 * broken sync, and counting it as one would bury the failures that matter.
 */
function reportFailure(result: SyncResult | undefined): void {
  if (result?.failureReason == null) return;

  track('sync_failed', { reason: result.failureReason });
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const engineRef = useRef<SyncEngine | null>(null);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const db = await openDatabase();
        setPending(await pendingCount(db));
      } catch {
        // The badge is informational. Failing to read it must not surface as an error.
      }
    })();
  }, []);

  const flush = useCallback(async () => {
    try {
      reportFailure(await engineRef.current?.syncNow());
    } catch {
      // A failed flush is not an error to report: the caller's next step is to count what is
      // still outstanding, and that count is the same whether the attempt failed or found no
      // connection at all.
    } finally {
      refresh();
    }
  }, [refresh]);

  const syncNow = useCallback(() => {
    void (async () => {
      try {
        reportFailure(await engineRef.current?.syncNow());
      } catch {
        // Retries and backoff are the engine's job; a failed run is not a UI event.
      } finally {
        refresh();
      }
    })();
  }, [refresh]);

  useEffect(() => {
    if (userId === null) {
      engineRef.current = null;
      // The count is not reset here: with no session there is nothing to show it against, so
      // it is derived below rather than written back into state from an effect.
      return;
    }

    let cancelled = false;
    let stop: (() => void) | null = null;

    void (async () => {
      try {
        const db = await openDatabase();
        if (cancelled) return;

        // Before the engine, never after. Another account's rows left on this device are a §58
        // problem on their own, and their sync watermark would make this user's first pull resume
        // from someone else's position — so both have to be gone before anything is fetched.
        await clearOtherAccountsFromDevice(db, userId);
        if (cancelled) return;

        const engine = createSyncEngine({
          db,
          entities: [...createSimpleLogEntities(userId), createMealSyncEntity(userId)],
          network: createNetworkMonitor(),
        });

        engineRef.current = engine;
        const stopper = await engine.start();

        if (cancelled) {
          stopper();
          return;
        }

        stop = stopper;
        setPending(await pendingCount(db));
      } catch {
        // Sync being unavailable is survivable: logs are already safe on disk, and the next
        // foreground or reconnection will try again.
      }
    })();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNow();
    });

    return () => {
      cancelled = true;
      stop?.();
      subscription.remove();
      engineRef.current = null;
    };
  }, [userId, syncNow]);

  // Signing out must not leave the next account pulling from this one's watermark.
  useEffect(() => {
    if (userId !== null) return;

    void (async () => {
      try {
        await clearCursors(await openDatabase());
      } catch {
        // Nothing to do — the next sign-in re-pulls from the beginning, which is the safe way
        // for this to fail.
      }
    })();
  }, [userId]);

  const value = useMemo<SyncState>(
    () => ({ pendingCount: userId === null ? 0 : pending, syncNow, flush, refresh }),
    [userId, pending, syncNow, flush, refresh]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export const useSync = (): SyncState => useContext(SyncContext);
