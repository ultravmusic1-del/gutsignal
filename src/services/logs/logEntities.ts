/**
 * The Supabase side of every single-row log type, as `SyncEntity` implementations.
 *
 * Symptoms, bowel movements, wellbeing and context reach the server identically: an upsert on
 * the device-generated id, and a cursor read filtered to the caller's own rows. Only the columns
 * differ. So the mechanics live in one factory and each type contributes a column list, a schema
 * and its merge function.
 *
 * Meals are not here — an aggregate written through an RPC is a genuinely different shape
 * (ADR-0034).
 *
 * Rows arriving from the server are validated before they reach local storage (CLAUDE.md §11):
 * a partially applied migration should surface as a clean sync failure that retries, not as
 * `undefined` reaching the pattern engine months later. Errors are thrown rather than returned,
 * because that is the contract the engine's backoff is built on.
 */

import { z } from 'zod';

import { DIFFICULTY_LEVELS, URGENCY_LEVELS } from '@/domain/logs/bowel';
import { CONTEXT_TYPES } from '@/domain/logs/context';
import { LOG_SOURCES } from '@/domain/logs/source';
import { SYMPTOM_KEYS } from '@/domain/onboarding/options';
import type { SqlDatabase } from '@/services/db/sqlite';
import { getSupabaseClient } from '@/services/supabase/client';
import { keysetFilter, type SyncCursor } from '@/services/sync/cursors';
import type { SyncableRow, SyncEntity } from '@/services/sync/syncEngine';

import {
  applyServerRows as applyBowelRows,
  BOWEL_LOGS_TABLE,
  type BowelLogRow,
} from './bowelRepository';
import {
  applyServerRows as applyContextRows,
  CONTEXT_LOGS_TABLE,
  type ContextLogRow,
} from './contextRepository';
import {
  applyServerRows as applySymptomRows,
  SYMPTOM_LOGS_TABLE,
  type SymptomLogRow,
} from './symptomRepository';
import {
  applyServerRows as applyWellbeingRows,
  WELLBEING_LOGS_TABLE,
  type WellbeingLogRow,
} from './wellbeingRepository';

const BASE_COLUMNS =
  'id, user_id, note, source, occurred_at, occurred_local_date, occurred_tz, ' +
  'occurred_utc_offset_minutes, deleted_at, created_at, updated_at';

const baseRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  note: z.string().nullable(),
  source: z.enum(LOG_SOURCES),
  occurred_at: z.string(),
  occurred_local_date: z.string(),
  occurred_tz: z.string(),
  occurred_utc_offset_minutes: z.number().int(),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

type SimpleLogConfig<TRow extends SyncableRow> = {
  tableName: string;
  columns: string;
  userId: string;
  /** Validates a fetched page. Throws if the shape is not what this version expects. */
  parseRows(data: unknown): TRow[];
  apply(
    db: SqlDatabase,
    rows: TRow[],
    pending: ReadonlySet<string>
  ): Promise<{ applied: number; skipped: number }>;
};

function createSimpleLogEntity<TRow extends SyncableRow>(
  config: SimpleLogConfig<TRow>
): SyncEntity {
  const { tableName, columns, userId } = config;

  return {
    tableName,

    async upsert(payloads: unknown[]): Promise<void> {
      if (payloads.length === 0) return;

      const supabase = getSupabaseClient();

      // Conflict on the device-generated id: a retry after an ambiguous timeout updates the row
      // it already created rather than creating a second one.
      const { error } = await supabase
        .from(tableName)
        .upsert(payloads as TRow[], { onConflict: 'id' });

      if (error) {
        // Identifies the failure, never the row's contents (CLAUDE.md §30).
        throw new Error(`${tableName} upsert failed: ${error.code ?? 'unknown'}`);
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

      // RLS already confines this to the caller's rows; the explicit filter is what lets
      // Postgres use the (user_id, updated_at) index rather than scanning.
      //
      // Ordered by `(updated_at, id)` because `updated_at` is not unique — it is the transaction
      // timestamp, so a batched write gives every row the same one. `id` makes the order total,
      // which is what lets the cursor below advance past a tie group instead of returning it
      // again. See `cursors.ts` for what happens without it.
      let query = supabase
        .from(tableName)
        .select(columns)
        .eq('user_id', userId)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);

      if (cursor !== null) query = query.or(keysetFilter(cursor));

      const { data, error } = await query;
      if (error) throw new Error(`${tableName} fetch failed: ${error.code ?? 'unknown'}`);

      return config.parseRows(data ?? []);
    },

    async apply(
      db: SqlDatabase,
      rows: SyncableRow[],
      pending: ReadonlySet<string>
    ): Promise<{ applied: number; skipped: number }> {
      // Safe narrowing: these are the rows this entity fetched and validated above.
      return config.apply(db, rows as TRow[], pending);
    },
  };
}

/** Builds a parser that reports the table by name when a page does not match. */
function parserFor<TRow>(schema: z.ZodType<TRow>, tableName: string) {
  return (data: unknown): TRow[] => {
    const parsed = z.array(schema).safeParse(data);
    if (!parsed.success) {
      throw new Error(`${tableName} fetch returned rows in an unexpected shape`);
    }
    return parsed.data;
  };
}

const symptomRowSchema = baseRowSchema.extend({
  symptom_type: z.enum(SYMPTOM_KEYS),
  severity: z.number().int().min(1).max(10),
});

const bowelRowSchema = baseRowSchema.extend({
  bristol_type: z.number().int().min(1).max(7),
  urgency: z.enum(URGENCY_LEVELS),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  incomplete: z.boolean(),
});

const contextRowSchema = baseRowSchema.extend({
  context_type: z.enum(CONTEXT_TYPES),
  value_numeric: z.number().int().nullable(),
  value_text: z.string().nullable(),
});

/** Every single-row log type, ready for the engine. */
export function createSimpleLogEntities(userId: string): SyncEntity[] {
  return [
    createSimpleLogEntity<SymptomLogRow>({
      tableName: SYMPTOM_LOGS_TABLE,
      columns: `${BASE_COLUMNS}, symptom_type, severity`,
      userId,
      parseRows: parserFor(
        symptomRowSchema as unknown as z.ZodType<SymptomLogRow>,
        SYMPTOM_LOGS_TABLE
      ),
      apply: applySymptomRows,
    }),

    createSimpleLogEntity<BowelLogRow>({
      tableName: BOWEL_LOGS_TABLE,
      columns: `${BASE_COLUMNS}, bristol_type, urgency, difficulty, incomplete`,
      userId,
      parseRows: parserFor(bowelRowSchema as unknown as z.ZodType<BowelLogRow>, BOWEL_LOGS_TABLE),
      apply: applyBowelRows,
    }),

    createSimpleLogEntity<WellbeingLogRow>({
      tableName: WELLBEING_LOGS_TABLE,
      columns: BASE_COLUMNS,
      userId,
      parseRows: parserFor(
        baseRowSchema as unknown as z.ZodType<WellbeingLogRow>,
        WELLBEING_LOGS_TABLE
      ),
      apply: applyWellbeingRows,
    }),

    createSimpleLogEntity<ContextLogRow>({
      tableName: CONTEXT_LOGS_TABLE,
      columns: `${BASE_COLUMNS}, context_type, value_numeric, value_text`,
      userId,
      parseRows: parserFor(
        contextRowSchema as unknown as z.ZodType<ContextLogRow>,
        CONTEXT_LOGS_TABLE
      ),
      apply: applyContextRows,
    }),
  ];
}
