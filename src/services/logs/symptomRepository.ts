/**
 * Local persistence for symptom logs (docs/PROJECT_PLAN.md §6).
 *
 * SQLite is not a cache here — it is *the* source the UI reads from. A log is written locally
 * and its outbox row is written in the same transaction, so the write either fully happened or
 * did not happen at all. There is no state in which a user sees their log but the app has
 * forgotten to send it.
 *
 * Nothing in this module touches the network, and nothing in it imports a native module, which
 * is what lets the whole write path be tested against a real SQL engine.
 */

import { buildOccurrence } from '@/domain/time/occurrence';
import type { LogSource, SymptomDraft, SymptomLog } from '@/domain/logs/symptom';
import type { SymptomKey } from '@/domain/onboarding/options';
import type { SqlDatabase } from '@/services/db/sqlite';
import { enqueue } from '@/services/sync/outbox';
import { resolveIncoming } from '@/services/sync/merge';
import type { IdGenerator } from '@/utils/id';

export const SYMPTOM_LOGS_TABLE = 'symptom_logs';

/** A symptom log plus whether the server has confirmed it yet. Drives the quiet sync badge. */
export type SymptomLogWithSync = SymptomLog & { syncPending: boolean };

/** The row shape shared by SQLite and Postgres. Column names are identical in both. */
export type SymptomLogRow = {
  id: string;
  user_id: string;
  symptom_type: SymptomKey;
  severity: number;
  note: string | null;
  source: LogSource;
  occurred_at: string;
  occurred_local_date: string;
  occurred_tz: string;
  occurred_utc_offset_minutes: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type Deps = {
  now: Date;
  generateId: IdGenerator;
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
    source: row.source,
    occurredAt: row.occurred_at,
    occurredLocalDate: row.occurred_local_date,
    occurredTz: row.occurred_tz,
    occurredUtcOffsetMinutes: row.occurred_utc_offset_minutes,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const UPSERT_SQL = `
  INSERT INTO symptom_logs
    (id, user_id, symptom_type, severity, note, source, occurred_at, occurred_local_date,
     occurred_tz, occurred_utc_offset_minutes, deleted_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (id) DO UPDATE SET
    symptom_type                = excluded.symptom_type,
    severity                    = excluded.severity,
    note                        = excluded.note,
    source                      = excluded.source,
    occurred_at                 = excluded.occurred_at,
    occurred_local_date         = excluded.occurred_local_date,
    occurred_tz                 = excluded.occurred_tz,
    occurred_utc_offset_minutes = excluded.occurred_utc_offset_minutes,
    deleted_at                  = excluded.deleted_at,
    updated_at                  = excluded.updated_at
`;

async function upsertRow(db: SqlDatabase, row: SymptomLogRow): Promise<void> {
  await db.runAsync(
    UPSERT_SQL,
    row.id,
    row.user_id,
    row.symptom_type,
    row.severity,
    row.note,
    row.source,
    row.occurred_at,
    row.occurred_local_date,
    row.occurred_tz,
    row.occurred_utc_offset_minutes,
    row.deleted_at,
    row.created_at,
    row.updated_at
  );
}

/**
 * Writes a new symptom log and queues it for sync, atomically.
 *
 * The id is generated here, on the device, before anything is persisted — that is what makes
 * the eventual server upsert idempotent (§4.1).
 */
export async function createSymptomLog(
  db: SqlDatabase,
  { userId, draft, timeZone }: { userId: string; draft: SymptomDraft; timeZone: string },
  { now, generateId }: Deps
): Promise<SymptomLog> {
  const timestamp = now.toISOString();

  const log: SymptomLog = {
    id: generateId(),
    userId,
    symptomType: draft.symptomType,
    severity: draft.severity,
    note: draft.note ?? null,
    source: 'manual',
    ...buildOccurrence(draft.occurredAt, timeZone),
    deletedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const row = toRow(log);

  await db.withTransactionAsync(async () => {
    await upsertRow(db, row);
    await enqueue(
      db,
      { tableName: SYMPTOM_LOGS_TABLE, recordId: log.id, operation: 'insert', payload: row },
      { now, generateId }
    );
  });

  return log;
}

/** Edits an existing log. Same atomic guarantee as creation. */
export async function updateSymptomLog(
  db: SqlDatabase,
  { id, draft, timeZone }: { id: string; draft: SymptomDraft; timeZone: string },
  { now, generateId }: Deps
): Promise<SymptomLog | null> {
  const existing = await getSymptomLog(db, id);
  if (existing === null) return null;

  const updated: SymptomLog = {
    ...existing,
    symptomType: draft.symptomType,
    severity: draft.severity,
    note: draft.note ?? null,
    ...buildOccurrence(draft.occurredAt, timeZone),
    updatedAt: now.toISOString(),
  };

  const row = toRow(updated);

  await db.withTransactionAsync(async () => {
    await upsertRow(db, row);
    await enqueue(
      db,
      { tableName: SYMPTOM_LOGS_TABLE, recordId: id, operation: 'update', payload: row },
      { now, generateId }
    );
  });

  return updated;
}

/**
 * Tombstones a log rather than removing the row.
 *
 * A hard delete would look to another device like a row that simply never arrived. The
 * tombstone is what lets the deletion itself replicate (§4.1).
 */
export async function softDeleteSymptomLog(
  db: SqlDatabase,
  id: string,
  { now, generateId }: Deps
): Promise<boolean> {
  const existing = await getSymptomLog(db, id);
  if (existing === null) return false;

  const timestamp = now.toISOString();
  const row = toRow({ ...existing, deletedAt: timestamp, updatedAt: timestamp });

  await db.withTransactionAsync(async () => {
    await upsertRow(db, row);
    await enqueue(
      db,
      { tableName: SYMPTOM_LOGS_TABLE, recordId: id, operation: 'delete', payload: row },
      { now, generateId }
    );
  });

  return true;
}

export async function getSymptomLog(db: SqlDatabase, id: string): Promise<SymptomLog | null> {
  const row = await db.getFirstAsync<SymptomLogRow>('SELECT * FROM symptom_logs WHERE id = ?', id);
  return row === null ? null : fromRow(row);
}

type JoinedRow = SymptomLogRow & { sync_pending: number };

function fromJoinedRow(row: JoinedRow): SymptomLogWithSync {
  return { ...fromRow(row), syncPending: row.sync_pending === 1 };
}

const SELECT_WITH_SYNC = `
  SELECT l.*, (q.id IS NOT NULL) AS sync_pending
    FROM symptom_logs l
    LEFT JOIN sync_queue q
      ON q.table_name = 'symptom_logs' AND q.record_id = l.id
`;

/**
 * Logs for one of the user's calendar days.
 *
 * Filters on `occurred_local_date`, never on the UTC date — an evening log in a western zone
 * belongs to the day the user experienced it (§4.2, risk R-02).
 */
export async function listSymptomLogsForLocalDate(
  db: SqlDatabase,
  { userId, localDate }: { userId: string; localDate: string }
): Promise<SymptomLogWithSync[]> {
  const rows = await db.getAllAsync<JoinedRow>(
    `${SELECT_WITH_SYNC}
     WHERE l.user_id = ? AND l.occurred_local_date = ? AND l.deleted_at IS NULL
     ORDER BY l.occurred_at DESC`,
    userId,
    localDate
  );

  return rows.map(fromJoinedRow);
}

/** Most recent logs, newest first. The timeline in M6 will paginate over this. */
export async function listRecentSymptomLogs(
  db: SqlDatabase,
  { userId, limit }: { userId: string; limit: number }
): Promise<SymptomLogWithSync[]> {
  const rows = await db.getAllAsync<JoinedRow>(
    `${SELECT_WITH_SYNC}
     WHERE l.user_id = ? AND l.deleted_at IS NULL
     ORDER BY l.occurred_at DESC
     LIMIT ?`,
    userId,
    limit
  );

  return rows.map(fromJoinedRow);
}

/**
 * Merges rows arriving from the server.
 *
 * Rows with unpushed local changes are left alone — see `resolveIncoming`. This is deliberately
 * not a transaction per row: applying what it can and reporting the rest is better than
 * abandoning a whole page because one row lost a race.
 */
export async function applyServerRows(
  db: SqlDatabase,
  rows: SymptomLogRow[],
  pendingRecordIds: ReadonlySet<string>
): Promise<{ applied: number; skipped: number }> {
  let applied = 0;
  let skipped = 0;

  for (const row of rows) {
    const local = await db.getFirstAsync<{ id: string; updated_at: string }>(
      'SELECT id, updated_at FROM symptom_logs WHERE id = ?',
      row.id
    );

    const decision = resolveIncoming({
      remote: { id: row.id, updatedAt: row.updated_at },
      local: local === null ? null : { id: local.id, updatedAt: local.updated_at },
      hasPendingLocalChange: pendingRecordIds.has(row.id),
    });

    if (decision === 'apply_remote') {
      await upsertRow(db, row);
      applied += 1;
    } else {
      skipped += 1;
    }
  }

  return { applied, skipped };
}
