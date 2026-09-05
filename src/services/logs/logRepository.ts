/**
 * The shared offline write path for single-row event logs.
 *
 * Symptoms, bowel movements, wellbeing and context differ only in which columns they add to a
 * common shape: an id the device generated, four occurrence columns, a note, a source, a
 * tombstone and timestamps. Everything that is easy to get wrong is identical between them —
 * the transaction that binds a log to its outbox row, the tombstone, the last-writer-wins
 * merge, the sync-status join, the local-day filter.
 *
 * So it lives here once. A log type supplies a `LogCodec` describing its own columns and how
 * they map to and from its domain type; this module owns the rest.
 *
 * Meals are not built on this: an aggregate spanning three tables is a genuinely different
 * shape, and bending this to cover it would make both worse (ADR-0034).
 */

import type { LogSource } from '@/domain/logs/source';
import { buildOccurrence, type Occurrence } from '@/domain/time/occurrence';
import type { SqlBindValue, SqlDatabase } from '@/services/db/sqlite';
import { resolveIncoming } from '@/services/sync/merge';
import { enqueue } from '@/services/sync/outbox';
import type { IdGenerator } from '@/utils/id';

/** The columns every single-row event log carries. */
export type BaseLogRow = {
  id: string;
  user_id: string;
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

/** The fields every draft carries. */
export type BaseLogDraft = {
  occurredAt: Date;
  note?: string | undefined;
};

export type LogDeps = {
  now: Date;
  generateId: IdGenerator;
};

/**
 * What a log type must supply to reuse this module.
 *
 * `specificFields` returns exactly the columns beyond the base set, which is what lets the
 * generic build its statements without a positional column list to keep in step.
 */
export type LogCodec<TLog, TRow extends BaseLogRow, TDraft extends BaseLogDraft> = {
  tableName: string;
  specificFields(draft: TDraft): Omit<TRow, keyof BaseLogRow>;
  toRow(log: TLog): TRow;
  fromRow(row: TRow): TLog;
};

export type WithSync<TLog> = TLog & { syncPending: boolean };

/**
 * SQLite has no boolean type, but the row shape is also the wire format sent to Postgres, where
 * the column really is a boolean. So rows carry `true`/`false` and are narrowed to 1/0 on the
 * way into SQLite only — `fromBoolean` reverses it on the way out.
 */
function bind(value: unknown): SqlBindValue {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === undefined) return null;
  return value as SqlBindValue;
}

/** Reads a boolean column back out of SQLite, which stores it as 1 or 0. */
export function fromBoolean(value: unknown): boolean {
  return value === true || value === 1;
}

/**
 * Upserts a row, deriving its columns from the object's own keys.
 *
 * The interpolated names come from our row types, never from user input — the values are always
 * bound as parameters. Deriving the column list rather than restating it is what keeps a new
 * column from being silently dropped on write.
 */
async function upsertRow(
  db: SqlDatabase,
  tableName: string,
  row: Record<string, unknown>
): Promise<void> {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');

  // Identity and creation time are set once and never revised by a later write.
  const updatable = columns.filter(
    (column) => column !== 'id' && column !== 'user_id' && column !== 'created_at'
  );

  await db.runAsync(
    `INSERT INTO ${tableName} (${columns.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (id) DO UPDATE SET
       ${updatable.map((column) => `${column} = excluded.${column}`).join(',\n       ')}`,
    ...columns.map((column) => bind(row[column]))
  );
}

export function createLogRepository<TLog, TRow extends BaseLogRow, TDraft extends BaseLogDraft>(
  codec: LogCodec<TLog, TRow, TDraft>
) {
  const { tableName } = codec;

  function baseRow(args: {
    id: string;
    userId: string;
    draft: TDraft;
    occurrence: Occurrence;
    timestamp: string;
  }): BaseLogRow {
    return {
      id: args.id,
      user_id: args.userId,
      note: args.draft.note ?? null,
      // Only the user's own entries reach these tables. Unconfirmed AI output waits in
      // ai_extraction_candidates until it is confirmed (CLAUDE.md §23).
      source: 'manual',
      occurred_at: args.occurrence.occurredAt,
      occurred_local_date: args.occurrence.occurredLocalDate,
      occurred_tz: args.occurrence.occurredTz,
      occurred_utc_offset_minutes: args.occurrence.occurredUtcOffsetMinutes,
      deleted_at: null,
      created_at: args.timestamp,
      updated_at: args.timestamp,
    };
  }

  async function writeAndQueue(
    db: SqlDatabase,
    row: TRow,
    operation: 'insert' | 'update' | 'delete',
    deps: LogDeps
  ): Promise<void> {
    // The log and its intent to sync commit together, or neither does. This transaction is the
    // whole defence against a log the user can see but the app has forgotten to send (T9).
    await db.withTransactionAsync(async () => {
      await upsertRow(db, tableName, row as unknown as Record<string, unknown>);
      await enqueue(db, { tableName, recordId: row.id, operation, payload: row }, deps);
    });
  }

  async function get(db: SqlDatabase, id: string): Promise<TLog | null> {
    const row = await db.getFirstAsync<TRow>(`SELECT * FROM ${tableName} WHERE id = ?`, id);
    return row === null ? null : codec.fromRow(row);
  }

  async function list(
    db: SqlDatabase,
    where: string,
    params: SqlBindValue[]
  ): Promise<WithSync<TLog>[]> {
    const rows = await db.getAllAsync<TRow & { sync_pending: number }>(
      `SELECT l.*, (q.id IS NOT NULL) AS sync_pending
         FROM ${tableName} l
         LEFT JOIN sync_queue q ON q.table_name = ? AND q.record_id = l.id
        ${where}`,
      tableName,
      ...params
    );

    return rows.map((row) => ({
      ...codec.fromRow(row),
      syncPending: row.sync_pending === 1,
    }));
  }

  return {
    tableName,

    /** Writes a new log and queues it for sync, atomically. */
    async create(
      db: SqlDatabase,
      { userId, draft, timeZone }: { userId: string; draft: TDraft; timeZone: string },
      deps: LogDeps
    ): Promise<TLog> {
      const row = {
        ...baseRow({
          id: deps.generateId(),
          userId,
          draft,
          occurrence: buildOccurrence(draft.occurredAt, timeZone),
          timestamp: deps.now.toISOString(),
        }),
        ...codec.specificFields(draft),
      } as TRow;

      await writeAndQueue(db, row, 'insert', deps);
      return codec.fromRow(row);
    },

    /** Edits an existing log. Same atomic guarantee as creation. */
    async update(
      db: SqlDatabase,
      { id, draft, timeZone }: { id: string; draft: TDraft; timeZone: string },
      deps: LogDeps
    ): Promise<TLog | null> {
      const existing = await get(db, id);
      if (existing === null) return null;

      const row = {
        ...codec.toRow(existing),
        note: draft.note ?? null,
        ...buildOccurrenceColumns(draft.occurredAt, timeZone),
        ...codec.specificFields(draft),
        updated_at: deps.now.toISOString(),
      } as TRow;

      await writeAndQueue(db, row, 'update', deps);
      return codec.fromRow(row);
    },

    /**
     * Tombstones a log rather than removing the row, so the deletion replicates instead of
     * looking to another device like a row that never arrived.
     */
    async softDelete(db: SqlDatabase, id: string, deps: LogDeps): Promise<boolean> {
      const existing = await get(db, id);
      if (existing === null) return false;

      const timestamp = deps.now.toISOString();
      const row = {
        ...codec.toRow(existing),
        deleted_at: timestamp,
        updated_at: timestamp,
      } as TRow;

      await writeAndQueue(db, row, 'delete', deps);
      return true;
    },

    get,

    /**
     * Logs for one of the user's calendar days.
     *
     * Filters on `occurred_local_date`, never the UTC date — an evening entry in a western zone
     * belongs to the day the user experienced it (risk R-02).
     */
    async listForLocalDate(
      db: SqlDatabase,
      { userId, localDate }: { userId: string; localDate: string }
    ): Promise<WithSync<TLog>[]> {
      return list(
        db,
        `WHERE l.user_id = ? AND l.occurred_local_date = ? AND l.deleted_at IS NULL
         ORDER BY l.occurred_at DESC`,
        [userId, localDate]
      );
    },

    /**
     * Loads exactly the rows a timeline page asked for.
     *
     * The timeline decides *which* entries appear by querying across every log table at once;
     * this fills in the detail for one type in a single query, never one query per row.
     */
    async listByIds(db: SqlDatabase, ids: string[]): Promise<WithSync<TLog>[]> {
      if (ids.length === 0) return [];

      const placeholders = ids.map(() => '?').join(', ');
      return list(db, `WHERE l.id IN (${placeholders})`, ids);
    },

    /**
     * Every log in a local-date range, oldest first.
     *
     * What the pattern engine reads. Tombstoned rows are excluded here as well as in the engine
     * — a deleted log is one the user took back, and it should not travel any further than it
     * has to.
     */
    async listBetween(
      db: SqlDatabase,
      { userId, start, end }: { userId: string; start: string; end: string }
    ): Promise<TLog[]> {
      const rows = await db.getAllAsync<TRow>(
        `SELECT * FROM ${tableName}
          WHERE user_id = ? AND deleted_at IS NULL
            AND occurred_local_date >= ? AND occurred_local_date <= ?
          ORDER BY occurred_at ASC`,
        userId,
        start,
        end
      );

      return rows.map(codec.fromRow);
    },

    /** Most recent logs, newest first. */
    async listRecent(
      db: SqlDatabase,
      { userId, limit }: { userId: string; limit: number }
    ): Promise<WithSync<TLog>[]> {
      return list(
        db,
        `WHERE l.user_id = ? AND l.deleted_at IS NULL
         ORDER BY l.occurred_at DESC
         LIMIT ?`,
        [userId, limit]
      );
    },

    /**
     * Merges rows arriving from the server, honouring unpushed local changes.
     *
     * Applies what it can and reports the rest rather than abandoning a whole page because one
     * row lost a race.
     */
    async applyServerRows(
      db: SqlDatabase,
      rows: TRow[],
      pendingRecordIds: ReadonlySet<string>
    ): Promise<{ applied: number; skipped: number }> {
      let applied = 0;
      let skipped = 0;

      for (const row of rows) {
        const local = await db.getFirstAsync<{ id: string; updated_at: string }>(
          `SELECT id, updated_at FROM ${tableName} WHERE id = ?`,
          row.id
        );

        const decision = resolveIncoming({
          remote: { id: row.id, updatedAt: row.updated_at },
          local: local === null ? null : { id: local.id, updatedAt: local.updated_at },
          hasPendingLocalChange: pendingRecordIds.has(row.id),
        });

        if (decision === 'apply_remote') {
          await upsertRow(db, tableName, row as unknown as Record<string, unknown>);
          applied += 1;
        } else {
          skipped += 1;
        }
      }

      return { applied, skipped };
    },
  };
}

/** The four occurrence columns, for rebuilding a row on edit. */
function buildOccurrenceColumns(
  occurredAt: Date,
  timeZone: string
): Pick<
  BaseLogRow,
  'occurred_at' | 'occurred_local_date' | 'occurred_tz' | 'occurred_utc_offset_minutes'
> {
  const occurrence = buildOccurrence(occurredAt, timeZone);

  return {
    occurred_at: occurrence.occurredAt,
    occurred_local_date: occurrence.occurredLocalDate,
    occurred_tz: occurrence.occurredTz,
    occurred_utc_offset_minutes: occurrence.occurredUtcOffsetMinutes,
  };
}
