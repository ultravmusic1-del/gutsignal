/**
 * One connection, one operation at a time.
 *
 * ## Why this exists
 *
 * `expo-sqlite` hands the whole app a single native connection for a given database name, and its
 * `withTransactionAsync` is a plain `BEGIN` / `COMMIT` pair sent through `execAsync`. Its own
 * documentation is explicit: that transaction "is not exclusive and can be interrupted by other
 * async queries". So on one connection, everything shares one transaction state.
 *
 * Two things go wrong without serialisation, and both are silent:
 *
 * 1. **Two transactions overlap.** The second `BEGIN` fails with `cannot start a transaction
 *    within a transaction`, or the first caller's `ROLLBACK` discards work the second already
 *    committed. This is not theoretical — it is what stopped the app booting (ADR-0046), where two
 *    concurrent `migrate` runs left version rows behind for tables that no longer existed.
 *
 * 2. **A lone statement lands inside someone else's transaction.** The sync engine writes outside
 *    any transaction of its own — clearing an outbox row, advancing a cursor — on a timer, while
 *    the user saves a meal. That `DELETE FROM sync_queue` becomes part of the meal's transaction,
 *    so if the meal write rolls back the outbox row returns and the record uploads twice; if it
 *    commits, sync progress commits with it. Neither caller can see this happening.
 *
 * A diary that loses or duplicates entries is a failed product (`CLAUDE.md` §15, §54). SQLite is a
 * single-writer engine anyway, so queuing here costs almost nothing and removes the whole class.
 *
 * ## Why the transaction body gets its own handle
 *
 * The queue is held for the entire transaction. A statement issued on the *wrapper* from inside
 * that transaction would wait for a lock the transaction is already holding — a deadlock. So the
 * body is handed `tx`, the unqueued connection, which is safe exactly because the transaction owns
 * the queue for its duration. Making `tx` a parameter rather than a convention is what lets the
 * compiler find every call site.
 */

import type {
  SqlBindValue,
  SqlDatabase,
  SqlRunResult,
  SqlStatements,
  UnserializedSqlDatabase,
} from './sqlite';

/**
 * Serialises every operation on `inner` through a single FIFO queue.
 *
 * The queue is a promise chain rather than a counter or a flag: each operation waits for the tail,
 * then becomes the new tail. A rejected operation must not break the chain for everyone behind it,
 * which is what the `catch` on the tail is for — the rejection still reaches its own caller.
 */
export function serializeDatabase(inner: UnserializedSqlDatabase): SqlDatabase {
  let tail: Promise<unknown> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation, operation);
    tail = result.catch(() => undefined);
    return result;
  }

  /** The connection without the queue. Handed to a transaction body, never to app code. */
  const statements: SqlStatements = {
    execAsync: (source) => inner.execAsync(source),
    runAsync: (source, ...params) => inner.runAsync(source, ...params),
    getFirstAsync: (source, ...params) => inner.getFirstAsync(source, ...params),
    getAllAsync: (source, ...params) => inner.getAllAsync(source, ...params),
  };

  return {
    execAsync(source: string): Promise<void> {
      return enqueue(() => inner.execAsync(source));
    },

    runAsync(source: string, ...params: SqlBindValue[]): Promise<SqlRunResult> {
      return enqueue(() => inner.runAsync(source, ...params));
    },

    getFirstAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T | null> {
      return enqueue(() => inner.getFirstAsync<T>(source, ...params));
    },

    getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]> {
      return enqueue(() => inner.getAllAsync<T>(source, ...params));
    },

    withTransactionAsync(task: (tx: SqlStatements) => Promise<void>): Promise<void> {
      return enqueue(() => inner.withTransactionAsync(() => task(statements)));
    },
  };
}
