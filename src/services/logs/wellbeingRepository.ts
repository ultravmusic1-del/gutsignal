/**
 * Local persistence for wellbeing observations.
 *
 * The smallest table in the product, and the one the pattern engine cannot work without: it is
 * the control group. Absence of a symptom log is not evidence of a good day — it could equally
 * mean the user was busy or forgot — so this exists to record that they said so explicitly
 * (spec §44, CLAUDE.md §19).
 */

import type { LogSource } from '@/domain/logs/source';
import type { WellbeingDraft, WellbeingLog } from '@/domain/logs/wellbeing';
import type { SqlDatabase } from '@/services/db/sqlite';

import { createLogRepository, type BaseLogRow, type LogDeps, type WithSync } from './logRepository';

export const WELLBEING_LOGS_TABLE = 'wellbeing_logs';

export type WellbeingLogWithSync = WithSync<WellbeingLog>;

/** No columns beyond the base set. That is the point: one tap, nothing to fill in. */
export type WellbeingLogRow = BaseLogRow;

export function toRow(log: WellbeingLog): WellbeingLogRow {
  return {
    id: log.id,
    user_id: log.userId,
    note: log.note,
    source: log.source,
    occurred_at: log.occurredAt,
    occurred_local_date: log.occurredLocalDate,
    occurred_tz: log.occurredTz,
    occurred_utc_offset_minutes: log.occurredUtcOffsetMinutes,
    deleted_at: log.deletedAt,
    created_at: log.createdAt,
    updated_at: log.updatedAt,
  };
}

export function fromRow(row: WellbeingLogRow): WellbeingLog {
  return {
    id: row.id,
    userId: row.user_id,
    note: row.note,
    source: row.source as LogSource,
    occurredAt: row.occurred_at,
    occurredLocalDate: row.occurred_local_date,
    occurredTz: row.occurred_tz,
    occurredUtcOffsetMinutes: row.occurred_utc_offset_minutes,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const repository = createLogRepository<WellbeingLog, WellbeingLogRow, WellbeingDraft>({
  tableName: WELLBEING_LOGS_TABLE,
  specificFields: () => ({}),
  toRow,
  fromRow,
});

export async function createWellbeingLog(
  db: SqlDatabase,
  input: { userId: string; draft: WellbeingDraft; timeZone: string },
  deps: LogDeps
): Promise<WellbeingLog> {
  return repository.create(db, input, deps);
}

export async function softDeleteWellbeingLog(
  db: SqlDatabase,
  id: string,
  deps: LogDeps
): Promise<boolean> {
  return repository.softDelete(db, id, deps);
}

export async function getWellbeingLog(db: SqlDatabase, id: string): Promise<WellbeingLog | null> {
  return repository.get(db, id);
}

export async function listWellbeingLogsForLocalDate(
  db: SqlDatabase,
  input: { userId: string; localDate: string }
): Promise<WellbeingLogWithSync[]> {
  return repository.listForLocalDate(db, input);
}

export async function applyServerRows(
  db: SqlDatabase,
  rows: WellbeingLogRow[],
  pendingRecordIds: ReadonlySet<string>
): Promise<{ applied: number; skipped: number }> {
  return repository.applyServerRows(db, rows, pendingRecordIds);
}

/** Loads the rows a timeline page asked for, in one query. */
export async function listWellbeingLogsByIds(
  db: SqlDatabase,
  ids: string[]
): Promise<WellbeingLogWithSync[]> {
  return repository.listByIds(db, ids);
}

/** Edits an existing entry. Same atomic guarantee as creating one. */
export async function updateWellbeingLog(
  db: SqlDatabase,
  input: { id: string; draft: WellbeingDraft; timeZone: string },
  deps: LogDeps
): Promise<WellbeingLog | null> {
  return repository.update(db, input, deps);
}
