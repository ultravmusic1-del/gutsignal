/**
 * Local persistence for meals (docs/PROJECT_PLAN.md §6, ADR-0034).
 *
 * A meal is written as a whole: the occasion, its items and its tags all commit in one
 * transaction, together with the **single** outbox row that represents them. One row, not
 * three, because the unit the server must be told about is the meal — not its parts.
 *
 * Nothing here touches the network, and nothing imports a native module, so the entire write
 * path is exercised against a real SQL engine in tests.
 */

import type { Meal, MealDraft, MealItem, MealSize, MealTag } from '@/domain/logs/meal';
import type { LogSource } from '@/domain/logs/source';
import { buildOccurrence } from '@/domain/time/occurrence';
import type { SqlDatabase } from '@/services/db/sqlite';
import { resolveIncoming } from '@/services/sync/merge';
import { enqueue } from '@/services/sync/outbox';
import type { IdGenerator } from '@/utils/id';

export const MEAL_LOGS_TABLE = 'meal_logs';

export type MealWithSync = Meal & { syncPending: boolean };

type Deps = {
  now: Date;
  generateId: IdGenerator;
};

/** The item shape shared by SQLite, Postgres and the RPC payload. */
export type MealItemRow = {
  id: string;
  meal_id: string;
  user_id: string;
  raw_name: string;
  canonical_factor_id: string | null;
  confidence: number | null;
  user_confirmed: boolean;
  position: number;
};

/** The whole aggregate, as it travels to and from the server. */
export type MealRow = {
  id: string;
  user_id: string;
  title: string;
  meal_size: MealSize;
  note: string | null;
  source: LogSource;
  photo_asset_id: string | null;
  occurred_at: string;
  occurred_local_date: string;
  occurred_tz: string;
  occurred_utc_offset_minutes: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  items: MealItemRow[];
  tags: MealTag[];
};

export function toRow(meal: Meal): MealRow {
  return {
    id: meal.id,
    user_id: meal.userId,
    title: meal.title,
    meal_size: meal.mealSize,
    note: meal.note,
    source: meal.source,
    photo_asset_id: meal.photoAssetId,
    occurred_at: meal.occurredAt,
    occurred_local_date: meal.occurredLocalDate,
    occurred_tz: meal.occurredTz,
    occurred_utc_offset_minutes: meal.occurredUtcOffsetMinutes,
    deleted_at: meal.deletedAt,
    created_at: meal.createdAt,
    updated_at: meal.updatedAt,
    items: meal.items.map((item) => ({
      id: item.id,
      meal_id: item.mealId,
      user_id: item.userId,
      raw_name: item.rawName,
      canonical_factor_id: item.canonicalFactorId,
      confidence: item.confidence,
      user_confirmed: item.userConfirmed,
      position: item.position,
    })),
    tags: meal.tags,
  };
}

export function fromRow(row: MealRow): Meal {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    mealSize: row.meal_size,
    note: row.note,
    source: row.source,
    photoAssetId: row.photo_asset_id,
    occurredAt: row.occurred_at,
    occurredLocalDate: row.occurred_local_date,
    occurredTz: row.occurred_tz,
    occurredUtcOffsetMinutes: row.occurred_utc_offset_minutes,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: row.items
      .map((item) => ({
        id: item.id,
        mealId: item.meal_id,
        userId: item.user_id,
        rawName: item.raw_name,
        canonicalFactorId: item.canonical_factor_id,
        confidence: item.confidence,
        userConfirmed: item.user_confirmed,
        position: item.position,
      }))
      .sort((left, right) => left.position - right.position),
    tags: row.tags,
  };
}

const UPSERT_MEAL_SQL = `
  INSERT INTO meal_logs
    (id, user_id, title, meal_size, note, source, photo_asset_id, occurred_at,
     occurred_local_date, occurred_tz, occurred_utc_offset_minutes, deleted_at,
     created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (id) DO UPDATE SET
    title                       = excluded.title,
    meal_size                   = excluded.meal_size,
    note                        = excluded.note,
    source                      = excluded.source,
    photo_asset_id              = excluded.photo_asset_id,
    occurred_at                 = excluded.occurred_at,
    occurred_local_date         = excluded.occurred_local_date,
    occurred_tz                 = excluded.occurred_tz,
    occurred_utc_offset_minutes = excluded.occurred_utc_offset_minutes,
    deleted_at                  = excluded.deleted_at,
    updated_at                  = excluded.updated_at
`;

/**
 * Writes the aggregate. **Must be called inside a transaction** — it replaces the children,
 * so a failure partway would otherwise leave a meal with some of its previous contents.
 */
async function writeAggregate(db: SqlDatabase, row: MealRow): Promise<void> {
  await db.runAsync(
    UPSERT_MEAL_SQL,
    row.id,
    row.user_id,
    row.title,
    row.meal_size,
    row.note,
    row.source,
    row.photo_asset_id,
    row.occurred_at,
    row.occurred_local_date,
    row.occurred_tz,
    row.occurred_utc_offset_minutes,
    row.deleted_at,
    row.created_at,
    row.updated_at
  );

  // Replaced wholesale rather than diffed, matching the server function exactly. Two places
  // deciding "what is in this meal?" is the kind of duplicated truth that goes wrong quietly.
  await db.runAsync('DELETE FROM meal_items WHERE meal_id = ?', row.id);
  await db.runAsync('DELETE FROM meal_tags WHERE meal_id = ?', row.id);

  for (const item of row.items) {
    await db.runAsync(
      `INSERT INTO meal_items
         (id, meal_id, user_id, raw_name, canonical_factor_id, confidence, user_confirmed,
          position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id,
      row.id,
      row.user_id,
      item.raw_name,
      item.canonical_factor_id,
      item.confidence,
      item.user_confirmed ? 1 : 0,
      item.position
    );
  }

  for (const tag of row.tags) {
    await db.runAsync(
      'INSERT OR IGNORE INTO meal_tags (meal_id, user_id, tag) VALUES (?, ?, ?)',
      row.id,
      row.user_id,
      tag
    );
  }
}

function buildMeal(
  { userId, draft, timeZone }: { userId: string; draft: MealDraft; timeZone: string },
  { now, generateId }: Deps
): Meal {
  const timestamp = now.toISOString();
  const id = generateId();

  return {
    id,
    userId,
    title: draft.title,
    mealSize: draft.mealSize,
    note: draft.note ?? null,
    source: 'manual',
    photoAssetId: null,
    ...buildOccurrence(draft.occurredAt, timeZone),
    deletedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    items: draft.items.map((rawName, position) => ({
      id: generateId(),
      mealId: id,
      userId,
      rawName,
      canonicalFactorId: null,
      confidence: null,
      // The user typed it themselves, so it is confirmed by definition. Only extracted items
      // arrive unconfirmed (CLAUDE.md §23).
      userConfirmed: true,
      position,
    })),
    tags: draft.tags,
  };
}

/** Writes a new meal and queues the whole aggregate for sync, atomically. */
export async function createMeal(
  db: SqlDatabase,
  input: { userId: string; draft: MealDraft; timeZone: string },
  deps: Deps
): Promise<Meal> {
  const meal = buildMeal(input, deps);
  const row = toRow(meal);

  await db.withTransactionAsync(async () => {
    await writeAggregate(db, row);
    await enqueue(
      db,
      { tableName: MEAL_LOGS_TABLE, recordId: meal.id, operation: 'insert', payload: row },
      deps
    );
  });

  return meal;
}

/**
 * Records the same meal again at a new time (spec §40).
 *
 * A genuinely new meal with new ids, not a reference to the old one: the user ate twice, and
 * the engine must count two exposures. Editing the original later must not rewrite this one.
 */
export async function repeatMeal(
  db: SqlDatabase,
  {
    sourceMealId,
    occurredAt,
    timeZone,
  }: { sourceMealId: string; occurredAt: Date; timeZone: string },
  deps: Deps
): Promise<Meal | null> {
  const source = await getMeal(db, sourceMealId);
  if (source === null || source.deletedAt !== null) return null;

  return createMeal(
    db,
    {
      userId: source.userId,
      draft: {
        title: source.title,
        items: source.items.map((item) => item.rawName),
        mealSize: source.mealSize,
        tags: source.tags,
        occurredAt,
        note: source.note ?? undefined,
      },
      timeZone,
    },
    deps
  );
}

/** Tombstones a meal. Its items stay, so the deletion replicates rather than looking like loss. */
export async function softDeleteMeal(db: SqlDatabase, id: string, deps: Deps): Promise<boolean> {
  const existing = await getMeal(db, id);
  if (existing === null) return false;

  const timestamp = deps.now.toISOString();
  const row = toRow({ ...existing, deletedAt: timestamp, updatedAt: timestamp });

  await db.withTransactionAsync(async () => {
    await writeAggregate(db, row);
    await enqueue(
      db,
      { tableName: MEAL_LOGS_TABLE, recordId: id, operation: 'delete', payload: row },
      deps
    );
  });

  return true;
}

type MealDbRow = Omit<MealRow, 'items' | 'tags'>;
type ItemDbRow = Omit<MealItemRow, 'user_confirmed'> & { user_confirmed: number };

/**
 * Loads items and tags for a set of meals in two queries rather than two per meal.
 *
 * The N+1 this avoids would be invisible with a day's meals and painful with a year's
 * timeline (CLAUDE.md §37).
 */
async function attachChildren(db: SqlDatabase, meals: MealDbRow[]): Promise<MealRow[]> {
  if (meals.length === 0) return [];

  const placeholders = meals.map(() => '?').join(', ');
  const ids = meals.map((meal) => meal.id);

  const items = await db.getAllAsync<ItemDbRow>(
    `SELECT * FROM meal_items WHERE meal_id IN (${placeholders}) ORDER BY position ASC`,
    ...ids
  );
  const tags = await db.getAllAsync<{ meal_id: string; tag: MealTag }>(
    `SELECT meal_id, tag FROM meal_tags WHERE meal_id IN (${placeholders}) ORDER BY tag ASC`,
    ...ids
  );

  const itemsByMeal = new Map<string, MealItemRow[]>();
  for (const item of items) {
    const list = itemsByMeal.get(item.meal_id) ?? [];
    list.push({ ...item, user_confirmed: item.user_confirmed === 1 });
    itemsByMeal.set(item.meal_id, list);
  }

  const tagsByMeal = new Map<string, MealTag[]>();
  for (const tag of tags) {
    const list = tagsByMeal.get(tag.meal_id) ?? [];
    list.push(tag.tag);
    tagsByMeal.set(tag.meal_id, list);
  }

  return meals.map((meal) => ({
    ...meal,
    items: itemsByMeal.get(meal.id) ?? [],
    tags: tagsByMeal.get(meal.id) ?? [],
  }));
}

export async function getMeal(db: SqlDatabase, id: string): Promise<Meal | null> {
  const row = await db.getFirstAsync<MealDbRow>('SELECT * FROM meal_logs WHERE id = ?', id);
  if (row === null) return null;

  const [withChildren] = await attachChildren(db, [row]);
  return withChildren === undefined ? null : fromRow(withChildren);
}

async function listMeals(
  db: SqlDatabase,
  where: string,
  params: (string | number)[]
): Promise<MealWithSync[]> {
  const rows = await db.getAllAsync<MealDbRow & { sync_pending: number }>(
    `SELECT m.*, (q.id IS NOT NULL) AS sync_pending
       FROM meal_logs m
       LEFT JOIN sync_queue q ON q.table_name = 'meal_logs' AND q.record_id = m.id
      ${where}`,
    ...params
  );

  const pendingById = new Map(rows.map((row) => [row.id, row.sync_pending === 1]));
  const withChildren = await attachChildren(db, rows);

  return withChildren.map((row) => ({
    ...fromRow(row),
    syncPending: pendingById.get(row.id) ?? false,
  }));
}

/** Meals on one of the user's calendar days. Filters on the local date, never the UTC date. */
export async function listMealsForLocalDate(
  db: SqlDatabase,
  { userId, localDate }: { userId: string; localDate: string }
): Promise<MealWithSync[]> {
  return listMeals(
    db,
    `WHERE m.user_id = ? AND m.occurred_local_date = ? AND m.deleted_at IS NULL
     ORDER BY m.occurred_at DESC`,
    [userId, localDate]
  );
}

/** Most recent meals, newest first. Backs "Repeat" and the timeline. */
export async function listRecentMeals(
  db: SqlDatabase,
  { userId, limit }: { userId: string; limit: number }
): Promise<MealWithSync[]> {
  return listMeals(
    db,
    `WHERE m.user_id = ? AND m.deleted_at IS NULL
     ORDER BY m.occurred_at DESC
     LIMIT ?`,
    [userId, limit]
  );
}

/**
 * Merges meals arriving from the server.
 *
 * Each meal is applied in its own transaction: the aggregate replaces its children, so a
 * failure partway through one meal must not leave it holding a mixture of old and new items.
 */
export async function applyServerMeals(
  db: SqlDatabase,
  rows: MealRow[],
  pendingRecordIds: ReadonlySet<string>
): Promise<{ applied: number; skipped: number }> {
  let applied = 0;
  let skipped = 0;

  for (const row of rows) {
    const local = await db.getFirstAsync<{ id: string; updated_at: string }>(
      'SELECT id, updated_at FROM meal_logs WHERE id = ?',
      row.id
    );

    const decision = resolveIncoming({
      remote: { id: row.id, updatedAt: row.updated_at },
      local: local === null ? null : { id: local.id, updatedAt: local.updated_at },
      hasPendingLocalChange: pendingRecordIds.has(row.id),
    });

    if (decision === 'apply_remote') {
      await db.withTransactionAsync(async () => {
        await writeAggregate(db, row);
      });
      applied += 1;
    } else {
      skipped += 1;
    }
  }

  return { applied, skipped };
}

/** Stitches the three result sets back into whole meals. */
export function groupIntoAggregates(
  parents: Omit<MealRow, 'items' | 'tags'>[],
  items: MealItemRow[],
  tags: { meal_id: string; tag: MealRow['tags'][number] }[]
): MealRow[] {
  const itemsByMeal = new Map<string, MealItemRow[]>();
  for (const item of items) {
    const list = itemsByMeal.get(item.meal_id) ?? [];
    list.push(item);
    itemsByMeal.set(item.meal_id, list);
  }

  const tagsByMeal = new Map<string, MealRow['tags']>();
  for (const tag of tags) {
    const list = tagsByMeal.get(tag.meal_id) ?? [];
    list.push(tag.tag);
    tagsByMeal.set(tag.meal_id, list);
  }

  return parents.map((parent) => ({
    ...parent,
    items: (itemsByMeal.get(parent.id) ?? []).sort((a, b) => a.position - b.position),
    tags: tagsByMeal.get(parent.id) ?? [],
  }));
}
