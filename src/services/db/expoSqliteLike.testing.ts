/**
 * A connection that behaves the way `expo-sqlite` does. **Test support only.**
 *
 * `nodeSqlite.testing.ts` is the convenient adapter — savepoints, forgiving, good for exercising
 * repository logic. This one is the opposite: it reproduces the vendor's actual transaction
 * semantics, which are what caused two shipped defects.
 *
 * Two properties matter, and both come from `expo-sqlite`'s own implementation
 * (`build/SQLiteDatabase.js:120`):
 *
 * 1. `withTransactionAsync` is a literal `BEGIN` / `COMMIT` pair sent through `execAsync`. It is
 *    not a savepoint and it does not nest. The vendor documents it as "not exclusive and can be
 *    interrupted by other async queries".
 * 2. The engine underneath is real `node:sqlite`, so `cannot start a transaction within a
 *    transaction` is raised by SQLite itself rather than asserted by a fake written to agree with
 *    whatever diagnosis was current.
 *
 * Deliberately not under `__tests__/` so Jest does not collect it as a suite, and never imported
 * by application code — `node:sqlite` does not exist in Hermes.
 */

import { DatabaseSync } from 'node:sqlite';

import type { SqlBindValue, SqlRunResult, UnserializedSqlDatabase } from './sqlite';

export type ExpoSqliteLikeConnection = UnserializedSqlDatabase & {
  /** Whether the native side would still hold this connection. */
  isOpen(): boolean;
  closeAsync(): Promise<void>;
};

export function createExpoSqliteLikeConnection(): ExpoSqliteLikeConnection {
  const db = new DatabaseSync(':memory:');
  let open = true;

  const connection: ExpoSqliteLikeConnection = {
    isOpen: () => open,

    async execAsync(source: string): Promise<void> {
      db.exec(source);
    },

    async runAsync(source: string, ...params: SqlBindValue[]): Promise<SqlRunResult> {
      const result = db.prepare(source).run(...params);
      return { changes: Number(result.changes) };
    },

    async getFirstAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T | null> {
      return (db.prepare(source).get(...params) as T | undefined) ?? null;
    },

    async getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]> {
      return db.prepare(source).all(...params) as T[];
    },

    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      await connection.execAsync('BEGIN');
      try {
        await task();
        await connection.execAsync('COMMIT');
      } catch (error) {
        await connection.execAsync('ROLLBACK');
        throw error;
      }
    },

    async closeAsync(): Promise<void> {
      open = false;
      db.close();
    },
  };

  return connection;
}
