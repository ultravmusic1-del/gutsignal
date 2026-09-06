/**
 * The narrow SQL seam the offline layer is written against.
 *
 * Tests pass an adapter over Node's built-in `node:sqlite`, which means the outbox and repository
 * are exercised against a real SQL engine — real transactions, real constraints, real rollback —
 * rather than a hand-written fake that could agree with a bug. Depending on the interface rather
 * than the module is what makes that possible.
 *
 * Production does **not** hand the `expo-sqlite` handle straight through any more. It is wrapped
 * by `serializeDatabase`, because one native connection is shared by everything in the app and
 * `expo-sqlite`'s transactions are explicitly not exclusive. See `serialize.ts`.
 */

export type SqlBindValue = string | number | null;

export type SqlRunResult = {
  changes: number;
};

/** Statements, with no transaction control. This is what a transaction body is given. */
export interface SqlStatements {
  /** Runs one or more statements. No parameters. */
  execAsync(source: string): Promise<void>;

  /** Runs a single parameterised statement. */
  runAsync(source: string, ...params: SqlBindValue[]): Promise<SqlRunResult>;

  /** First row, or null. */
  getFirstAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T | null>;

  /** All rows. */
  getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]>;
}

export interface SqlDatabase extends SqlStatements {
  /**
   * Runs `task` inside a transaction, rolling back if it throws.
   *
   * **Use the `tx` handle inside the body, never the outer database.** The outer handle queues
   * behind whatever holds the connection, and inside a transaction that is the transaction itself
   * — so a statement issued on it would wait for a lock it is already inside, forever. `tx` is the
   * same connection without that queue, which is safe precisely because the transaction holds it.
   */
  withTransactionAsync(task: (tx: SqlStatements) => Promise<void>): Promise<void>;
}

/**
 * A database whose transactions take no handle — the shape `expo-sqlite` actually has.
 *
 * Only `serializeDatabase` accepts this. Everything else in the app is written against
 * `SqlDatabase`, so the unwrapped connection cannot reach application code by accident.
 */
export interface UnserializedSqlDatabase extends SqlStatements {
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
