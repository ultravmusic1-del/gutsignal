/**
 * The Supabase side of symptom sync, packaged as a `SyncEntity`.
 *
 * This is the only place symptom logs meet the network. Rows arriving from the server are
 * validated before they are allowed anywhere near local storage (CLAUDE.md §11): a partially
 * applied migration or a schema change should surface as a clean sync failure that retries,
 * not as `undefined` reaching the pattern engine months later.
 *
 * Errors are thrown rather than returned, because that is the contract the engine's retry and
 * backoff logic is built on.
 */

import { z } from 'zod';

import { LOG_SOURCES } from '@/domain/logs/source';
import { SYMPTOM_KEYS } from '@/domain/onboarding/options';
import type { SqlDatabase } from '@/services/db/sqlite';
import { getSupabaseClient } from '@/services/supabase/client';
import type { SyncableRow, SyncEntity } from '@/services/sync/syncEngine';

import { applyServerRows, SYMPTOM_LOGS_TABLE, type SymptomLogRow } from './symptomRepository';

const COLUMNS =
  'id, user_id, symptom_type, severity, note, source, occurred_at, occurred_local_date, ' +
  'occurred_tz, occurred_utc_offset_minutes, deleted_at, created_at, updated_at';

const symptomLogRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  symptom_type: z.enum(SYMPTOM_KEYS),
  severity: z.number().int().min(1).max(10),
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

export function createSymptomSyncEntity(userId: string): SyncEntity {
  return {
    tableName: SYMPTOM_LOGS_TABLE,

    async upsert(payloads: unknown[]): Promise<void> {
      if (payloads.length === 0) return;

      const supabase = getSupabaseClient();

      // Conflict on the device-generated id: a retry after an ambiguous timeout updates the
      // row it already created rather than creating a second one.
      const { error } = await supabase
        .from('symptom_logs')
        .upsert(payloads as SymptomLogRow[], { onConflict: 'id' });

      if (error) {
        // The message identifies the failure, never the row's contents (CLAUDE.md §30).
        throw new Error(`symptom_logs upsert failed: ${error.code ?? 'unknown'}`);
      }
    },

    async fetchChangedSince({
      cursor,
      limit,
    }: {
      cursor: string | null;
      limit: number;
    }): Promise<SyncableRow[]> {
      const supabase = getSupabaseClient();

      // RLS already confines this to the caller's rows; the explicit filter is what lets
      // Postgres use the (user_id, updated_at) index rather than scanning.
      let query = supabase
        .from('symptom_logs')
        .select(COLUMNS)
        .eq('user_id', userId)
        .order('updated_at', { ascending: true })
        .limit(limit);

      if (cursor !== null) query = query.gte('updated_at', cursor);

      const { data, error } = await query;

      if (error) throw new Error(`symptom_logs fetch failed: ${error.code ?? 'unknown'}`);

      const parsed = z.array(symptomLogRowSchema).safeParse(data ?? []);
      if (!parsed.success) {
        throw new Error('symptom_logs fetch returned rows in an unexpected shape');
      }

      return parsed.data;
    },

    async apply(
      db: SqlDatabase,
      rows: SyncableRow[],
      pending: ReadonlySet<string>
    ): Promise<{ applied: number; skipped: number }> {
      // Safe narrowing: these are the rows this entity fetched and validated above.
      return applyServerRows(db, rows as SymptomLogRow[], pending);
    },
  };
}
