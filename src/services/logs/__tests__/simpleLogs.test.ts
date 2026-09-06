/**
 * @jest-environment node
 *
 * Bowel, wellbeing and context logs against a real SQL engine and the real shipped schema.
 *
 * The shared mechanics — the transaction, the tombstone, the merge, the local-day filter — are
 * covered once by the symptom suite, since all four types run through the same `logRepository`.
 * What is tested here is what differs: each type's own constraints, the boolean seam, and the
 * context value-pairing rule.
 */
import { failingOn } from '@/services/db/failing.testing';
import type { BowelDraft } from '@/domain/logs/bowel';
import type { ContextDraft } from '@/domain/logs/context';
import type { WellbeingDraft } from '@/domain/logs/wellbeing';
import { migrate } from '@/services/db/migrator';
import { createTestDatabase, type TestDatabase } from '@/services/db/nodeSqlite.testing';
import type { SqlBindValue, SqlDatabase } from '@/services/db/sqlite';
import { pendingCount, pendingRecordIds } from '@/services/sync/outbox';

import {
  createBowelLog,
  getBowelLog,
  listBowelLogsForLocalDate,
  softDeleteBowelLog,
  toRow as bowelToRow,
  applyServerRows as applyBowelRows,
} from '../bowelRepository';
import {
  createContextLog,
  getContextLog,
  listContextLogsForLocalDate,
  applyServerRows as applyContextRows,
  toRow as contextToRow,
} from '../contextRepository';
import {
  createWellbeingLog,
  getWellbeingLog,
  listWellbeingLogsForLocalDate,
  applyServerRows as applyWellbeingRows,
  toRow as wellbeingToRow,
} from '../wellbeingRepository';

const USER = 'user-1';
const NOW = new Date('2026-08-24T12:00:00Z');
const OCCURRED = new Date('2026-08-24T11:00:00Z');

let db: TestDatabase;
let counter = 0;
const generateId = () => `id-${(counter += 1)}`;
const deps = { now: NOW, generateId };

beforeEach(async () => {
  db = createTestDatabase();
  counter = 0;
  await migrate(db);
});

afterEach(() => {
  db.close();
});

function bowelDraft(overrides: Partial<BowelDraft> = {}): BowelDraft {
  return {
    bristolType: 4,
    urgency: 'low',
    difficulty: 'easy',
    incomplete: false,
    occurredAt: OCCURRED,
    note: undefined,
    ...overrides,
  };
}

// --- Bowel -----------------------------------------------------------------

describe('bowel logs', () => {
  it('writes and reads back exactly what was recorded', async () => {
    const log = await createBowelLog(
      db,
      { userId: USER, draft: bowelDraft(), timeZone: 'UTC' },
      deps
    );

    expect(log).toMatchObject({ bristolType: 4, urgency: 'low', difficulty: 'easy' });
    expect(await getBowelLog(db, log.id)).toEqual(log);
  });

  it('round-trips the incomplete flag through SQLite, which has no boolean type', async () => {
    const yes = await createBowelLog(
      db,
      { userId: USER, draft: bowelDraft({ incomplete: true }), timeZone: 'UTC' },
      deps
    );
    const no = await createBowelLog(
      db,
      { userId: USER, draft: bowelDraft({ incomplete: false }), timeZone: 'UTC' },
      deps
    );

    expect((await getBowelLog(db, yes.id))?.incomplete).toBe(true);
    expect((await getBowelLog(db, no.id))?.incomplete).toBe(false);

    // Stored as 1/0, but the row that travels to Postgres carries a real boolean.
    const stored = await db.getFirstAsync<{ incomplete: number }>(
      'SELECT incomplete FROM bowel_logs WHERE id = ?',
      yes.id
    );
    expect(stored?.incomplete).toBe(1);
    expect(bowelToRow(yes).incomplete).toBe(true);
  });

  it('refuses a Bristol type outside 1–7', async () => {
    const insert = (type: number) =>
      db.runAsync(
        `INSERT INTO bowel_logs (id, user_id, bristol_type, urgency, difficulty, occurred_at,
           occurred_local_date, occurred_tz, occurred_utc_offset_minutes, created_at, updated_at)
         VALUES (?, 'u1', ?, 'low', 'easy', '2026-08-24T12:00:00.000Z', '2026-08-24', 'UTC', 0,
                 '2026-08-24T12:00:00.000Z', '2026-08-24T12:00:00.000Z')`,
        `b-${type}`,
        type
      );

    await expect(insert(0)).rejects.toThrow();
    await expect(insert(8)).rejects.toThrow();
    await expect(insert(1)).resolves.toBeDefined();
    await expect(insert(7)).resolves.toBeDefined();
  });

  it('queues one outbox row and commits atomically with it', async () => {
    const crashing = failingOn(db, 'sync_queue');
    await expect(
      createBowelLog(crashing, { userId: USER, draft: bowelDraft(), timeZone: 'UTC' }, deps)
    ).rejects.toThrow('simulated crash');

    const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM bowel_logs');
    expect(count?.n).toBe(0);

    const log = await createBowelLog(
      db,
      { userId: USER, draft: bowelDraft(), timeZone: 'UTC' },
      deps
    );
    expect(await pendingCount(db, 'bowel_logs')).toBe(1);
    expect([...(await pendingRecordIds(db, 'bowel_logs'))]).toEqual([log.id]);
  });

  it('tombstones rather than removing', async () => {
    const log = await createBowelLog(
      db,
      { userId: USER, draft: bowelDraft(), timeZone: 'UTC' },
      deps
    );

    expect(await softDeleteBowelLog(db, log.id, deps)).toBe(true);
    expect((await getBowelLog(db, log.id))?.deletedAt).not.toBeNull();
    expect(await listBowelLogsForLocalDate(db, { userId: USER, localDate: '2026-08-24' })).toEqual(
      []
    );
  });

  it('round-trips through the server row shape', async () => {
    const log = await createBowelLog(
      db,
      { userId: USER, draft: bowelDraft({ incomplete: true }), timeZone: 'UTC' },
      deps
    );

    await applyBowelRows(db, [bowelToRow(log)], new Set());

    expect(await getBowelLog(db, log.id)).toEqual(log);
  });
});

// --- Wellbeing -------------------------------------------------------------

describe('wellbeing logs', () => {
  const draft: WellbeingDraft = { occurredAt: OCCURRED, note: undefined };

  it('records a good day from nothing but a timestamp', async () => {
    const log = await createWellbeingLog(db, { userId: USER, draft, timeZone: 'UTC' }, deps);

    expect(log.note).toBeNull();
    expect(log.source).toBe('manual');
    expect(await getWellbeingLog(db, log.id)).toEqual(log);
  });

  it('is filed under the user’s local day', async () => {
    const log = await createWellbeingLog(
      db,
      {
        userId: USER,
        draft: { occurredAt: new Date('2026-08-24T02:00:00Z'), note: undefined },
        timeZone: 'America/New_York',
      },
      deps
    );

    expect(log.occurredLocalDate).toBe('2026-08-23');
    expect(
      (await listWellbeingLogsForLocalDate(db, { userId: USER, localDate: '2026-08-23' })).map(
        (entry) => entry.id
      )
    ).toEqual([log.id]);
  });

  it('records more than one good moment in a day rather than collapsing them', async () => {
    // Nothing about a control observation is once-per-day; two are two data points.
    await createWellbeingLog(db, { userId: USER, draft, timeZone: 'UTC' }, deps);
    await createWellbeingLog(
      db,
      {
        userId: USER,
        draft: { ...draft, occurredAt: new Date('2026-08-24T09:00:00Z') },
        timeZone: 'UTC',
      },
      deps
    );

    expect(
      await listWellbeingLogsForLocalDate(db, { userId: USER, localDate: '2026-08-24' })
    ).toHaveLength(2);
  });

  it('keeps an optional note', async () => {
    const log = await createWellbeingLog(
      db,
      { userId: USER, draft: { ...draft, note: 'good day' }, timeZone: 'UTC' },
      deps
    );

    expect(log.note).toBe('good day');
  });

  it('round-trips through the server row shape', async () => {
    const log = await createWellbeingLog(db, { userId: USER, draft, timeZone: 'UTC' }, deps);

    await applyWellbeingRows(db, [wellbeingToRow(log)], new Set());

    expect(await getWellbeingLog(db, log.id)).toEqual(log);
  });
});

// --- Context ---------------------------------------------------------------

describe('context logs', () => {
  function scaled(type: 'stress' | 'sleep_quality', level: number): ContextDraft {
    return {
      contextType: type,
      valueNumeric: level,
      valueText: null,
      occurredAt: OCCURRED,
      note: undefined,
    };
  }

  const exercise: ContextDraft = {
    contextType: 'exercise',
    valueNumeric: null,
    valueText: 'moderate',
    occurredAt: OCCURRED,
    note: undefined,
  };

  it('records a scaled observation', async () => {
    const log = await createContextLog(
      db,
      { userId: USER, draft: scaled('stress', 4), timeZone: 'UTC' },
      deps
    );

    expect(log).toMatchObject({ contextType: 'stress', valueNumeric: 4, valueText: null });
    expect(await getContextLog(db, log.id)).toEqual(log);
  });

  it('records a text observation', async () => {
    const log = await createContextLog(
      db,
      { userId: USER, draft: exercise, timeZone: 'UTC' },
      deps
    );

    expect(log).toMatchObject({
      contextType: 'exercise',
      valueNumeric: null,
      valueText: 'moderate',
    });
  });

  it('keeps several context types on the same day apart', async () => {
    await createContextLog(db, { userId: USER, draft: scaled('stress', 2), timeZone: 'UTC' }, deps);
    await createContextLog(
      db,
      { userId: USER, draft: scaled('sleep_quality', 5), timeZone: 'UTC' },
      deps
    );
    await createContextLog(db, { userId: USER, draft: exercise, timeZone: 'UTC' }, deps);

    const entries = await listContextLogsForLocalDate(db, {
      userId: USER,
      localDate: '2026-08-24',
    });

    expect(entries.map((entry) => entry.contextType).sort()).toEqual([
      'exercise',
      'sleep_quality',
      'stress',
    ]);
  });

  it('refuses a row whose value does not match its type', async () => {
    // The database holds the same rule the Zod schema states. A stress entry carrying a text
    // level would be a row the engine could not interpret.
    const insert = (type: string, numeric: number | null, text: string | null) =>
      db.runAsync(
        `INSERT INTO context_logs (id, user_id, context_type, value_numeric, value_text,
           occurred_at, occurred_local_date, occurred_tz, occurred_utc_offset_minutes,
           created_at, updated_at)
         VALUES (?, 'u1', ?, ?, ?, '2026-08-24T12:00:00.000Z', '2026-08-24', 'UTC', 0,
                 '2026-08-24T12:00:00.000Z', '2026-08-24T12:00:00.000Z')`,
        `c-${type}-${String(numeric)}-${String(text)}`,
        type,
        numeric,
        text
      );

    await expect(insert('stress', null, 'moderate')).rejects.toThrow();
    await expect(insert('exercise', 3, null)).rejects.toThrow();
    await expect(insert('stress', 3, 'moderate')).rejects.toThrow();
    await expect(insert('stress', 3, null)).resolves.toBeDefined();
    await expect(insert('exercise', null, 'light')).resolves.toBeDefined();
  });

  it('refuses a scale value outside 1–5', async () => {
    await expect(
      db.runAsync(
        `INSERT INTO context_logs (id, user_id, context_type, value_numeric, occurred_at,
           occurred_local_date, occurred_tz, occurred_utc_offset_minutes, created_at, updated_at)
         VALUES ('x', 'u1', 'stress', 9, '2026-08-24T12:00:00.000Z', '2026-08-24', 'UTC', 0,
                 '2026-08-24T12:00:00.000Z', '2026-08-24T12:00:00.000Z')`
      )
    ).rejects.toThrow();
  });

  it('round-trips through the server row shape', async () => {
    const log = await createContextLog(
      db,
      { userId: USER, draft: exercise, timeZone: 'UTC' },
      deps
    );

    await applyContextRows(db, [contextToRow(log)], new Set());

    expect(await getContextLog(db, log.id)).toEqual(log);
  });
});
