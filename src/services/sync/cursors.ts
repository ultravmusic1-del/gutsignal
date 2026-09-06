/**
 * Pull watermarks.
 *
 * One row per synced table, marking the last server row this device has applied. The next pull
 * asks for everything strictly after it.
 *
 * ## Why the cursor is a pair, not a timestamp
 *
 * `updated_at` alone is not unique, and it is not *nearly* unique. It is written by a trigger
 * using `now()`, which in Postgres is the transaction timestamp — identical for every row a
 * transaction touches. A batched `upsert_meals`, a restore, or any future data migration that
 * does `UPDATE symptom_logs SET ...` stamps hundreds of rows with one value.
 *
 * Ordering by `updated_at` alone leaves the order within a tie unspecified, so a page boundary
 * landing inside a tie group can return the same rows on the next page. When a tie group is
 * larger than one page the pull cannot get past it at all: the cursor is rewritten to the same
 * timestamp it already held, and that entity stops syncing — permanently, silently, and without
 * any error to notice.
 *
 * `(updated_at, id)` makes the order total, so every page strictly advances. `id` is a UUID the
 * device generated, unique per row, which is exactly the tiebreaker this needs.
 *
 * This is the same lesson as ADR-0037, where the timeline's keyset needed an `id` tiebreaker for
 * the same reason. It was learned there and not carried across to sync.
 */

import type { SqlDatabase } from '@/services/db/sqlite';

/** Where a pull got to: the last row applied, in `(updated_at, id)` order. */
export type SyncCursor = {
  updatedAt: string;
  id: string;
};

/**
 * Reads the watermark, tolerating the timestamp-only format written before keyset paging.
 *
 * A legacy cursor becomes `{ updatedAt, id: '' }`. Every real id sorts after the empty string, so
 * the first keyset pull re-fetches that whole timestamp's rows — which is correct rather than
 * merely safe: those are precisely the rows an old cursor may have skipped. Re-applying is free,
 * because `applyServerRows` is idempotent and respects pending local edits.
 */
export async function readCursor(db: SqlDatabase, tableName: string): Promise<SyncCursor | null> {
  const row = await db.getFirstAsync<{ cursor: string | null }>(
    'SELECT cursor FROM sync_cursors WHERE table_name = ?',
    tableName
  );

  const raw = row?.cursor ?? null;
  if (raw === null || raw === '') return null;

  return parseCursor(raw);
}

export function parseCursor(raw: string): SyncCursor {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'updatedAt' in parsed &&
      typeof (parsed as { updatedAt: unknown }).updatedAt === 'string'
    ) {
      const { updatedAt, id } = parsed as { updatedAt: string; id?: unknown };
      return { updatedAt, id: typeof id === 'string' ? id : '' };
    }
  } catch {
    // Not JSON: the pre-keyset format, which was the bare timestamp.
  }

  return { updatedAt: raw, id: '' };
}

export function serialiseCursor(cursor: SyncCursor): string {
  return JSON.stringify(cursor);
}

/**
 * `(updated_at, id) > (cursor.updatedAt, cursor.id)`, in the form PostgREST accepts.
 *
 * PostgREST has no row-value comparison, so the pair is written out longhand. Values are
 * double-quoted because a timestamp contains `:` and `+`, which the filter grammar would
 * otherwise read as syntax.
 *
 * A legacy cursor carries no id, and asking for `id > ""` would lean on how PostgREST treats an
 * empty quoted value. The timestamp comparison simply becomes inclusive instead, which re-fetches
 * that whole tie group — the correct thing to do, since those are exactly the rows a
 * timestamp-only cursor may have skipped.
 */
export function keysetFilter(cursor: SyncCursor): string {
  const at = `"${cursor.updatedAt}"`;

  if (cursor.id === '') return `updated_at.gte.${at}`;

  return `updated_at.gt.${at},and(updated_at.eq.${at},id.gt."${cursor.id}")`;
}

export async function writeCursor(
  db: SqlDatabase,
  tableName: string,
  cursor: SyncCursor,
  now: Date
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_cursors (table_name, cursor, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT (table_name) DO UPDATE SET cursor = excluded.cursor,
                                            updated_at = excluded.updated_at`,
    tableName,
    serialiseCursor(cursor),
    now.toISOString()
  );
}

/** Clears every watermark, so the next pull refetches from the beginning. Used on sign-out. */
export async function clearCursors(db: SqlDatabase): Promise<void> {
  await db.execAsync('DELETE FROM sync_cursors');
}
