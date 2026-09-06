/**
 * @jest-environment node
 *
 * One connection, one operation at a time.
 *
 * GutSignal shares a single `expo-sqlite` connection across the whole app, and that connection has
 * one transaction state. The sync engine writes on a timer while the user saves a log, so "two
 * things touch the database at once" is the normal case, not an edge case.
 *
 * The tests below are written against a connection that reproduces `expo-sqlite`'s real
 * `BEGIN`/`COMMIT` behaviour over a real SQL engine, so the failures they describe are raised by
 * SQLite rather than asserted by a fake.
 */

import { createExpoSqliteLikeConnection } from '../expoSqliteLike.testing';
import { serializeDatabase } from '../serialize';
import type { SqlDatabase, UnserializedSqlDatabase } from '../sqlite';

let connection: ReturnType<typeof createExpoSqliteLikeConnection>;
let db: SqlDatabase;

beforeEach(async () => {
  connection = createExpoSqliteLikeConnection();
  db = serializeDatabase(connection);
  await db.execAsync('CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);');
});

const ids = async (source: SqlDatabase) =>
  (await source.getAllAsync<{ id: string }>('SELECT id FROM notes ORDER BY id')).map(
    (row) => row.id
  );

describe('serializing a shared connection', () => {
  /**
   * The failure that stopped the app booting: two `BEGIN`s on one connection.
   */
  it('runs overlapping transactions one after another instead of nesting them', async () => {
    const write = (id: string) =>
      db.withTransactionAsync(async (tx) => {
        await tx.runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', id, 'x');
      });

    await Promise.all([write('a'), write('b'), write('c')]);

    expect(await ids(db)).toEqual(['a', 'b', 'c']);
  });

  /**
   * The failure that is still silent: a lone statement landing inside someone else's transaction.
   *
   * The sync engine clears an outbox row with a bare `runAsync` while the user saves a meal. On an
   * unserialised connection that `DELETE` becomes part of the meal's transaction — so when the
   * meal write rolls back, sync progress is undone with it and the record uploads twice. Nobody
   * sees an error; the two callers both believe they succeeded.
   *
   * Here the standalone insert must survive a transaction that rolls back.
   */
  it('keeps a standalone write out of a concurrent transaction that rolls back', async () => {
    const failing = db
      .withTransactionAsync(async (tx) => {
        await tx.runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', 'doomed', 'x');
        throw new Error('the user cancelled');
      })
      .catch(() => undefined);

    const standalone = db.runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', 'sync', 'x');

    await Promise.all([failing, standalone]);

    expect(await ids(db)).toEqual(['sync']);
  });

  it('keeps a standalone write out of a concurrent transaction that commits', async () => {
    const committing = db.withTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', 'meal', 'x');
    });

    const standalone = db.runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', 'sync', 'x');

    await Promise.all([committing, standalone]);

    expect(await ids(db)).toEqual(['meal', 'sync']);
  });

  it('preserves the order operations were requested in', async () => {
    const order: string[] = [];

    await Promise.all(
      ['a', 'b', 'c', 'd'].map((id) =>
        db.withTransactionAsync(async (tx) => {
          order.push(id);
          await tx.runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', id, 'x');
        })
      )
    );

    expect(order).toEqual(['a', 'b', 'c', 'd']);
  });

  /**
   * One caller's failure must not become everyone else's.
   *
   * The queue is a promise chain, and a rejection left on the tail would be inherited by every
   * operation behind it — one constraint violation would take down the rest of the session.
   */
  it('survives a failed operation without breaking the queue behind it', async () => {
    await db.runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', 'first', 'x');

    const duplicate = db.runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', 'first', 'y').then(
      () => 'resolved',
      () => 'rejected'
    );

    const later = db.runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', 'second', 'x');

    expect(await duplicate).toBe('rejected');
    await expect(later).resolves.toBeDefined();
    expect(await ids(db)).toEqual(['first', 'second']);
  });

  it('reports a failing transaction to its own caller and rolls it back', async () => {
    await expect(
      db.withTransactionAsync(async (tx) => {
        await tx.runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', 'doomed', 'x');
        throw new Error('nope');
      })
    ).rejects.toThrow('nope');

    expect(await ids(db)).toEqual([]);
  });
});

/**
 * The same scenarios without the wrapper.
 *
 * A guard against the tests above passing for the wrong reason. If an unserialised connection also
 * satisfied them, they would be proving nothing about serialisation — so each one is shown to fail
 * on the raw connection first.
 */
describe('the same connection unserialized', () => {
  const raw = () => connection as UnserializedSqlDatabase;

  it('fails to run overlapping transactions at all', async () => {
    const write = (id: string) =>
      raw().withTransactionAsync(async () => {
        await raw().runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', id, 'x');
      });

    await expect(Promise.all([write('a'), write('b')])).rejects.toThrow(
      /cannot start a transaction within a transaction/
    );
  });

  it('loses a standalone write into a rolling-back transaction', async () => {
    const failing = raw()
      .withTransactionAsync(async () => {
        await raw().runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', 'doomed', 'x');
        throw new Error('the user cancelled');
      })
      .catch(() => undefined);

    const standalone = raw().runAsync('INSERT INTO notes (id, body) VALUES (?, ?)', 'sync', 'x');

    await Promise.all([failing, standalone]);

    // The sync write was rolled back with somebody else's transaction. It reported success.
    expect(
      (await raw().getAllAsync<{ id: string }>('SELECT id FROM notes ORDER BY id')).map(
        (row) => row.id
      )
    ).toEqual([]);
  });
});
