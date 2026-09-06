/**
 * A `SqlDatabase` backed by Node's built-in `node:sqlite`. **Test support only.**
 *
 * Deliberately not under `__tests__/` so Jest does not collect it as a suite, and deliberately
 * never imported by application code — `node:sqlite` does not exist in Hermes. Its purpose is
 * to let the offline layer's tests run against a real SQL engine on Windows without adding a
 * native dependency to the project.
 *
 * It is wrapped in `serializeDatabase`, exactly as production is, and that is load-bearing rather
 * than tidiness. The compiler cannot catch a transaction body that uses the outer handle instead
 * of its `tx` — a zero-argument callback is assignable to one that takes a parameter — but the
 * queue can: such a statement waits for a lock its own transaction is holding. Serialising here
 * means that mistake deadlocks a test on Windows instead of freezing the app on a phone.
 */

import { DatabaseSync } from 'node:sqlite';

import { serializeDatabase } from './serialize';
import type { SqlBindValue, SqlDatabase, SqlRunResult, UnserializedSqlDatabase } from './sqlite';

export type TestDatabase = SqlDatabase & {
  /** Closes the underlying handle. */
  close(): void;
};

export function createTestDatabase(): TestDatabase {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  let depth = 0;

  const connection: UnserializedSqlDatabase = {
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
      // Savepoints rather than BEGIN, so a test that nests transactions deliberately still works.
      // The serialised wrapper is what stops them nesting by accident.
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
  };

  return {
    ...serializeDatabase(connection),
    close: () => db.close(),
  };
}
