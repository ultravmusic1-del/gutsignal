import * as SQLite from 'expo-sqlite';

import { MIGRATIONS, pendingMigrations, targetVersion, type Migration } from './migrations';

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

/** Applies pending migrations, each inside its own transaction. */
export async function migrate(
  db: SQLite.SQLiteDatabase,
  migrations: Migration[] = MIGRATIONS
): Promise<number> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at TEXT    NOT NULL
    );
  `);

  const current = await getSchemaVersion(db);

  for (const migration of pendingMigrations(current, migrations)) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.runAsync(
        'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        migration.version,
        migration.name,
        new Date().toISOString()
      );
    });
  }

  return targetVersion(migrations);
}

export async function getSchemaVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM schema_migrations'
  );
  return row?.version ?? 0;
}

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
