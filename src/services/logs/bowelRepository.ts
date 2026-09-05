/**
 * Local persistence for bowel movement logs.
 *
 * All the mechanics live in `logRepository`. What is specific here is four columns and the
 * boolean seam: SQLite stores `incomplete` as 1 or 0, while the row is also the wire format sent
 * to Postgres, where the column really is a boolean.
 */

import type { BowelDraft, BowelLog, DifficultyLevel, UrgencyLevel } from '@/domain/logs/bowel';
import type { LogSource } from '@/domain/logs/source';
import type { SqlDatabase } from '@/services/db/sqlite';

import {
  createLogRepository,
  fromBoolean,
  type BaseLogRow,
  type LogDeps,
  type WithSync,
} from './logRepository';

export const BOWEL_LOGS_TABLE = 'bowel_logs';

export type BowelLogWithSync = WithSync<BowelLog>;

export type BowelLogRow = BaseLogRow & {
  bristol_type: number;
  urgency: UrgencyLevel;
  difficulty: DifficultyLevel;
  incomplete: boolean;
};

export function toRow(log: BowelLog): BowelLogRow {
  return {
    id: log.id,
    user_id: log.userId,
    bristol_type: log.bristolType,
    urgency: log.urgency,
    difficulty: log.difficulty,
    incomplete: log.incomplete,
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

export function fromRow(row: BowelLogRow): BowelLog {
  return {
    id: row.id,
    userId: row.user_id,
    bristolType: row.bristol_type,
    urgency: row.urgency,
    difficulty: row.difficulty,
    incomplete: fromBoolean(row.incomplete),
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

const repository = createLogRepository<BowelLog, BowelLogRow, BowelDraft>({
  tableName: BOWEL_LOGS_TABLE,
  specificFields: (draft) => ({
    bristol_type: draft.bristolType,
    urgency: draft.urgency,
    difficulty: draft.difficulty,
    incomplete: draft.incomplete,
  }),
  toRow,
  fromRow,
});

export async function createBowelLog(
  db: SqlDatabase,
  input: { userId: string; draft: BowelDraft; timeZone: string },
  deps: LogDeps
): Promise<BowelLog> {
  return repository.create(db, input, deps);
}

export async function softDeleteBowelLog(
  db: SqlDatabase,
  id: string,
  deps: LogDeps
): Promise<boolean> {
  return repository.softDelete(db, id, deps);
}

export async function getBowelLog(db: SqlDatabase, id: string): Promise<BowelLog | null> {
  return repository.get(db, id);
}

export async function listBowelLogsForLocalDate(
  db: SqlDatabase,
  input: { userId: string; localDate: string }
): Promise<BowelLogWithSync[]> {
  return repository.listForLocalDate(db, input);
}

export async function applyServerRows(
  db: SqlDatabase,
  rows: BowelLogRow[],
  pendingRecordIds: ReadonlySet<string>
): Promise<{ applied: number; skipped: number }> {
  return repository.applyServerRows(db, rows, pendingRecordIds);
}

/** Loads the rows a timeline page asked for, in one query. */
export async function listBowelLogsByIds(
  db: SqlDatabase,
  ids: string[]
): Promise<BowelLogWithSync[]> {
  return repository.listByIds(db, ids);
}

/** Edits an existing entry. Same atomic guarantee as creating one. */
export async function updateBowelLog(
  db: SqlDatabase,
  input: { id: string; draft: BowelDraft; timeZone: string },
  deps: LogDeps
): Promise<BowelLog | null> {
  return repository.update(db, input, deps);
}

/** Every log in a local-date range, oldest first. What the pattern engine reads. */
export async function listBowelLogsBetween(
  db: SqlDatabase,
  input: { userId: string; start: string; end: string }
): Promise<BowelLog[]> {
  return repository.listBetween(db, input);
}
