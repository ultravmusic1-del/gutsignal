/**
 * The local migration runner, written against the `SqlDatabase` seam rather than `expo-sqlite`.
 *
 * Keeping it free of the native module means the real migrations can be applied to a real SQL
 * engine in tests — so a broken CREATE TABLE fails here on Windows rather than on a device.
 */

import { MIGRATIONS, pendingMigrations, targetVersion, type Migration } from './migrations';
import type { SqlDatabase } from './sqlite';
import { splitSqlStatements } from './sqlStatements';

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
 *
 * ## Why the SQL is split into statements first
 *
 * The obvious implementation — `execAsync(migration.sql)` inside `withTransactionAsync` — works
 * against `node:sqlite` and **fails on every real device**:
 *
 * ```text
 * SQLiteErrorException: cannot start a transaction within a transaction
 * ```
 *
 * `expo-sqlite`'s `execAsync` opens a transaction of its own, so nesting it inside another is
 * illegal. The DDL never applied, the failed rollback that followed masked the real error, and the
 * app could not start past its boot screen — while 35 migrator tests passed, because `node:sqlite`
 * tolerates the nesting. That is what makes this worth the comment: the bug was invisible to the
 * whole suite and obvious within one second of running the app on a phone.
 *
 * `runAsync` opens no transaction, so it nests correctly — but it takes one statement at a time.
 * Hence `splitSqlStatements`, and hence the transaction staying where it belongs: atomicity is
 * kept on both engines rather than traded away for compatibility with one.
 *
 * The version record is written inside the same transaction and parameterised, so "schema change
 * and version bump succeed together, or neither does" holds on the engine that actually ships.
 */
export async function migrate(
  db: SqlDatabase,
  migrations: Migration[] = MIGRATIONS,
  now: () => Date = () => new Date()
): Promise<number> {
  await db.execAsync(SCHEMA_MIGRATIONS_TABLE);

  const current = await getSchemaVersion(db);

  for (const migration of pendingMigrations(current, migrations)) {
    await db.withTransactionAsync(async () => {
      for (const statement of splitSqlStatements(migration.sql)) {
        await db.runAsync(statement);
      }

      await db.runAsync(
        'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        migration.version,
        migration.name,
        now().toISOString()
      );
    });
  }

  return targetVersion(migrations);
}
