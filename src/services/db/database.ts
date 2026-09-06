import * as SQLite from 'expo-sqlite';

import { migrate } from './migrator';

export const DATABASE_NAME = 'gutsignal.db';

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens the local database and brings it up to the current schema version.
 *
 * ## Why the *promise* is memoized, not the handle
 *
 * This used to memoize the resolved handle:
 *
 * ```ts
 * if (database) return database;   // still null while the first call is awaiting
 * ```
 *
 * which memoizes nothing during the several hundred milliseconds that matter. Around twenty call
 * sites reach for the database on launch — `useAppBoot`, `SyncProvider`, and every TanStack query
 * behind the first screen — and they all start before any of them finishes. Each saw `null`, each
 * opened the database (`expo-sqlite` hands back the *same* native connection for a given name),
 * and each ran `migrate` on it at once.
 *
 * `withTransactionAsync` issues a literal `BEGIN`, and `expo-sqlite` says in its own documentation
 * that it "is not exclusive and can be interrupted by other async queries". So two overlapping
 * migrations meant two `BEGIN`s on one connection:
 *
 * ```text
 * SQLiteErrorException: cannot start a transaction within a transaction
 * ```
 *
 * The app could not start, and which migration it died on depended on how the two runs interleaved
 * — which is why it looked like a fault in a particular migration rather than a race.
 *
 * Holding the in-flight promise makes every caller after the first await the same open, so the
 * migration runs once. It is also why `migrate` needs no locking of its own: nothing else can be
 * querying this connection yet, because the handle has not been handed out.
 *
 * A failed open clears the memo rather than caching the rejection — otherwise one bad launch would
 * poison every retry for the lifetime of the process, and boot has a retry path (spec §21).
 */
export function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (opening) return opening;

  opening = (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    try {
      // WAL keeps reads responsive while the sync engine writes. Foreign keys are off by default
      // in SQLite and must be enabled per connection.
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');

      await migrate(db);

      return db;
    } catch (error) {
      // The connection opened; it was the migration that failed. Nothing outside this function has
      // a reference to it, so without this the handle leaks — and `expo-sqlite` keeps it in its
      // native cache, where it refuses to delete a database that is still open:
      //
      //   Unable to delete database … that is currently open. Close it prior to deletion
      //
      // Which makes the one recovery a user has for an unopenable database fail. That is exactly
      // how it failed: the boot screen's delete button did nothing at all.
      await db.closeAsync().catch(() => undefined);
      throw error;
    }
  })();

  opening.catch(() => {
    opening = null;
  });

  return opening;
}

/** The migration runner and schema-version reader now live in `migrator.ts`. */
export { getSchemaVersion, migrate } from './migrator';

/** Closes and forgets the handle. Used by account deletion and by tests. */
export async function closeDatabase(): Promise<void> {
  const pending = opening;
  if (!pending) return;

  // Cleared first, so a caller arriving mid-close starts a fresh open rather than receiving a
  // handle that is about to be closed underneath it.
  opening = null;

  // A close that races a failed open has nothing to close, and must not throw on the way out.
  const db = await pending.catch(() => null);
  if (db) await db.closeAsync();
}

/**
 * Destroys all local data. Part of the account-deletion flow (spec §97): server records and
 * Storage objects are removed server-side, and the local mirror must go too.
 */
export async function deleteLocalDatabase(): Promise<void> {
  await closeDatabase();
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
}
