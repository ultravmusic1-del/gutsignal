import * as SQLite from 'expo-sqlite';

import { migrate } from './migrator';

export const DATABASE_NAME = 'gutsignal.db';

let database: SQLite.SQLiteDatabase | null = null;

/**
 * Opens the local database and brings it up to the current schema version.
 * Safe to call more than once — the handle is memoized.
 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;

  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // WAL keeps reads responsive while the sync engine writes. Foreign keys are off by default
  // in SQLite and must be enabled per connection.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await migrate(db);

  database = db;
  return db;
}

/** The migration runner and schema-version reader now live in `migrator.ts`. */
export { getSchemaVersion, migrate } from './migrator';

/** Closes and forgets the handle. Used by account deletion and by tests. */
export async function closeDatabase(): Promise<void> {
  if (!database) return;
  await database.closeAsync();
  database = null;
}

/**
 * Destroys all local data. Part of the account-deletion flow (spec §97): server records and
 * Storage objects are removed server-side, and the local mirror must go too.
 */
export async function deleteLocalDatabase(): Promise<void> {
  await closeDatabase();
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
}
