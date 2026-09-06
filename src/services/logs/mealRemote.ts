/**
 * The Supabase side of meal sync, packaged as a `SyncEntity`.
 *
 * Push goes through the `upsert_meals` RPC rather than a table upsert, because a meal is three
 * tables and must arrive whole (ADR-0034).
 *
 * Pull fetches the parents, then their items and tags, in three explicit queries rather than
 * one PostgREST embedded select. The children hang off `meal_logs` by a *composite* foreign key
 * — `(meal_id, user_id)` — and relying on the relationship being inferred correctly is a
 * dependency on schema-cache behaviour that would fail on a device, at sync time, silently.
 * Three predictable queries on a background task is the better trade.
 */

import { z } from 'zod';

import { MEAL_SIZES, MEAL_TAGS } from '@/domain/logs/meal';
import { LOG_SOURCES } from '@/domain/logs/source';
import type { SqlDatabase } from '@/services/db/sqlite';
import { getSupabaseClient } from '@/services/supabase/client';
import { keysetFilter, type SyncCursor } from '@/services/sync/cursors';
import type { SyncableRow, SyncEntity } from '@/services/sync/syncEngine';

import {
  applyServerMeals,
  groupIntoAggregates,
  MEAL_LOGS_TABLE,
  type MealRow,
} from './mealRepository';

const MEAL_COLUMNS =
  'id, user_id, title, meal_size, note, source, photo_asset_id, occurred_at, ' +
  'occurred_local_date, occurred_tz, occurred_utc_offset_minutes, deleted_at, created_at, ' +
  'updated_at';

const ITEM_COLUMNS =
  'id, meal_id, user_id, raw_name, canonical_factor_id, confidence, user_confirmed, position';

const mealParentSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  meal_size: z.enum(MEAL_SIZES),
  note: z.string().nullable(),
  source: z.enum(LOG_SOURCES),
  photo_asset_id: z.string().nullable(),
  occurred_at: z.string(),
  occurred_local_date: z.string(),
  occurred_tz: z.string(),
  occurred_utc_offset_minutes: z.number().int(),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const mealItemSchema = z.object({
  id: z.string().uuid(),
  meal_id: z.string().uuid(),
  user_id: z.string().uuid(),
  raw_name: z.string(),
  canonical_factor_id: z.string().uuid().nullable(),
  confidence: z.number().nullable(),
  user_confirmed: z.boolean(),
  position: z.number().int(),
});

const mealTagSchema = z.object({
  meal_id: z.string().uuid(),
  tag: z.enum(MEAL_TAGS),
});

export function createMealSyncEntity(userId: string): SyncEntity {
  return {
    tableName: MEAL_LOGS_TABLE,

    async upsert(payloads: unknown[]): Promise<void> {
      if (payloads.length === 0) return;

      const supabase = getSupabaseClient();

      // One transaction server-side: parent, items and tags, or none of them.
      const { error } = await supabase.rpc('upsert_meals', { payloads });

      if (error) {
        // Identifies the failure, never the meal's contents (CLAUDE.md §30).
        throw new Error(`upsert_meals failed: ${error.code ?? 'unknown'}`);
      }
    },

    async fetchChangedSince({
      cursor,
      limit,
    }: {
      cursor: SyncCursor | null;
      limit: number;
    }): Promise<SyncableRow[]> {
      const supabase = getSupabaseClient();

      // Keyset on `(updated_at, id)`. Meals are the entity most exposed to this: `upsert_meals`
      // writes a whole batch in one transaction, so every meal in that batch shares an
      // `updated_at` and a timestamp-only cursor could never page past a large one.
      let query = supabase
        .from('meal_logs')
        .select(MEAL_COLUMNS)
        .eq('user_id', userId)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);

      if (cursor !== null) query = query.or(keysetFilter(cursor));

      const { data, error } = await query;
      if (error) throw new Error(`meal_logs fetch failed: ${error.code ?? 'unknown'}`);

      const parents = z.array(mealParentSchema).safeParse(data ?? []);
      if (!parents.success) {
        throw new Error('meal_logs fetch returned rows in an unexpected shape');
      }
      if (parents.data.length === 0) return [];

      const mealIds = parents.data.map((meal) => meal.id);

      const [itemsResult, tagsResult] = await Promise.all([
        supabase.from('meal_items').select(ITEM_COLUMNS).in('meal_id', mealIds),
        supabase.from('meal_tags').select('meal_id, tag').in('meal_id', mealIds),
      ]);

      if (itemsResult.error) {
        throw new Error(`meal_items fetch failed: ${itemsResult.error.code ?? 'unknown'}`);
      }
      if (tagsResult.error) {
        throw new Error(`meal_tags fetch failed: ${tagsResult.error.code ?? 'unknown'}`);
      }

      const items = z.array(mealItemSchema).safeParse(itemsResult.data ?? []);
      const tags = z.array(mealTagSchema).safeParse(tagsResult.data ?? []);

      if (!items.success) throw new Error('meal_items fetch returned rows in an unexpected shape');
      if (!tags.success) throw new Error('meal_tags fetch returned rows in an unexpected shape');

      return groupIntoAggregates(parents.data, items.data, tags.data);
    },

    async apply(
      db: SqlDatabase,
      rows: SyncableRow[],
      pending: ReadonlySet<string>
    ): Promise<{ applied: number; skipped: number }> {
      // Safe narrowing: these are the aggregates this entity assembled and validated above.
      return applyServerMeals(db, rows as MealRow[], pending);
    },
  };
}
