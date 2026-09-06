/**
 * @jest-environment node
 *
 * The timeline query against a real SQL engine, including the milestone's acceptance criterion:
 * a large dataset stays smooth.
 */
import { groupByLocalDate } from '@/domain/logs/entry';
import { migrate } from '@/services/db/migrator';
import { createTestDatabase, type TestDatabase } from '@/services/db/nodeSqlite.testing';

import { createBowelLog } from '../bowelRepository';
import { createContextLog } from '../contextRepository';
import { createMeal, softDeleteMeal } from '../mealRepository';
import { createSymptomLog } from '../symptomRepository';
import {
  countTimelineEntries,
  fetchTimelinePage,
  type TimelineCursor,
} from '../timelineRepository';
import { createWellbeingLog } from '../wellbeingRepository';

const USER = 'user-1';
const NOW = new Date('2026-08-24T12:00:00Z');

let db: TestDatabase;
let counter = 0;
const generateId = () => `id-${String((counter += 1)).padStart(6, '0')}`;
const deps = () => ({ now: NOW, generateId });

beforeEach(async () => {
  db = createTestDatabase();
  counter = 0;
  await migrate(db);
});

afterEach(() => {
  db.close();
});

const at = (iso: string) => new Date(iso);

async function seedOneOfEach() {
  await createMeal(
    db,
    {
      userId: USER,
      draft: {
        title: 'Breakfast',
        items: ['eggs', 'toast', 'coffee'],
        mealSize: 'medium',
        tags: ['homemade'],
        occurredAt: at('2026-08-24T08:00:00Z'),
        note: undefined,
      },
      timeZone: 'UTC',
    },
    deps()
  );

  await createSymptomLog(
    db,
    {
      userId: USER,
      draft: {
        symptomType: 'bloating',
        severity: 6,
        occurredAt: at('2026-08-24T09:00:00Z'),
        note: 'after breakfast',
      },
      timeZone: 'UTC',
    },
    deps()
  );

  await createBowelLog(
    db,
    {
      userId: USER,
      draft: {
        bristolType: 6,
        urgency: 'high',
        difficulty: 'easy',
        incomplete: false,
        occurredAt: at('2026-08-24T07:00:00Z'),
        note: undefined,
      },
      timeZone: 'UTC',
    },
    deps()
  );

  await createWellbeingLog(
    db,
    {
      userId: USER,
      draft: { occurredAt: at('2026-08-24T16:00:00Z'), note: undefined },
      timeZone: 'UTC',
    },
    deps()
  );

  await createContextLog(
    db,
    {
      userId: USER,
      draft: {
        contextType: 'stress',
        valueNumeric: 4,
        valueText: null,
        occurredAt: at('2026-08-24T10:00:00Z'),
        note: undefined,
      },
      timeZone: 'UTC',
    },
    deps()
  );
}

describe('fetchTimelinePage', () => {
  it('returns every kind in one chronological list, newest first', async () => {
    await seedOneOfEach();

    const page = await fetchTimelinePage(db, { userId: USER });

    expect(page.entries.map((entry) => entry.kind)).toEqual([
      'wellbeing', // 16:00
      'context', //   10:00
      'symptom', //   09:00
      'meal', //      08:00
      'bowel', //     07:00
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('carries the detail each kind needs to be readable', async () => {
    await seedOneOfEach();

    const page = await fetchTimelinePage(db, { userId: USER });
    const byKind = new Map(page.entries.map((entry) => [entry.kind, entry]));

    expect(byKind.get('meal')).toMatchObject({
      title: 'Breakfast',
      detail: 'eggs · toast · coffee',
      tags: ['Homemade'],
    });
    expect(byKind.get('symptom')?.detail).toBe('Moderate · 6/10');
    expect(byKind.get('bowel')?.title).toBe('Type 6 · Mushy, ragged edges');
    expect(byKind.get('context')?.title).toBe('Stress · 4/5 — Very stressed');
  });

  it('marks entries the server has not confirmed', async () => {
    await seedOneOfEach();

    const page = await fetchTimelinePage(db, { userId: USER });

    expect(page.entries.every((entry) => entry.syncPending)).toBe(true);
  });

  it('excludes tombstoned entries', async () => {
    await seedOneOfEach();
    const before = await fetchTimelinePage(db, { userId: USER });
    const meal = before.entries.find((entry) => entry.kind === 'meal');

    await softDeleteMeal(db, meal!.id, deps());

    const after = await fetchTimelinePage(db, { userId: USER });
    expect(after.entries.map((entry) => entry.kind)).not.toContain('meal');
  });

  it('never returns another user’s entries', async () => {
    await seedOneOfEach();

    expect(await fetchTimelinePage(db, { userId: 'someone-else' })).toMatchObject({
      entries: [],
      nextCursor: null,
    });
  });

  it('counts what the diary holds, for telling empty from filtered', async () => {
    await seedOneOfEach();
    expect(await countTimelineEntries(db, USER)).toBe(5);
    expect(await countTimelineEntries(db, 'someone-else')).toBe(0);
  });
});

describe('filters', () => {
  beforeEach(seedOneOfEach);

  it('narrows to one kind', async () => {
    const page = await fetchTimelinePage(db, { userId: USER, kind: 'symptom' });

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]?.kind).toBe('symptom');
  });

  it('treats a null kind as everything', async () => {
    expect((await fetchTimelinePage(db, { userId: USER, kind: null })).entries).toHaveLength(5);
  });
});

describe('search', () => {
  beforeEach(seedOneOfEach);

  it('finds a meal by something that was in it', async () => {
    // The food people remember is the item, not the meal's title.
    const page = await fetchTimelinePage(db, { userId: USER, search: 'coffee' });

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]?.title).toBe('Breakfast');
  });

  it('searches titles and notes together', async () => {
    // "break" is in the meal's title and in the symptom's note, and both are legitimate hits.
    // Search spans every text the user wrote, not one field per kind.
    const page = await fetchTimelinePage(db, { userId: USER, search: 'break' });

    expect(page.entries.map((entry) => entry.kind).sort()).toEqual(['meal', 'symptom']);
  });

  it('finds an entry by its note, whatever the kind', async () => {
    const page = await fetchTimelinePage(db, { userId: USER, search: 'after breakfast' });

    expect(page.entries.map((entry) => entry.kind)).toEqual(['symptom']);
  });

  it('ignores case', async () => {
    expect((await fetchTimelinePage(db, { userId: USER, search: 'COFFEE' })).entries).toHaveLength(
      1
    );
  });

  it('treats a blank search as no search', async () => {
    expect((await fetchTimelinePage(db, { userId: USER, search: '   ' })).entries).toHaveLength(5);
  });

  it('returns nothing for a term that matches nothing', async () => {
    expect((await fetchTimelinePage(db, { userId: USER, search: 'zzzz' })).entries).toEqual([]);
  });

  it('combines with a filter', async () => {
    const page = await fetchTimelinePage(db, { userId: USER, kind: 'symptom', search: 'coffee' });

    expect(page.entries).toEqual([]);
  });
});

describe('pagination', () => {
  /** Seeds `count` symptom logs one minute apart, newest last. */
  async function seedSymptoms(count: number) {
    const start = Date.parse('2026-01-01T00:00:00Z');

    await db.withTransactionAsync(async (tx) => {
      for (let i = 0; i < count; i += 1) {
        const occurredAt = new Date(start + i * 60_000).toISOString();
        await tx.runAsync(
          `INSERT INTO symptom_logs (id, user_id, symptom_type, severity, occurred_at,
             occurred_local_date, occurred_tz, occurred_utc_offset_minutes, created_at, updated_at)
           VALUES (?, ?, 'bloating', 5, ?, ?, 'UTC', 0, ?, ?)`,
          `seed-${String(i).padStart(6, '0')}`,
          USER,
          occurredAt,
          occurredAt.slice(0, 10),
          occurredAt,
          occurredAt
        );
      }
    });
  }

  it('walks the whole diary without repeating or dropping an entry', async () => {
    await seedSymptoms(95);

    const seen: string[] = [];
    let cursor: TimelineCursor | null = null;
    let pages = 0;

    do {
      const page = await fetchTimelinePage(db, { userId: USER, cursor, limit: 10 });
      seen.push(...page.entries.map((entry) => entry.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 50);

    expect(seen).toHaveLength(95);
    expect(new Set(seen).size).toBe(95);
    expect(pages).toBe(10);
  });

  it('stays in order across page boundaries', async () => {
    await seedSymptoms(30);

    const first = await fetchTimelinePage(db, { userId: USER, limit: 10 });
    const second = await fetchTimelinePage(db, {
      userId: USER,
      limit: 10,
      cursor: first.nextCursor,
    });

    const times = [...first.entries, ...second.entries].map((entry) => entry.occurredAt);
    expect([...times].sort((a, b) => b.localeCompare(a))).toEqual(times);
  });

  it('separates entries that share a timestamp rather than losing one', async () => {
    // Two logs saved in the same millisecond must both appear exactly once. Without the id
    // tiebreaker the sort is unstable and one repeats while the other vanishes.
    const shared = '2026-05-01T12:00:00.000Z';
    for (const suffix of ['a', 'b', 'c']) {
      await db.runAsync(
        `INSERT INTO symptom_logs (id, user_id, symptom_type, severity, occurred_at,
           occurred_local_date, occurred_tz, occurred_utc_offset_minutes, created_at, updated_at)
         VALUES (?, ?, 'gas', 3, ?, '2026-05-01', 'UTC', 0, ?, ?)`,
        `tie-${suffix}`,
        USER,
        shared,
        shared,
        shared
      );
    }

    const seen: string[] = [];
    let cursor: TimelineCursor | null = null;

    do {
      const page = await fetchTimelinePage(db, { userId: USER, cursor, limit: 1 });
      seen.push(...page.entries.map((entry) => entry.id));
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(seen.sort()).toEqual(['tie-a', 'tie-b', 'tie-c']);
  });

  it('reports no next cursor on the final page', async () => {
    await seedSymptoms(10);

    const page = await fetchTimelinePage(db, { userId: USER, limit: 10 });
    expect(page.entries).toHaveLength(10);
    expect(page.nextCursor).toBeNull();
  });
});

describe('day grouping', () => {
  it('groups by the local date the entry was filed under, newest day first', async () => {
    // 02:00 UTC is the previous evening in New York. Grouping by the instant would put this
    // entry on the wrong day for the rest of the user's life (risk R-02).
    await createSymptomLog(
      db,
      {
        userId: USER,
        draft: { symptomType: 'gas', severity: 2, occurredAt: at('2026-08-24T02:00:00Z') },
        timeZone: 'America/New_York',
      },
      deps()
    );
    await createSymptomLog(
      db,
      {
        userId: USER,
        draft: { symptomType: 'gas', severity: 2, occurredAt: at('2026-08-24T18:00:00Z') },
        timeZone: 'America/New_York',
      },
      deps()
    );

    const page = await fetchTimelinePage(db, { userId: USER });
    const days = groupByLocalDate(page.entries);

    expect(days.map((day) => day.localDate)).toEqual(['2026-08-24', '2026-08-23']);
    expect(days[0]?.entries).toHaveLength(1);
    expect(days[1]?.entries).toHaveLength(1);
  });
});

describe('a large diary stays smooth', () => {
  /**
   * Milestone 6's acceptance criterion. Seeds roughly two years of heavy daily logging across
   * every table, then checks that reading the newest page and reading a page deep in the
   * history cost about the same — the property keyset pagination exists to provide, and the one
   * OFFSET would quietly destroy.
   */
  const PER_TABLE = 2_000;

  async function seedLargeDiary() {
    const start = Date.parse('2024-01-01T00:00:00Z');
    const stamp = (i: number) => new Date(start + i * 15 * 60_000).toISOString();

    await db.withTransactionAsync(async (tx) => {
      for (let i = 0; i < PER_TABLE; i += 1) {
        const occurredAt = stamp(i);
        const localDate = occurredAt.slice(0, 10);
        const common = [USER, occurredAt, localDate, occurredAt, occurredAt];

        await tx.runAsync(
          `INSERT INTO symptom_logs (id, user_id, symptom_type, severity, occurred_at,
             occurred_local_date, occurred_tz, occurred_utc_offset_minutes, created_at, updated_at)
           VALUES (?, ?, 'bloating', 5, ?, ?, 'UTC', 0, ?, ?)`,
          `s-${i}`,
          ...common
        );
        await tx.runAsync(
          `INSERT INTO bowel_logs (id, user_id, bristol_type, urgency, difficulty, occurred_at,
             occurred_local_date, occurred_tz, occurred_utc_offset_minutes, created_at, updated_at)
           VALUES (?, ?, 4, 'low', 'easy', ?, ?, 'UTC', 0, ?, ?)`,
          `b-${i}`,
          ...common
        );
        await tx.runAsync(
          `INSERT INTO wellbeing_logs (id, user_id, occurred_at, occurred_local_date,
             occurred_tz, occurred_utc_offset_minutes, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'UTC', 0, ?, ?)`,
          `w-${i}`,
          ...common
        );
        await tx.runAsync(
          `INSERT INTO context_logs (id, user_id, context_type, value_numeric, occurred_at,
             occurred_local_date, occurred_tz, occurred_utc_offset_minutes, created_at, updated_at)
           VALUES (?, ?, 'stress', 3, ?, ?, 'UTC', 0, ?, ?)`,
          `c-${i}`,
          ...common
        );
        await tx.runAsync(
          `INSERT INTO meal_logs (id, user_id, title, meal_size, occurred_at,
             occurred_local_date, occurred_tz, occurred_utc_offset_minutes, created_at, updated_at)
           VALUES (?, ?, 'Meal', 'medium', ?, ?, 'UTC', 0, ?, ?)`,
          `m-${i}`,
          ...common
        );
        await tx.runAsync(
          `INSERT INTO meal_items (id, meal_id, user_id, raw_name, position)
           VALUES (?, ?, ?, 'rice', 0)`,
          `mi-${i}`,
          `m-${i}`,
          USER
        );
      }
    });
  }

  it('reads a deep page about as fast as the first one', async () => {
    await seedLargeDiary();

    expect(await countTimelineEntries(db, USER)).toBe(PER_TABLE * 5);

    const firstStarted = performance.now();
    const first = await fetchTimelinePage(db, { userId: USER });
    const firstMs = performance.now() - firstStarted;

    // Walk 25 pages in (about a thousand entries) and time the page there.
    let cursor: TimelineCursor | null = first.nextCursor;
    for (let page = 0; page < 24 && cursor !== null; page += 1) {
      cursor = (await fetchTimelinePage(db, { userId: USER, cursor })).nextCursor;
    }

    const deepStarted = performance.now();
    const deep = await fetchTimelinePage(db, { userId: USER, cursor });
    const deepMs = performance.now() - deepStarted;

    expect(first.entries).toHaveLength(40);
    expect(deep.entries).toHaveLength(40);

    // Generous bounds: the point is to catch a change that makes paging cost grow with depth,
    // not to pin a number to this machine.
    expect(firstMs).toBeLessThan(1_000);
    expect(deepMs).toBeLessThan(1_000);
    expect(deepMs).toBeLessThan(firstMs * 10 + 100);
  });

  it('searches ten thousand entries without scanning them all into memory', async () => {
    await seedLargeDiary();

    const started = performance.now();
    const page = await fetchTimelinePage(db, { userId: USER, search: 'rice' });
    const elapsed = performance.now() - started;

    expect(page.entries).toHaveLength(40);
    expect(page.entries.every((entry) => entry.kind === 'meal')).toBe(true);
    expect(elapsed).toBeLessThan(2_000);
  });
});
