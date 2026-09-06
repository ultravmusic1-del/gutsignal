/**
 * @jest-environment node
 */
import { migrate } from '@/services/db/migrator';
import { createTestDatabase, type TestDatabase } from '@/services/db/nodeSqlite.testing';

import { keysetFilter, parseCursor, readCursor, writeCursor } from '../cursors';

/**
 * The pull watermark, and the upgrade every existing install has to survive.
 *
 * Before keyset paging the cursor was a bare timestamp. Devices in the wild have one written to
 * disk, and the first run after an update reads it with the new code — so the old format has to
 * keep working, and has to fail *safe* rather than merely parse.
 */

let db: TestDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await migrate(db);
});

afterEach(() => {
  db.close();
});

describe('reading a cursor written by an older build', () => {
  it('reads a bare timestamp as that timestamp with no id', () => {
    expect(parseCursor('2026-08-24T09:00:00.000Z')).toEqual({
      updatedAt: '2026-08-24T09:00:00.000Z',
      id: '',
    });
  });

  /**
   * The safe direction. An empty id sorts before every real one, so the first keyset pull asks
   * for that timestamp *inclusively* and re-fetches the whole tie group — which is exactly the
   * set of rows a timestamp-only cursor could have skipped. Re-applying them is free.
   */
  it('asks for the whole tie group again rather than skipping past it', () => {
    const filter = keysetFilter(parseCursor('2026-08-24T09:00:00.000Z'));

    expect(filter).toBe('updated_at.gte."2026-08-24T09:00:00.000Z"');
    expect(filter).not.toContain('gt.');
  });

  it('survives a round trip through the database', async () => {
    await writeCursor(
      db,
      'symptom_logs',
      { updatedAt: '2026-08-24T09:00:00.000Z', id: 'abc' },
      new Date()
    );

    expect(await readCursor(db, 'symptom_logs')).toEqual({
      updatedAt: '2026-08-24T09:00:00.000Z',
      id: 'abc',
    });
  });

  it('reads a legacy row straight out of the table', async () => {
    // Written the way the previous build wrote it: the timestamp, unwrapped.
    await db.runAsync(
      `INSERT INTO sync_cursors (table_name, cursor, updated_at) VALUES (?, ?, ?)`,
      'symptom_logs',
      '2026-08-24T09:00:00.000Z',
      new Date().toISOString()
    );

    expect(await readCursor(db, 'symptom_logs')).toEqual({
      updatedAt: '2026-08-24T09:00:00.000Z',
      id: '',
    });
  });

  it('has no cursor at all for a table that has never synced', async () => {
    expect(await readCursor(db, 'symptom_logs')).toBeNull();
  });
});

describe('the keyset filter', () => {
  // PostgREST has no row-value comparison, so the pair comparison is spelled out. Getting this
  // wrong loses rows silently, which is why the exact string is pinned.
  it('compares the pair, not just the timestamp', () => {
    expect(keysetFilter({ updatedAt: '2026-08-24T09:00:00.000Z', id: 'row-7' })).toBe(
      'updated_at.gt."2026-08-24T09:00:00.000Z",' +
        'and(updated_at.eq."2026-08-24T09:00:00.000Z",id.gt."row-7")'
    );
  });

  // A timestamp contains `:` and `+`, which the filter grammar would otherwise read as syntax.
  it('quotes the timestamp', () => {
    expect(keysetFilter({ updatedAt: '2026-08-24T09:00:00+01:00', id: 'a' })).toContain(
      '"2026-08-24T09:00:00+01:00"'
    );
  });
});
