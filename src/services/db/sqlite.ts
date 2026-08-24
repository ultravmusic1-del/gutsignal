/**
 * The narrow SQL seam the offline layer is written against.
 *
 * `expo-sqlite`'s `SQLiteDatabase` satisfies this structurally, so production passes the real
 * handle straight through. Tests pass an adapter over Node's built-in `node:sqlite`, which
 * means the outbox and repository are exercised against a real SQL engine — real transactions,
 * real constraints, real rollback — rather than a hand-written fake that could agree with a
 * bug. Depending on the interface rather than the module is what makes that possible.
 */

export type SqlBindValue = string | number | null;

export type SqlRunResult = {
  changes: number;
};

export interface SqlDatabase {
  /** Runs one or more statements. No parameters. */
  execAsync(source: string): Promise<void>;

  /** Runs a single parameterised statement. */
  runAsync(source: string, ...params: SqlBindValue[]): Promise<SqlRunResult>;

  /** First row, or null. */
  getFirstAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T | null>;

  /** All rows. */
  getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]>;

  /** Runs `task` inside a transaction, rolling back if it throws. */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
