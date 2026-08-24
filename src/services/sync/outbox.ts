/**
 * The durable outbox (docs/PROJECT_PLAN.md §6, CLAUDE.md §15).
 *
 * Every local write enqueues here **inside the same transaction as the log row itself**, so
 * there is no window in which a log exists but its intent to sync does not. That transaction
 * is the whole defence against T9 — "offline log lost" — and the reason this module takes a
 * `SqlDatabase` it does not own: the caller's transaction must enclose it.
 *
 * Invariant: **an outbox row exists if and only if that record has local changes the server
 * has not confirmed.** A successful push deletes the row; nothing else does. That makes
 * "is this log synced?" a single existence check, with no denormalised status to drift.
 */

import type { SqlDatabase } from '@/services/db/sqlite';
import type { IdGenerator } from '@/utils/id';

import { isDue, nextAttemptAt } from './backoff';

export type OutboxOperation = 'insert' | 'update' | 'delete';
export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'failed';

/** What `coalesceOperation` decides. `drop` means "nothing needs to reach the server". */
export type CoalescedOperation = OutboxOperation | 'drop';

export type OutboxEntry = {
  tableName: string;
  recordId: string;
  operation: OutboxOperation;
  payload: unknown;
};

export type OutboxRow = {
  id: string;
  tableName: string;
  recordId: string;
  operation: OutboxOperation;
  payload: string;
  status: OutboxStatus;
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type OutboxDbRow = {
  id: string;
  table_name: string;
  record_id: string;
  operation: OutboxOperation;
  payload: string;
  status: OutboxStatus;
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Error text is capped hard and never carries the payload.
 *
 * `last_error` is operational data that may be surfaced in a diagnostics view, so it must not
 * become a back door for health content into somewhere it does not belong (CLAUDE.md §29–§30).
 */
const MAX_ERROR_LENGTH = 200;

function toOutboxRow(row: OutboxDbRow): OutboxRow {
  return {
    id: row.id,
    tableName: row.table_name,
    recordId: row.record_id,
    operation: row.operation,
    payload: row.payload,
    status: row.status,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function summariseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Collapses a new intent onto whatever is already queued for the same record.
 *
 * The outbox describes *what the server still needs to be told*, not a history of what the user
 * did. Creating and then deleting a record the server has never seen means it needs to be told
 * nothing at all.
 */
export function coalesceOperation(
  existing: OutboxOperation | null,
  incoming: OutboxOperation
): CoalescedOperation {
  if (existing === null) return incoming;

  // Already tombstoned. Nothing after a delete changes what the server must do.
  if (existing === 'delete') return 'delete';

  if (existing === 'insert') {
    // The server has never seen this record, so creating and destroying it is a no-op.
    if (incoming === 'delete') return 'drop';
    // insert + update is still a single insert, carrying the newer payload.
    return 'insert';
  }

  return incoming === 'delete' ? 'delete' : 'update';
}

/**
 * Queues an intent. **Must be called inside the caller's transaction**, alongside the write it
 * describes.
 */
export async function enqueue(
  db: SqlDatabase,
  entry: OutboxEntry,
  { now, generateId }: { now: Date; generateId: IdGenerator }
): Promise<void> {
  const existing = await db.getFirstAsync<{ id: string; operation: OutboxOperation }>(
    'SELECT id, operation FROM sync_queue WHERE table_name = ? AND record_id = ?',
    entry.tableName,
    entry.recordId
  );

  const resolved = coalesceOperation(existing?.operation ?? null, entry.operation);
  const timestamp = now.toISOString();

  if (resolved === 'drop') {
    if (existing) await db.runAsync('DELETE FROM sync_queue WHERE id = ?', existing.id);
    return;
  }

  const payload = JSON.stringify(entry.payload);

  if (existing) {
    // A fresh intent resets the retry schedule: the previous failure was about older content.
    await db.runAsync(
      `UPDATE sync_queue
          SET operation = ?, payload = ?, status = 'pending', attempt_count = 0,
              last_error = NULL, next_attempt_at = NULL, updated_at = ?
        WHERE id = ?`,
      resolved,
      payload,
      timestamp,
      existing.id
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO sync_queue
       (id, table_name, record_id, operation, payload, status, attempt_count, last_error,
        next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, ?)`,
    generateId(),
    entry.tableName,
    entry.recordId,
    resolved,
    payload,
    timestamp,
    timestamp
  );
}

/**
 * Claims up to `limit` due rows, marking them `syncing` so a second drain cannot pick up the
 * same work. Oldest first, so logs reach the server in the order the user made them.
 */
export async function claimDue(
  db: SqlDatabase,
  { tableName, limit, now }: { tableName: string; limit: number; now: Date }
): Promise<OutboxRow[]> {
  const candidates = await db.getAllAsync<OutboxDbRow>(
    `SELECT * FROM sync_queue
      WHERE table_name = ? AND status IN ('pending', 'failed')
      ORDER BY created_at ASC, rowid ASC
      LIMIT ?`,
    tableName,
    limit
  );

  const due = candidates.filter((row) => isDue(row.next_attempt_at, now));
  if (due.length === 0) return [];

  const placeholders = due.map(() => '?').join(', ');
  await db.runAsync(
    `UPDATE sync_queue SET status = 'syncing', updated_at = ? WHERE id IN (${placeholders})`,
    now.toISOString(),
    ...due.map((row) => row.id)
  );

  // Report the state the row is now in, not the state it was read in.
  return due.map((row) => ({ ...toOutboxRow(row), status: 'syncing' as const }));
}

/**
 * Confirms a push. Deleting the row is what makes "no row means synced" hold. Called only once
 * the server has acknowledged the write — never optimistically.
 */
export async function markSynced(db: SqlDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?', id);
}

/** Records a failure and schedules the next attempt. The row is kept; it is never dropped. */
export async function markFailed(
  db: SqlDatabase,
  row: OutboxRow,
  error: unknown,
  { now, random }: { now: Date; random?: () => number }
): Promise<void> {
  const attempts = row.attemptCount + 1;

  await db.runAsync(
    `UPDATE sync_queue
        SET status = 'failed', attempt_count = ?, last_error = ?, next_attempt_at = ?,
            updated_at = ?
      WHERE id = ?`,
    attempts,
    summariseError(error),
    nextAttemptAt(now, attempts, random),
    now.toISOString(),
    row.id
  );
}

/**
 * Returns rows stranded in `syncing` to `pending`.
 *
 * A crash or force-quit mid-push leaves a row claimed but unfinished. Without this, that user's
 * log would sit in the outbox forever — precisely the silent loss this system exists to
 * prevent. Called once when the engine starts.
 */
export async function recoverStranded(db: SqlDatabase, now: Date): Promise<number> {
  const result = await db.runAsync(
    `UPDATE sync_queue SET status = 'pending', updated_at = ? WHERE status = 'syncing'`,
    now.toISOString()
  );
  return result.changes;
}

/** Whether this record has local changes the server has not confirmed. */
export async function hasPendingChange(
  db: SqlDatabase,
  tableName: string,
  recordId: string
): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sync_queue WHERE table_name = ? AND record_id = ?',
    tableName,
    recordId
  );
  return (row?.count ?? 0) > 0;
}

/** Record ids with unconfirmed local changes — used to protect them during a pull. */
export async function pendingRecordIds(
  db: SqlDatabase,
  tableName: string
): Promise<ReadonlySet<string>> {
  const rows = await db.getAllAsync<{ record_id: string }>(
    'SELECT record_id FROM sync_queue WHERE table_name = ?',
    tableName
  );
  return new Set(rows.map((row) => row.record_id));
}

/** How many records are waiting to reach the server. Drives the timeline's quiet badge. */
export async function pendingCount(db: SqlDatabase, tableName?: string): Promise<number> {
  const row =
    tableName === undefined
      ? await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_queue')
      : await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) AS count FROM sync_queue WHERE table_name = ?',
          tableName
        );

  return row?.count ?? 0;
}
