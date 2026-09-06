/**
 * The local migration runner, written against the `SqlDatabase` seam rather than `expo-sqlite`.
 *
 * Keeping it free of the native module means the real migrations can be applied to a real SQL
 * engine in tests — so a broken CREATE TABLE fails here on Windows rather than on a device.
 */

import { MIGRATIONS, pendingMigrations, targetVersion, type Migration } from './migrations';
import type { SqlDatabase } from './sqlite';

const SCHEMA_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    applied_at TEXT    NOT NULL
  );
`;

/** Highest applied version, or 0 for a fresh database. */
export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM schema_migrations'
  );
  return row?.version ?? 0;
}

/**
 * Applies pending migrations in order, each with its version record in one transaction, so a
 * crash mid-migration leaves the database on the previous version rather than half-migrated.
 */
export async function migrate(
  db: SqlDatabase,
  migrations: Migration[] = MIGRATIONS,
  now: () => Date = () => new Date()
): Promise<number> {
  await db.execAsync(SCHEMA_MIGRATIONS_TABLE);

  const current = await getSchemaVersion(db);

  for (const migration of pendingMigrations(current, migrations)) {
    await db.withTransactionAsync(async (tx) => {
      await tx.execAsync(migration.sql);
      await tx.runAsync(
        'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        migration.version,
        migration.name,
        now().toISOString()
      );
    });
  }

  return targetVersion(migrations);
}
