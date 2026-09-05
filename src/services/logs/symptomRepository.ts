/**
 * Local persistence for symptom logs.
 *
 * The mechanics — the transaction binding a log to its outbox row, tombstones, the
 * last-writer-wins merge, the sync-status join, the local-day filter — live in `logRepository`,
 * shared with every other single-row log type. What is specific to symptoms is only the two
 * columns below and how they map to the domain type.
 *
 * Nothing here touches the network or imports a native module, which is what lets the whole
 * write path be tested against a real SQL engine.
 */

import type { LogSource } from '@/domain/logs/source';
import type { SymptomDraft, SymptomLog } from '@/domain/logs/symptom';
import type { SymptomKey } from '@/domain/onboarding/options';
import type { SqlDatabase } from '@/services/db/sqlite';

import { createLogRepository, type BaseLogRow, type LogDeps, type WithSync } from './logRepository';

export const SYMPTOM_LOGS_TABLE = 'symptom_logs';

/** A symptom log plus whether the server has confirmed it yet. Drives the quiet sync badge. */
export type SymptomLogWithSync = WithSync<SymptomLog>;

/** The row shape shared by SQLite and Postgres. Column names are identical in both. */
export type SymptomLogRow = BaseLogRow & {
  symptom_type: SymptomKey;
  severity: number;
};

export function toRow(log: SymptomLog): SymptomLogRow {
  return {
    id: log.id,
    user_id: log.userId,
    symptom_type: log.symptomType,
    severity: log.severity,
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

export function fromRow(row: SymptomLogRow): SymptomLog {
  return {
    id: row.id,
    userId: row.user_id,
    symptomType: row.symptom_type,
    severity: row.severity,
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

const repository = createLogRepository<SymptomLog, SymptomLogRow, SymptomDraft>({
  tableName: SYMPTOM_LOGS_TABLE,
  specificFields: (draft) => ({ symptom_type: draft.symptomType, severity: draft.severity }),
  toRow,
  fromRow,
});

export async function createSymptomLog(
  db: SqlDatabase,
  input: { userId: string; draft: SymptomDraft; timeZone: string },
  deps: LogDeps
): Promise<SymptomLog> {
  return repository.create(db, input, deps);
}

export async function updateSymptomLog(
  db: SqlDatabase,
  input: { id: string; draft: SymptomDraft; timeZone: string },
  deps: LogDeps
): Promise<SymptomLog | null> {
  return repository.update(db, input, deps);
}

export async function softDeleteSymptomLog(
  db: SqlDatabase,
  id: string,
  deps: LogDeps
): Promise<boolean> {
  return repository.softDelete(db, id, deps);
}

export async function getSymptomLog(db: SqlDatabase, id: string): Promise<SymptomLog | null> {
  return repository.get(db, id);
}

export async function listSymptomLogsForLocalDate(
  db: SqlDatabase,
  input: { userId: string; localDate: string }
): Promise<SymptomLogWithSync[]> {
  return repository.listForLocalDate(db, input);
}

export async function listRecentSymptomLogs(
  db: SqlDatabase,
  input: { userId: string; limit: number }
): Promise<SymptomLogWithSync[]> {
  return repository.listRecent(db, input);
}

export async function applyServerRows(
  db: SqlDatabase,
  rows: SymptomLogRow[],
  pendingRecordIds: ReadonlySet<string>
): Promise<{ applied: number; skipped: number }> {
  return repository.applyServerRows(db, rows, pendingRecordIds);
}

/** Loads the rows a timeline page asked for, in one query. */
export async function listSymptomLogsByIds(
  db: SqlDatabase,
  ids: string[]
): Promise<SymptomLogWithSync[]> {
  return repository.listByIds(db, ids);
}
