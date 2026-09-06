/**
 * Keeping one person's diary off another person's screen (`CLAUDE.md` §28, §58).
 *
 * The local database is a mirror, not a cache: it holds every symptom, meal and bowel entry in
 * plain rows, and today nothing removes them when a different person signs in on the same device.
 * A shared phone, a family iPad, a demo handset — the second user's queries filter by `user_id`,
 * so they never *see* the first user's entries, but the entries are still there. §58 calls known
 * cross-user data access a release blocker, and "the UI happens not to show it" is not an access
 * control.
 *
 * **The sync watermark matters here too.** `sync_cursors` records how far the last pull reached,
 * keyed by table rather than by user, so a stale one makes the next user's first sync resume from
 * someone else's position and silently skip their older history. `SyncProvider` already clears it
 * on a clean sign-out; this clears it again on the paths that sign-out never saw — a force-quit
 * before the effect ran, or a session that changed underneath the app. Belt as well as braces,
 * because the failure is silent and the cost of the extra `DELETE` is nothing.
 *
 * **On discarding unsent work.** §15 forbids silently discarding an unsynchronised record, and
 * clearing a departed user's rows can do exactly that. Sign-out is the only moment where it can be
 * said to the person it belongs to, so that is where it is said — `features/auth/signOutPlan.ts`
 * flushes, counts what is left and names it before continuing. This module is the second line:
 * it *counts* what it discards and returns the number, so no caller can do it unknowingly.
 */

import type { SqlDatabase } from './sqlite';

/**
 * Every table holding rows owned by a user, children before parents.
 *
 * Ordered so a delete is correct whether or not `PRAGMA foreign_keys` happens to be on. Relying
 * on cascade would make this depend on connection state set somewhere else entirely.
 */
export const USER_SCOPED_TABLES = [
  'meal_items',
  'meal_tags',
  'meal_logs',
  'symptom_logs',
  'bowel_logs',
  'wellbeing_logs',
  'context_logs',
] as const;

export type UserScopedTable = (typeof USER_SCOPED_TABLES)[number];

/** Tables the outbox can reference. Children sync with their parent, so they are not queued. */
const SYNCABLE_TABLES: UserScopedTable[] = [
  'meal_logs',
  'symptom_logs',
  'bowel_logs',
  'wellbeing_logs',
  'context_logs',
];

/** Queue states meaning "the server has not got this yet". */
const UNSENT_STATUSES = ['pending', 'syncing', 'failed'];

/** Every user with rows on this device, sorted so the result is stable to assert on. */
export async function localDataOwners(db: SqlDatabase): Promise<string[]> {
  const union = USER_SCOPED_TABLES.map((table) => `SELECT user_id FROM ${table}`).join(' UNION ');

  const rows = await db.getAllAsync<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM (${union}) ORDER BY user_id`
  );

  return rows.map((row) => row.user_id);
}

/**
 * How many of a user's entries the server has not accepted yet.
 *
 * The queue has no `user_id` of its own — it points at rows by table and id — so ownership is
 * resolved by joining back to the row itself.
 */
export async function pendingSyncCountFor(db: SqlDatabase, userId: string): Promise<number> {
  const statuses = UNSENT_STATUSES.map(() => '?').join(', ');

  const clauses = SYNCABLE_TABLES.map(
    (table) =>
      `(q.table_name = '${table}' AND EXISTS (SELECT 1 FROM ${table} t
         WHERE t.id = q.record_id AND t.user_id = ?))`
  ).join(' OR ');

  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sync_queue q
      WHERE q.status IN (${statuses}) AND (${clauses})`,
    ...UNSENT_STATUSES,
    ...SYNCABLE_TABLES.map(() => userId)
  );

  return row?.n ?? 0;
}

export type LocalWipeResult = {
  /** Users whose data was removed. Empty when there was nothing to do. */
  owners: string[];
  rowsDeleted: number;
  /** Entries removed before the server had accepted them. Never discard this silently (§15). */
  unsentDiscarded: number;
};

/**
 * Removes every user's local data except the one signing in.
 *
 * Pass `null` to clear everything, which is what signing out of a device being handed on, or
 * deleting an account, needs.
 *
 * Deliberately a no-op when the device already belongs to this user: signing back in must not
 * cost someone their offline entries, and the common case is exactly that.
 */
export async function wipeLocalDataExcept(
  db: SqlDatabase,
  userId: string | null
): Promise<LocalWipeResult> {
  const owners = (await localDataOwners(db)).filter((owner) => owner !== userId);

  if (owners.length === 0) return { owners: [], rowsDeleted: 0, unsentDiscarded: 0 };

  let unsentDiscarded = 0;
  for (const owner of owners) {
    unsentDiscarded += await pendingSyncCountFor(db, owner);
  }

  const placeholders = owners.map(() => '?').join(', ');

  // Queue entries first, while the rows they point at still exist to identify them by owner.
  for (const table of SYNCABLE_TABLES) {
    await db.runAsync(
      `DELETE FROM sync_queue
        WHERE table_name = '${table}'
          AND record_id IN (SELECT id FROM ${table} WHERE user_id IN (${placeholders}))`,
      ...owners
    );
  }

  let rowsDeleted = 0;
  for (const table of USER_SCOPED_TABLES) {
    const result = await db.runAsync(
      `DELETE FROM ${table} WHERE user_id IN (${placeholders})`,
      ...owners
    );
    rowsDeleted += result.changes;
  }

  // The watermark is per table, not per user: leaving it would make the new user's first pull
  // resume from someone else's position and skip their older history entirely.
  await db.runAsync('DELETE FROM sync_cursors');

  return { owners, rowsDeleted, unsentDiscarded };
}

/**
 * The sign-in guard: clear anyone else's data before this session reads or syncs anything.
 *
 * Failure is swallowed on purpose. This runs on the path to a working app, and a device that
 * cannot complete the wipe is still a device where the signed-in user's own queries are scoped to
 * their own `user_id` — refusing to start would trade a defence-in-depth measure for an app that
 * does not open.
 *
 * The `unsentDiscarded` count is deliberately surfaced rather than dropped. Sign-out now flushes
 * and warns before this can happen (`features/auth/signOutPlan.ts`), so reaching here with a
 * non-zero count means one of two things: the user was told and signed out anyway, or the app
 * never got a clean sign-out at all — a force-quit, or a session revoked from elsewhere. Neither
 * is silent by then, but the count is still worth a developer's attention.
 */
export async function clearOtherAccountsFromDevice(
  db: SqlDatabase,
  userId: string
): Promise<LocalWipeResult | null> {
  try {
    const result = await wipeLocalDataExcept(db, userId);

    if (__DEV__ && result.unsentDiscarded > 0) {
      console.warn(
        `[localAccount] Cleared ${result.owners.length} other account(s) from this device, ` +
          `discarding ${result.unsentDiscarded} entr${result.unsentDiscarded === 1 ? 'y' : 'ies'} ` +
          'the server had not accepted. Either the user was warned at sign-out and continued, or ' +
          'this device never got a clean sign-out.'
      );
    }

    return result;
  } catch {
    return null;
  }
}
