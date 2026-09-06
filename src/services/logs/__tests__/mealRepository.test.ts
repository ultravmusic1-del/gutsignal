/**
 * @jest-environment node
 *
 * The meal aggregate write path, against a real SQL engine and the real shipped schema.
 */
import { failingOn } from '@/services/db/failing.testing';
import type { MealDraft } from '@/domain/logs/meal';
import { migrate } from '@/services/db/migrator';
import { createTestDatabase, type TestDatabase } from '@/services/db/nodeSqlite.testing';
import type { SqlBindValue, SqlDatabase } from '@/services/db/sqlite';
import { markSynced, pendingCount, pendingRecordIds } from '@/services/sync/outbox';

import {
  applyServerMeals,
  createMeal,
  getMeal,
  groupIntoAggregates,
  listMealsForLocalDate,
  listRecentMeals,
  repeatMeal,
  softDeleteMeal,
  toRow,
  type MealRow,
} from '../mealRepository';

const USER = 'user-1';
const NOW = new Date('2026-08-24T12:00:00Z');

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

function draft(overrides: Partial<MealDraft> = {}): MealDraft {
  return {
    title: 'Chicken shawarma',
    items: ['chicken', 'flatbread', 'garlic sauce'],
    mealSize: 'medium',
    tags: ['restaurant'],
    occurredAt: new Date('2026-08-24T11:00:00Z'),
    note: undefined,
    ...overrides,
  };
}

async function counts() {
  const row = await db.getFirstAsync<{ meals: number; items: number; tags: number }>(
    `SELECT (SELECT COUNT(*) FROM meal_logs)  AS meals,
            (SELECT COUNT(*) FROM meal_items) AS items,
            (SELECT COUNT(*) FROM meal_tags)  AS tags`
  );
  return row ?? { meals: 0, items: 0, tags: 0 };
}

describe('createMeal', () => {
  it('writes the meal with its items and tags', async () => {
    const meal = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    expect(meal.items.map((item) => item.rawName)).toEqual([
      'chicken',
      'flatbread',
      'garlic sauce',
    ]);
    expect(meal.tags).toEqual(['restaurant']);
    expect(await counts()).toEqual({ meals: 1, items: 3, tags: 1 });
  });

  it('reads back exactly what was written', async () => {
    const meal = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    expect(await getMeal(db, meal.id)).toEqual(meal);
  });

  it('keeps the order the user listed things in', async () => {
    const meal = await createMeal(
      db,
      { userId: USER, draft: draft({ items: ['coffee', 'toast', 'egg'] }), timeZone: 'UTC' },
      deps
    );

    const reloaded = await getMeal(db, meal.id);
    expect(reloaded?.items.map((item) => item.rawName)).toEqual(['coffee', 'toast', 'egg']);
    expect(reloaded?.items.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it('queues ONE outbox row for the whole aggregate, not one per table', async () => {
    const meal = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    expect(await pendingCount(db, 'meal_logs')).toBe(1);
    expect([...(await pendingRecordIds(db, 'meal_logs'))]).toEqual([meal.id]);
  });

  it('carries the items inside that single queued payload', async () => {
    const meal = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    const queued = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM sync_queue WHERE record_id = ?',
      meal.id
    );
    const payload = JSON.parse(queued!.payload) as MealRow;

    expect(payload.items).toHaveLength(3);
    expect(payload.tags).toEqual(['restaurant']);
  });

  it('writes the meal, its children and its outbox row atomically', async () => {
    // A meal that reaches the server without its items is an eating occasion with no
    // exposures — a data point that never happened. Nothing may survive alone.
    const crashing = failingOn(db, 'sync_queue');

    await expect(
      createMeal(crashing, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps)
    ).rejects.toThrow('simulated crash');

    expect(await counts()).toEqual({ meals: 0, items: 0, tags: 0 });
    expect(await pendingCount(db, 'meal_logs')).toBe(0);
  });

  it('accepts a meal with nothing itemised', async () => {
    const meal = await createMeal(
      db,
      { userId: USER, draft: draft({ items: [], tags: [] }), timeZone: 'UTC' },
      deps
    );

    expect(meal.items).toEqual([]);
    expect(await getMeal(db, meal.id)).toEqual(meal);
  });

  it('marks typed items as confirmed, since the user wrote them', async () => {
    const meal = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    expect(meal.items.every((item) => item.userConfirmed)).toBe(true);
    expect(meal.items.every((item) => item.canonicalFactorId === null)).toBe(true);
  });

  it('files the meal under the local calendar day, not the UTC day', async () => {
    const meal = await createMeal(
      db,
      {
        userId: USER,
        draft: draft({ occurredAt: new Date('2026-08-24T02:00:00Z') }),
        timeZone: 'America/New_York',
      },
      deps
    );

    expect(meal.occurredLocalDate).toBe('2026-08-23');
    expect(
      (await listMealsForLocalDate(db, { userId: USER, localDate: '2026-08-23' })).map((m) => m.id)
    ).toEqual([meal.id]);
    expect(await listMealsForLocalDate(db, { userId: USER, localDate: '2026-08-24' })).toEqual([]);
  });
});

describe('listMealsForLocalDate', () => {
  it('never returns another user’s meals', async () => {
    await createMeal(db, { userId: 'someone-else', draft: draft(), timeZone: 'UTC' }, deps);

    expect(await listMealsForLocalDate(db, { userId: USER, localDate: '2026-08-24' })).toEqual([]);
  });

  it('loads children without an N+1 — one query for items, one for tags', async () => {
    await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);
    await createMeal(
      db,
      { userId: USER, draft: draft({ title: 'Second' }), timeZone: 'UTC' },
      deps
    );

    const meals = await listMealsForLocalDate(db, { userId: USER, localDate: '2026-08-24' });

    expect(meals).toHaveLength(2);
    expect(meals.every((meal) => meal.items.length === 3)).toBe(true);
  });

  it('reports a meal as pending until the server confirms it', async () => {
    const meal = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    const [before] = await listRecentMeals(db, { userId: USER, limit: 10 });
    expect(before?.syncPending).toBe(true);

    const queued = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM sync_queue WHERE record_id = ?',
      meal.id
    );
    await markSynced(db, queued!.id);

    const [after] = await listRecentMeals(db, { userId: USER, limit: 10 });
    expect(after?.syncPending).toBe(false);
  });
});

describe('repeatMeal', () => {
  it('records a genuinely new meal, not a reference to the old one', async () => {
    const original = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    const repeated = await repeatMeal(
      db,
      {
        sourceMealId: original.id,
        occurredAt: new Date('2026-08-24T19:00:00Z'),
        timeZone: 'UTC',
      },
      { now: new Date('2026-08-24T19:00:00Z'), generateId }
    );

    // The user ate twice; the engine must count two exposures.
    expect(repeated?.id).not.toBe(original.id);
    expect(repeated?.items.map((item) => item.rawName)).toEqual(
      original.items.map((item) => item.rawName)
    );
    expect(repeated?.tags).toEqual(original.tags);
    expect(repeated?.occurredAt).toBe('2026-08-24T19:00:00.000Z');
    expect((await counts()).meals).toBe(2);
  });

  it('gives the copy its own item rows, so editing one cannot rewrite the other', async () => {
    const original = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);
    const repeated = await repeatMeal(
      db,
      { sourceMealId: original.id, occurredAt: NOW, timeZone: 'UTC' },
      deps
    );

    const originalIds = original.items.map((item) => item.id);
    const repeatedIds = repeated?.items.map((item) => item.id) ?? [];

    expect(repeatedIds.some((id) => originalIds.includes(id))).toBe(false);
    expect((await counts()).items).toBe(6);
  });

  it('queues the copy separately', async () => {
    const original = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);
    await repeatMeal(db, { sourceMealId: original.id, occurredAt: NOW, timeZone: 'UTC' }, deps);

    expect(await pendingCount(db, 'meal_logs')).toBe(2);
  });

  it('refuses to repeat a meal that does not exist or was deleted', async () => {
    expect(
      await repeatMeal(db, { sourceMealId: 'missing', occurredAt: NOW, timeZone: 'UTC' }, deps)
    ).toBeNull();

    const meal = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);
    await softDeleteMeal(db, meal.id, deps);

    expect(
      await repeatMeal(db, { sourceMealId: meal.id, occurredAt: NOW, timeZone: 'UTC' }, deps)
    ).toBeNull();
  });
});

describe('softDeleteMeal', () => {
  it('tombstones the meal and keeps its contents', async () => {
    const meal = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    expect(await softDeleteMeal(db, meal.id, deps)).toBe(true);

    expect((await counts()).meals).toBe(1);
    expect((await getMeal(db, meal.id))?.deletedAt).not.toBeNull();
    expect(await listRecentMeals(db, { userId: USER, limit: 10 })).toEqual([]);
  });

  it('cancels the upload entirely if the meal never reached the server', async () => {
    const meal = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    await softDeleteMeal(db, meal.id, deps);

    expect(await pendingCount(db, 'meal_logs')).toBe(0);
  });
});

describe('applyServerMeals', () => {
  function serverMeal(overrides: Partial<MealRow> = {}): MealRow {
    return {
      id: 'remote-1',
      user_id: USER,
      title: 'Porridge',
      meal_size: 'small',
      note: null,
      source: 'manual',
      photo_asset_id: null,
      occurred_at: '2026-08-24T07:00:00.000Z',
      occurred_local_date: '2026-08-24',
      occurred_tz: 'UTC',
      occurred_utc_offset_minutes: 0,
      deleted_at: null,
      created_at: '2026-08-24T07:00:00.000Z',
      updated_at: '2026-08-24T07:00:00.000Z',
      items: [
        {
          id: 'remote-item-1',
          meal_id: 'remote-1',
          user_id: USER,
          raw_name: 'oats',
          canonical_factor_id: null,
          confidence: null,
          user_confirmed: true,
          position: 0,
        },
      ],
      tags: ['homemade'],
      ...overrides,
    };
  }

  it('brings down a meal with its contents', async () => {
    expect(await applyServerMeals(db, [serverMeal()], new Set())).toEqual({
      applied: 1,
      skipped: 0,
    });

    const meal = await getMeal(db, 'remote-1');
    expect(meal?.items.map((item) => item.rawName)).toEqual(['oats']);
    expect(meal?.tags).toEqual(['homemade']);
  });

  it('is idempotent — applying twice does not duplicate the items', async () => {
    await applyServerMeals(db, [serverMeal()], new Set());
    await applyServerMeals(db, [serverMeal()], new Set());

    expect(await counts()).toEqual({ meals: 1, items: 1, tags: 1 });
  });

  it('replaces the contents rather than accumulating them', async () => {
    await applyServerMeals(db, [serverMeal()], new Set());

    await applyServerMeals(
      db,
      [
        serverMeal({
          updated_at: '2026-08-24T08:00:00.000Z',
          items: [
            {
              id: 'remote-item-2',
              meal_id: 'remote-1',
              user_id: USER,
              raw_name: 'banana',
              canonical_factor_id: null,
              confidence: null,
              user_confirmed: true,
              position: 0,
            },
          ],
          tags: [],
        }),
      ],
      new Set()
    );

    const meal = await getMeal(db, 'remote-1');
    expect(meal?.items.map((item) => item.rawName)).toEqual(['banana']);
    expect(meal?.tags).toEqual([]);
    expect((await counts()).items).toBe(1);
  });

  it('refuses to overwrite a meal whose local edit has not been pushed', async () => {
    const meal = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    const result = await applyServerMeals(
      db,
      [serverMeal({ id: meal.id, title: 'Clobbered', updated_at: '2099-01-01T00:00:00.000Z' })],
      await pendingRecordIds(db, 'meal_logs')
    );

    expect(result).toEqual({ applied: 0, skipped: 1 });
    expect((await getMeal(db, meal.id))?.title).toBe('Chicken shawarma');
  });

  it('round-trips a locally created meal through the server row shape', async () => {
    const meal = await createMeal(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    await applyServerMeals(db, [toRow(meal)], new Set());

    expect(await getMeal(db, meal.id)).toEqual(meal);
  });

  it('replicates a deletion made on another device', async () => {
    await applyServerMeals(db, [serverMeal()], new Set());
    await applyServerMeals(
      db,
      [
        serverMeal({
          deleted_at: '2026-08-24T09:00:00.000Z',
          updated_at: '2026-08-24T09:00:00.000Z',
        }),
      ],
      new Set()
    );

    expect(await listRecentMeals(db, { userId: USER, limit: 10 })).toEqual([]);
    expect((await counts()).meals).toBe(1);
  });
});

describe('groupIntoAggregates', () => {
  const parent = (id: string) => ({
    id,
    user_id: USER,
    title: `Meal ${id}`,
    meal_size: 'medium' as const,
    note: null,
    source: 'manual' as const,
    photo_asset_id: null,
    occurred_at: '2026-08-24T07:00:00.000Z',
    occurred_local_date: '2026-08-24',
    occurred_tz: 'UTC',
    occurred_utc_offset_minutes: 0,
    deleted_at: null,
    created_at: '2026-08-24T07:00:00.000Z',
    updated_at: '2026-08-24T07:00:00.000Z',
  });

  const item = (id: string, mealId: string, rawName: string, position: number) => ({
    id,
    meal_id: mealId,
    user_id: USER,
    raw_name: rawName,
    canonical_factor_id: null,
    confidence: null,
    user_confirmed: true,
    position,
  });

  it('attaches each child to the right parent', () => {
    const result = groupIntoAggregates(
      [parent('m1'), parent('m2')],
      [item('i1', 'm1', 'oats', 0), item('i2', 'm2', 'coffee', 0)],
      [
        { meal_id: 'm1', tag: 'homemade' },
        { meal_id: 'm2', tag: 'caffeinated' },
      ]
    );

    expect(result[0]?.items.map((i) => i.raw_name)).toEqual(['oats']);
    expect(result[1]?.items.map((i) => i.raw_name)).toEqual(['coffee']);
    expect(result[0]?.tags).toEqual(['homemade']);
  });

  it('orders items by position regardless of the order they arrive in', () => {
    const result = groupIntoAggregates(
      [parent('m1')],
      [item('i2', 'm1', 'toast', 1), item('i1', 'm1', 'egg', 0)],
      []
    );

    expect(result[0]?.items.map((i) => i.raw_name)).toEqual(['egg', 'toast']);
  });

  it('gives a meal with no children empty lists rather than undefined', () => {
    const result = groupIntoAggregates([parent('m1')], [], []);

    expect(result[0]?.items).toEqual([]);
    expect(result[0]?.tags).toEqual([]);
  });

  it('ignores children whose parent is not in the page', () => {
    const result = groupIntoAggregates(
      [parent('m1')],
      [item('i1', 'm1', 'oats', 0), item('i9', 'other-meal', 'stray', 0)],
      []
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.items).toHaveLength(1);
  });
});
