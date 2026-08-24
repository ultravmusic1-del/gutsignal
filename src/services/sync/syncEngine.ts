/**
 * The sync engine (docs/PROJECT_PLAN.md §6).
 *
 * Framework-free on purpose: no React, no timers of its own, every dependency injected. That
 * makes the whole thing testable by calling `syncNow()` with fakes, and keeps it portable to
 * the Deno Edge runtime later, which risk R-09 asks for.
 *
 * Two directions:
 *   push — drain the outbox, upserting on the device-generated id, so a retry after an
 *          ambiguous timeout updates rather than duplicating
 *   pull — fetch everything changed at or after the cursor, merge last-writer-wins, and never
 *          overwrite a local edit that has not been pushed yet
 *
 * Rules it exists to enforce: the UI never waits on it, and nothing leaves the outbox until the
 * server has confirmed the write.
 */

import {
  applyServerRows,
  SYMPTOM_LOGS_TABLE,
  type SymptomLogRow,
} from '@/services/logs/symptomRepository';
import type { SqlDatabase } from '@/services/db/sqlite';
import type { IdGenerator } from '@/utils/id';

import { readCursor, writeCursor } from './cursors';
import type { NetworkMonitor } from './network';
import {
  claimDue,
  markFailed,
  markSynced,
  pendingRecordIds,
  recoverStranded,
  type OutboxRow,
} from './outbox';

/** How many outbox rows one drain pass claims. */
export const PUSH_BATCH_SIZE = 50;

/** How many server rows one pull page requests. */
export const PULL_PAGE_SIZE = 200;

/** Bound on pull pages per run, so a pathological cursor cannot loop forever. */
const MAX_PULL_PAGES = 50;

export type SyncResult = {
  pushed: number;
  failed: number;
  pulled: number;
  skipped: number;
  /** True when the run did nothing because the device is offline. */
  offline: boolean;
};

const IDLE_RESULT: SyncResult = {
  pushed: 0,
  failed: 0,
  pulled: 0,
  skipped: 0,
  offline: true,
};

/** The server side of symptom sync. Implemented over Supabase; faked in tests. */
export interface SymptomRemote {
  upsert(rows: SymptomLogRow[]): Promise<void>;
  fetchChangedSince(args: { cursor: string | null; limit: number }): Promise<SymptomLogRow[]>;
}

export type SyncEngineDeps = {
  db: SqlDatabase;
  remote: SymptomRemote;
  network: NetworkMonitor;
  generateId: IdGenerator;
  now?: () => Date;
  random?: () => number;
};

export type SyncEngine = {
  /** Runs a push then a pull. Safe to call concurrently — calls coalesce. */
  syncNow(): Promise<SyncResult>;
  /**
   * Recovers stranded work, starts a sync, and watches for reconnection. Returns the stopper.
   *
   * Resolves once recovery is done and the first sync has been *started* — not finished. Boot
   * must never wait on the network. Await `syncNow()` to join the run in progress.
   */
  start(): Promise<() => void>;
};

function parsePayload(row: OutboxRow): SymptomLogRow | null {
  try {
    return JSON.parse(row.payload) as SymptomLogRow;
  } catch {
    return null;
  }
}

export function createSyncEngine({
  db,
  remote,
  network,
  generateId,
  now = () => new Date(),
  random = Math.random,
}: SyncEngineDeps): SyncEngine {
  /** The run in progress, if any. */
  let current: Promise<SyncResult> | null = null;
  /** The single follow-up run shared by everyone who asked while `current` was busy. */
  let queued: Promise<SyncResult> | null = null;

  /**
   * Drains the outbox.
   *
   * The batch is attempted as one request first, because coming back from an outage with fifty
   * queued logs should not cost fifty round trips. If that fails, each row is retried alone, so
   * one row the server rejects cannot hold the rest of the user's history hostage.
   */
  async function push(): Promise<{ pushed: number; failed: number }> {
    const claimed = await claimDue(db, {
      tableName: SYMPTOM_LOGS_TABLE,
      limit: PUSH_BATCH_SIZE,
      now: now(),
    });

    if (claimed.length === 0) return { pushed: 0, failed: 0 };

    const parsed = claimed.map((row) => ({ row, payload: parsePayload(row) }));

    let pushed = 0;
    let failed = 0;

    // A row whose payload will not parse can never succeed. Fail it so it backs off and stays
    // visible, rather than retrying a corrupt body forever at full speed.
    const corrupt = parsed.filter((entry) => entry.payload === null);
    for (const entry of corrupt) {
      await markFailed(db, entry.row, new Error('Queued payload could not be read.'), {
        now: now(),
        random,
      });
      failed += 1;
    }

    const sendable = parsed.flatMap((entry) =>
      entry.payload === null ? [] : [{ row: entry.row, payload: entry.payload }]
    );

    if (sendable.length === 0) return { pushed, failed };

    try {
      await remote.upsert(sendable.map((entry) => entry.payload));
      for (const entry of sendable) {
        await markSynced(db, entry.row.id);
        pushed += 1;
      }
      return { pushed, failed };
    } catch {
      // Fall through to per-row isolation.
    }

    for (const entry of sendable) {
      try {
        await remote.upsert([entry.payload]);
        await markSynced(db, entry.row.id);
        pushed += 1;
      } catch (error) {
        await markFailed(db, entry.row, error, { now: now(), random });
        failed += 1;
      }
    }

    return { pushed, failed };
  }

  /** Applies everything the server has that this device has not seen. */
  async function pull(): Promise<{ pulled: number; skipped: number }> {
    let pulled = 0;
    let skipped = 0;
    let cursor = await readCursor(db, SYMPTOM_LOGS_TABLE);

    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const rows = await remote.fetchChangedSince({ cursor, limit: PULL_PAGE_SIZE });
      if (rows.length === 0) break;

      const pending = await pendingRecordIds(db, SYMPTOM_LOGS_TABLE);
      const result = await applyServerRows(db, rows, pending);
      pulled += result.applied;
      skipped += result.skipped;

      const newest = rows.reduce(
        (latest, row) => (row.updated_at > latest ? row.updated_at : latest),
        rows[0]?.updated_at ?? ''
      );

      // The cursor is inclusive, so a page that cannot advance it is the last page. Without
      // this the final page would repeat forever.
      if (newest === '' || newest === cursor) break;

      cursor = newest;
      await writeCursor(db, SYMPTOM_LOGS_TABLE, newest, now());

      if (rows.length < PULL_PAGE_SIZE) break;
    }

    return { pulled, skipped };
  }

  async function runOnce(): Promise<SyncResult> {
    // Being offline must not burn a retry attempt: that would push the backoff out for a
    // failure that was never the server's fault.
    if (!(await network.isConnected())) return IDLE_RESULT;

    const pushResult = await push();
    const pullResult = await pull();

    return { ...pushResult, ...pullResult, offline: false };
  }

  /**
   * Requests a sync, guaranteeing the caller is serviced by a run that starts *after* they
   * asked.
   *
   * Returning the run already in progress would be subtly wrong: it may have claimed its batch
   * before the caller wrote the row they are asking us to send, so it could resolve reporting
   * success while their log is still sitting in the outbox.
   *
   * So a caller arriving mid-run waits for a follow-up run instead. Every such caller shares
   * the same follow-up, which bounds the extra work at one run no matter how many arrive.
   */
  function syncNow(): Promise<SyncResult> {
    if (current === null) {
      const run = runOnce().finally(() => {
        current = null;
      });
      current = run;
      return run;
    }

    queued ??= current
      .catch(() => undefined)
      .then(() => {
        queued = null;
        return syncNow();
      });

    return queued;
  }

  async function start(): Promise<() => void> {
    // Anything claimed but never finished — a crash or a force-quit mid-push — goes back in
    // the queue. Without this those logs would sit claimed forever.
    await recoverStranded(db, now());

    const unsubscribe = network.subscribe((connected) => {
      if (connected) void syncNow();
    });

    void syncNow();

    return unsubscribe;
  }

  return { syncNow, start };
}

export type { IdGenerator };
