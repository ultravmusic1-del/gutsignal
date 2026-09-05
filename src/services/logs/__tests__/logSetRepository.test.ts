/**
 * @jest-environment node
 *
 * Reading a diary for the engine, against a real SQL engine and the real shipped schema.
 */
import { analyse } from '@/domain/pattern-engine/engine';
import { migrate } from '@/services/db/migrator';
import { createTestDatabase, type TestDatabase } from '@/services/db/nodeSqlite.testing';

import { createBowelLog } from '../bowelRepository';
import { createContextLog } from '../contextRepository';
import { defaultAnalysisRange, loadLogSet, DEFAULT_ANALYSIS_DAYS } from '../logSetRepository';
import { createMeal, softDeleteMeal } from '../mealRepository';
import { createSymptomLog, softDeleteSymptomLog } from '../symptomRepository';
import { createWellbeingLog } from '../wellbeingRepository';

const USER = 'user-1';
const NOW = new Date('2026-03-01T12:00:00Z');

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

const at = (localDate: string, hour = 12) =>
  new Date(`${localDate}T${String(hour).padStart(2, '0')}:00:00Z`);

async function seedDay(localDate: string) {
  await createMeal(
    db,
    {
      userId: USER,
      draft: {
        title: 'Breakfast',
        items: ['coffee'],
        mealSize: 'medium',
        tags: ['caffeinated'],
        occurredAt: at(localDate, 8),
        note: undefined,
      },
      timeZone: 'UTC',
    },
    deps
  );

  await createSymptomLog(
    db,
    {
      userId: USER,
      draft: { symptomType: 'bloating', severity: 6, occurredAt: at(localDate, 14) },
      timeZone: 'UTC',
    },
    deps
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
        occurredAt: at(localDate, 7),
      },
      timeZone: 'UTC',
    },
    deps
  );

  await createWellbeingLog(
    db,
    { userId: USER, draft: { occurredAt: at(localDate, 20) }, timeZone: 'UTC' },
    deps
  );

  await createContextLog(
    db,
    {
      userId: USER,
      draft: {
        contextType: 'stress',
        valueNumeric: 4,
        valueText: null,
        occurredAt: at(localDate, 21),
      },
      timeZone: 'UTC',
    },
    deps
  );
}

describe('loadLogSet', () => {
  it('reads every kind of log in the range', async () => {
    await seedDay('2026-02-10');

    const logs = await loadLogSet(db, {
      userId: USER,
      range: { start: '2026-02-01', end: '2026-02-28' },
    });

    expect(logs.meals).toHaveLength(1);
    expect(logs.symptoms).toHaveLength(1);
    expect(logs.bowel).toHaveLength(1);
    expect(logs.wellbeing).toHaveLength(1);
    expect(logs.context).toHaveLength(1);
  });

  it('brings meals back with their items, which the engine needs', async () => {
    await seedDay('2026-02-10');

    const logs = await loadLogSet(db, {
      userId: USER,
      range: { start: '2026-02-01', end: '2026-02-28' },
    });

    expect(logs.meals[0]?.items.map((item) => item.rawName)).toEqual(['coffee']);
    expect(logs.meals[0]?.tags).toEqual(['caffeinated']);
  });

  it('excludes logs outside the range', async () => {
    await seedDay('2026-01-05');
    await seedDay('2026-02-10');

    const logs = await loadLogSet(db, {
      userId: USER,
      range: { start: '2026-02-01', end: '2026-02-28' },
    });

    expect(logs.symptoms).toHaveLength(1);
    expect(logs.symptoms[0]?.occurredLocalDate).toBe('2026-02-10');
  });

  it('includes both ends of the range', async () => {
    await seedDay('2026-02-01');
    await seedDay('2026-02-28');

    const logs = await loadLogSet(db, {
      userId: USER,
      range: { start: '2026-02-01', end: '2026-02-28' },
    });

    expect(logs.symptoms).toHaveLength(2);
  });

  it('excludes logs the user deleted', async () => {
    // A deleted log is one the user took back. It should not travel any further than it has to.
    await seedDay('2026-02-10');

    const before = await loadLogSet(db, {
      userId: USER,
      range: { start: '2026-02-01', end: '2026-02-28' },
    });

    await softDeleteSymptomLog(db, before.symptoms[0]!.id, deps);
    await softDeleteMeal(db, before.meals[0]!.id, deps);

    const after = await loadLogSet(db, {
      userId: USER,
      range: { start: '2026-02-01', end: '2026-02-28' },
    });

    expect(after.symptoms).toEqual([]);
    expect(after.meals).toEqual([]);
    expect(after.wellbeing).toHaveLength(1);
  });

  it('never reads another user’s diary', async () => {
    await seedDay('2026-02-10');

    const logs = await loadLogSet(db, {
      userId: 'someone-else',
      range: { start: '2026-02-01', end: '2026-02-28' },
    });

    expect(logs).toEqual({ meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] });
  });

  it('returns an empty diary rather than failing when there is nothing there', async () => {
    const logs = await loadLogSet(db, {
      userId: USER,
      range: { start: '2026-02-01', end: '2026-02-28' },
    });

    expect(logs).toEqual({ meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] });
  });

  it('feeds the engine directly', async () => {
    // The point of the whole module: what comes out of storage is what analyse() takes in.
    for (let day = 1; day <= 28; day += 1) {
      await seedDay(`2026-02-${String(day).padStart(2, '0')}`);
    }

    const range = { start: '2026-02-01', end: '2026-02-28' };
    const logs = await loadLogSet(db, { userId: USER, range });

    expect(() => analyse({ logs, range, now: NOW })).not.toThrow();
  });
});

describe('defaultAnalysisRange', () => {
  it('ends today and covers the default window', () => {
    const range = defaultAnalysisRange('2026-03-01');

    expect(range.end).toBe('2026-03-01');
    expect(range.start).toBe('2025-12-02'); // 90 days inclusive
  });

  it('is inclusive of both ends, so the day count is exact', () => {
    const range = defaultAnalysisRange('2026-03-01', 7);

    expect(range.start).toBe('2026-02-23');
    expect(range.end).toBe('2026-03-01');
  });

  it('crosses a year boundary correctly', () => {
    expect(defaultAnalysisRange('2026-01-02', 3).start).toBe('2025-12-31');
  });

  it('handles a single-day range', () => {
    expect(defaultAnalysisRange('2026-03-01', 1)).toEqual({
      start: '2026-03-01',
      end: '2026-03-01',
    });
  });

  it('degrades to a single day rather than inventing one for an unparseable date', () => {
    expect(defaultAnalysisRange('not-a-date')).toEqual({ start: 'not-a-date', end: 'not-a-date' });
  });

  it('looks at a window long enough for weekly consistency to mean something', () => {
    expect(DEFAULT_ANALYSIS_DAYS).toBeGreaterThanOrEqual(28);
  });
});
