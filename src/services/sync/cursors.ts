/**
 * Pull watermarks.
 *
 * One row per synced table, holding the newest server `updated_at` this device has seen. The
 * next pull asks for everything at or after it.
 *
 * Deliberately `>=` rather than `>`: two rows can share a timestamp, and re-applying a row the
 * device already has is free — `applyServerRows` is idempotent — while missing one would be a
 * silent hole in the user's history.
 */

import type { SqlDatabase } from '@/services/db/sqlite';

export async function readCursor(db: SqlDatabase, tableName: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ cursor: string | null }>(
    'SELECT cursor FROM sync_cursors WHERE table_name = ?',
    tableName
  );
  return row?.cursor ?? null;
}

export async function writeCursor(
  db: SqlDatabase,
  tableName: string,
  cursor: string,
  now: Date
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_cursors (table_name, cursor, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT (table_name) DO UPDATE SET cursor = excluded.cursor,
                                            updated_at = excluded.updated_at`,
    tableName,
    cursor,
    now.toISOString()
  );
}

/** Clears every watermark, so the next pull refetches from the beginning. Used on sign-out. */
export async function clearCursors(db: SqlDatabase): Promise<void> {
  await db.execAsync('DELETE FROM sync_cursors');
}
