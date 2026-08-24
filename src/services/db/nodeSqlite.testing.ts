/**
 * A `SqlDatabase` backed by Node's built-in `node:sqlite`. **Test support only.**
 *
 * Deliberately not under `__tests__/` so Jest does not collect it as a suite, and deliberately
 * never imported by application code — `node:sqlite` does not exist in Hermes. Its purpose is
 * to let the offline layer's tests run against a real SQL engine on Windows without adding a
 * native dependency to the project.
 */

import { DatabaseSync } from 'node:sqlite';

import type { SqlBindValue, SqlDatabase, SqlRunResult } from './sqlite';

export type TestDatabase = SqlDatabase & {
  /** Closes the underlying handle. */
  close(): void;
};

export function createTestDatabase(): TestDatabase {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  let depth = 0;

  return {
    async execAsync(source: string): Promise<void> {
      db.exec(source);
    },

    async runAsync(source: string, ...params: SqlBindValue[]): Promise<SqlRunResult> {
      const result = db.prepare(source).run(...params);
      return { changes: Number(result.changes) };
    },

    async getFirstAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T | null> {
      const row = db.prepare(source).get(...params);
      return (row as T | undefined) ?? null;
    },

    async getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]> {
      return db.prepare(source).all(...params) as T[];
    },

    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      // Savepoints rather than BEGIN so a nested call behaves, matching expo-sqlite.
      const name = `sp_${depth}`;
      depth += 1;
      db.exec(`SAVEPOINT ${name};`);

      try {
        await task();
        db.exec(`RELEASE ${name};`);
      } catch (error) {
        db.exec(`ROLLBACK TO ${name};`);
        db.exec(`RELEASE ${name};`);
        throw error;
      } finally {
        depth -= 1;
      }
    },

    close(): void {
      db.close();
    },
  };
}
