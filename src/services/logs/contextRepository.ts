/**
 * Local persistence for context observations.
 *
 * Stress, sleep and exercise. The engine reads these mainly as **confounders**: coffee and short
 * sleep travel together, and without the sleep observation it would happily attribute their
 * combined effect to coffee alone (spec §60).
 */

import type { ContextDraft, ContextLog, ContextType } from '@/domain/logs/context';
import type { LogSource } from '@/domain/logs/source';
import type { SqlDatabase } from '@/services/db/sqlite';

import { createLogRepository, type BaseLogRow, type LogDeps, type WithSync } from './logRepository';

export const CONTEXT_LOGS_TABLE = 'context_logs';

export type ContextLogWithSync = WithSync<ContextLog>;

export type ContextLogRow = BaseLogRow & {
  context_type: ContextType;
  value_numeric: number | null;
  value_text: string | null;
};

export function toRow(log: ContextLog): ContextLogRow {
  return {
    id: log.id,
    user_id: log.userId,
    context_type: log.contextType,
    value_numeric: log.valueNumeric,
    value_text: log.valueText,
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

export function fromRow(row: ContextLogRow): ContextLog {
  return {
    id: row.id,
    userId: row.user_id,
    contextType: row.context_type,
    valueNumeric: row.value_numeric,
    valueText: row.value_text,
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

const repository = createLogRepository<ContextLog, ContextLogRow, ContextDraft>({
  tableName: CONTEXT_LOGS_TABLE,
  specificFields: (draft) => ({
    context_type: draft.contextType,
    value_numeric: draft.valueNumeric,
    value_text: draft.valueText,
  }),
  toRow,
  fromRow,
});

export async function createContextLog(
  db: SqlDatabase,
  input: { userId: string; draft: ContextDraft; timeZone: string },
  deps: LogDeps
): Promise<ContextLog> {
  return repository.create(db, input, deps);
}

export async function softDeleteContextLog(
  db: SqlDatabase,
  id: string,
  deps: LogDeps
): Promise<boolean> {
  return repository.softDelete(db, id, deps);
}

export async function getContextLog(db: SqlDatabase, id: string): Promise<ContextLog | null> {
  return repository.get(db, id);
}

export async function listContextLogsForLocalDate(
  db: SqlDatabase,
  input: { userId: string; localDate: string }
): Promise<ContextLogWithSync[]> {
  return repository.listForLocalDate(db, input);
}

export async function applyServerRows(
  db: SqlDatabase,
  rows: ContextLogRow[],
  pendingRecordIds: ReadonlySet<string>
): Promise<{ applied: number; skipped: number }> {
  return repository.applyServerRows(db, rows, pendingRecordIds);
}
