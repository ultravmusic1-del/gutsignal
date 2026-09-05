/**
 * @jest-environment node
 */

import { migrate } from '../migrator';
import { createTestDatabase, type TestDatabase } from '../nodeSqlite.testing';
import {
  USER_SCOPED_TABLES,
  localDataOwners,
  pendingSyncCountFor,
  wipeLocalDataExcept,
} from '../localAccount';

/**
 * What happens to one person's local data when someone else signs in on the same device.
 *
 * Run against real SQL, because the guarantees here are SQL guarantees: that every table is
 * cleared, that a child row cannot survive its parent, and that the sync watermark does not
 * carry over.
 *
 * **The watermark is the part that is not obviously about privacy.** `sync_cursors` records how
 * far the last pull got, keyed by table rather than by user, so a stale one makes the second
 * user's first sync resume from the first user's position and silently skip their older history.
 * `SyncProvider` already clears it on a clean sign-out; these tests pin the behaviour for the
 * paths sign-out never sees — a force-quit, or a session that changed underneath the app.
 */

const A = 'user-a';
const B = 'user-b';

let db: TestDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await migrate(db);
});

afterEach(() => db.close());

const iso = (day: number) => `2026-06-${String(day).padStart(2, '0')}T09:00:00.000Z`;

async function insertSymptom(userId: string, id: string, day = 1) {
  await db.runAsync(
    `INSERT INTO symptom_logs
       (id, user_id, symptom_type, severity, note, source,
        occurred_at, occurred_local_date, occurred_tz, occurred_utc_offset_minutes,
        deleted_at, created_at, updated_at)
     VALUES (?, ?, 'bloating', 5, NULL, 'manual', ?, ?, 'Europe/London', 0, NULL, ?, ?)`,
    id,
    userId,
    iso(day),
    `2026-06-${String(day).padStart(2, '0')}`,
    iso(day),
    iso(day)
  );
}

async function insertMealWithChildren(userId: string, id: string) {
  await db.runAsync(
    `INSERT INTO meal_logs
       (id, user_id, title, meal_size, note, source, photo_asset_id,
        occurred_at, occurred_local_date, occurred_tz, occurred_utc_offset_minutes,
        deleted_at, created_at, updated_at)
     VALUES (?, ?, 'Porridge', 'medium', NULL, 'manual', NULL, ?, '2026-06-01',
             'Europe/London', 0, NULL, ?, ?)`,
    id,
    userId,
    iso(1),
    iso(1),
    iso(1)
  );

  await db.runAsync(
    `INSERT INTO meal_items
       (id, meal_id, user_id, raw_name, canonical_factor_id, confidence, user_confirmed, position)
     VALUES (?, ?, ?, 'oats', NULL, NULL, 1, 0)`,
    `${id}-item`,
    id,
    userId
  );

  await db.runAsync(
    `INSERT INTO meal_tags (meal_id, user_id, tag) VALUES (?, ?, 'dairy')`,
    id,
    userId
  );
}

async function queueEntry(table: string, recordId: string, status = 'pending') {
  await db.runAsync(
    `INSERT INTO sync_queue
       (id, table_name, record_id, operation, payload, status, attempt_count, created_at, updated_at)
     VALUES (?, ?, ?, 'insert', '{}', ?, 0, ?, ?)`,
    `q-${recordId}`,
    table,
    recordId,
    status,
    iso(1),
    iso(1)
  );
}

const countIn = async (table: string) =>
  (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0;

describe('who has data on this device', () => {
  it('reports nobody for a fresh database', async () => {
    expect(await localDataOwners(db)).toEqual([]);
  });

  it('reports each distinct owner once, in a stable order', async () => {
    await insertSymptom(A, 's1');
    await insertSymptom(A, 's2');
    await insertMealWithChildren(B, 'm1');

    expect(await localDataOwners(db)).toEqual([A, B]);
  });

  it('sees an owner whose only rows are in a child table', async () => {
    await insertMealWithChildren(B, 'm1');
    await db.runAsync('DELETE FROM meal_tags');

    expect(await localDataOwners(db)).toContain(B);
  });
});

describe('unsent work', () => {
  it('counts nothing when the queue is empty', async () => {
    await insertSymptom(A, 's1');

    expect(await pendingSyncCountFor(db, A)).toBe(0);
  });

  it('counts a queued entry belonging to that user', async () => {
    await insertSymptom(A, 's1');
    await queueEntry('symptom_logs', 's1');

    expect(await pendingSyncCountFor(db, A)).toBe(1);
  });

  it('does not count another user queued work', async () => {
    await insertSymptom(A, 's1');
    await insertSymptom(B, 's2');
    await queueEntry('symptom_logs', 's2');

    expect(await pendingSyncCountFor(db, A)).toBe(0);
  });

  // Work already sent is not work about to be lost, so it must not appear in a warning.
  it('ignores entries that have already synced', async () => {
    await insertSymptom(A, 's1');
    await queueEntry('symptom_logs', 's1', 'synced');

    expect(await pendingSyncCountFor(db, A)).toBe(0);
  });

  it('counts a failed entry, which is still unsent', async () => {
    await insertSymptom(A, 's1');
    await queueEntry('symptom_logs', 's1', 'failed');

    expect(await pendingSyncCountFor(db, A)).toBe(1);
  });
});

describe('clearing another account from this device', () => {
  it('does nothing at all when the device only holds the signing-in user', async () => {
    await insertSymptom(B, 's1');
    await queueEntry('symptom_logs', 's1');

    const result = await wipeLocalDataExcept(db, B);

    expect(result).toEqual({ owners: [], rowsDeleted: 0, unsentDiscarded: 0 });
    expect(await countIn('symptom_logs')).toBe(1);
    expect(await countIn('sync_queue')).toBe(1);
  });

  it('leaves the signing-in user untouched while removing the other', async () => {
    await insertSymptom(A, 'a1');
    await insertSymptom(B, 'b1');

    await wipeLocalDataExcept(db, B);

    const remaining = await db.getAllAsync<{ user_id: string }>('SELECT user_id FROM symptom_logs');
    expect(remaining).toEqual([{ user_id: B }]);
  });

  it('clears every user-scoped table', async () => {
    await insertSymptom(A, 'a1');
    await insertMealWithChildren(A, 'am1');
    await db.runAsync(
      `INSERT INTO wellbeing_logs
         (id, user_id, note, source, occurred_at, occurred_local_date, occurred_tz,
          occurred_utc_offset_minutes, deleted_at, created_at, updated_at)
       VALUES ('aw1', ?, NULL, 'manual', ?, '2026-06-01', 'Europe/London', 0, NULL, ?, ?)`,
      A,
      iso(1),
      iso(1),
      iso(1)
    );

    await wipeLocalDataExcept(db, B);

    for (const table of USER_SCOPED_TABLES) {
      expect(await countIn(table)).toBe(0);
    }
  });

  // A meal item outliving its meal would be an orphaned row holding what someone ate.
  it('takes child rows with their parent', async () => {
    await insertMealWithChildren(A, 'am1');

    await wipeLocalDataExcept(db, B);

    expect(await countIn('meal_items')).toBe(0);
    expect(await countIn('meal_tags')).toBe(0);
  });

  it('removes the departed user queued work and reports how much was unsent', async () => {
    await insertSymptom(A, 'a1');
    await queueEntry('symptom_logs', 'a1');
    await insertSymptom(B, 'b1');
    await queueEntry('symptom_logs', 'b1');

    const result = await wipeLocalDataExcept(db, B);

    expect(result.unsentDiscarded).toBe(1);
    expect(await db.getAllAsync('SELECT record_id FROM sync_queue')).toEqual([{ record_id: 'b1' }]);
  });

  // The watermark is per table, not per user. Left behind, the new user's first pull resumes
  // from someone else's position and their older history never arrives.
  it('resets the sync watermark so the new user pulls their whole history', async () => {
    await insertSymptom(A, 'a1');
    await db.runAsync(
      `INSERT INTO sync_cursors (table_name, cursor, updated_at) VALUES ('symptom_logs', ?, ?)`,
      iso(1),
      iso(1)
    );

    await wipeLocalDataExcept(db, B);

    expect(await countIn('sync_cursors')).toBe(0);
  });

  it('leaves the watermark alone when there was nothing to clear', async () => {
    await db.runAsync(
      `INSERT INTO sync_cursors (table_name, cursor, updated_at) VALUES ('symptom_logs', ?, ?)`,
      iso(1),
      iso(1)
    );

    await wipeLocalDataExcept(db, B);

    expect(await countIn('sync_cursors')).toBe(1);
  });

  it('names who was cleared, and counts what went', async () => {
    await insertSymptom(A, 'a1');
    await insertSymptom(A, 'a2');

    const result = await wipeLocalDataExcept(db, B);

    expect(result.owners).toEqual([A]);
    expect(result.rowsDeleted).toBe(2);
  });

  it('is safe to run twice', async () => {
    await insertSymptom(A, 'a1');

    await wipeLocalDataExcept(db, B);
    const second = await wipeLocalDataExcept(db, B);

    expect(second).toEqual({ owners: [], rowsDeleted: 0, unsentDiscarded: 0 });
  });

  it('clears everything when signing in with no user id at all', async () => {
    await insertSymptom(A, 'a1');

    await wipeLocalDataExcept(db, null);

    expect(await countIn('symptom_logs')).toBe(0);
  });
});
