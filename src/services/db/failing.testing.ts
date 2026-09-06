/**
 * A database that fails on a chosen statement. **Test support only.**
 *
 * Used to prove atomicity: make the second write of a pair throw, and check the first one did not
 * survive. Every log repository needs it, so it lives here rather than in three copies.
 *
 * Deliberately not under `__tests__/` so Jest does not collect it as a suite.
 */

import type { SqlBindValue, SqlDatabase, SqlStatements } from './sqlite';

/**
 * Wraps `source` so any `runAsync` whose SQL contains `fragment` throws instead of running.
 *
 * ## Why the transaction handle is wrapped too
 *
 * Spreading the database and overriding `runAsync` is not enough, and used to be. A transaction
 * body no longer writes through the database handle — it writes through the `tx` the serialised
 * wrapper hands it, which this function does not own. An earlier version of this helper patched
 * only the outer handle, so after the seam changed the simulated crash never fired and three
 * atomicity tests passed while testing nothing.
 */
export function failingOn(source: SqlDatabase, fragment: string): SqlDatabase {
  const guard = (inner: SqlStatements): SqlStatements => ({
    execAsync: (sql: string) => inner.execAsync(sql),

    runAsync: async (sql: string, ...params: SqlBindValue[]) => {
      if (sql.includes(fragment)) throw new Error('simulated crash');
      return inner.runAsync(sql, ...params);
    },

    getFirstAsync: <T>(sql: string, ...params: SqlBindValue[]) =>
      inner.getFirstAsync<T>(sql, ...params),

    getAllAsync: <T>(sql: string, ...params: SqlBindValue[]) =>
      inner.getAllAsync<T>(sql, ...params),
  });

  return {
    ...guard(source),
    withTransactionAsync: (task) => source.withTransactionAsync((tx) => task(guard(tx))),
  };
}
