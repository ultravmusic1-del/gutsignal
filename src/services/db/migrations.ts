/**
 * Local (on-device) SQLite migrations.
 *
 * These are SEPARATE from the Supabase/Postgres migrations in `supabase/migrations/`. This
 * database is the offline-first write target and cache: the UI reads from here, and a durable
 * outbox row is written in the same transaction as every user log so a dropped connection can
 * never lose an entry (docs/PROJECT_PLAN.md §6).
 *
 * Rules:
 *  - Migrations are append-only. Never edit a shipped migration; add a new one.
 *  - `version` is a contiguous integer sequence starting at 1 (asserted by a test).
 *  - Each migration's SQL must be idempotent-safe to re-run after a crash mid-batch, hence
 *    `IF NOT EXISTS` throughout.
 */

export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'sync_infrastructure',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        name        TEXT    NOT NULL,
        applied_at  TEXT    NOT NULL
      );

      -- Durable outbox. One row per pending write, drained by the sync engine (Milestone 5).
      -- record_id is the device-generated UUID, which is also the Postgres primary key, so a
      -- retry after an ambiguous failure upserts rather than duplicating.
      CREATE TABLE IF NOT EXISTS sync_queue (
        id            TEXT    PRIMARY KEY,
        table_name    TEXT    NOT NULL,
        record_id     TEXT    NOT NULL,
        operation     TEXT    NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
        payload       TEXT    NOT NULL,
        status        TEXT    NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'syncing', 'synced', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error    TEXT,
        created_at    TEXT    NOT NULL,
        updated_at    TEXT    NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sync_queue_status
        ON sync_queue (status, created_at);

      CREATE INDEX IF NOT EXISTS idx_sync_queue_record
        ON sync_queue (table_name, record_id);
    `,
  },
  {
    version: 2,
    name: 'symptom_logs',
    sql: `
      -- Local mirror of public.symptom_logs. Same shape as Postgres so a row can be upserted
      -- without translation, and so the UI can read entirely from here while offline.
      CREATE TABLE IF NOT EXISTS symptom_logs (
        id                          TEXT    PRIMARY KEY,
        user_id                     TEXT    NOT NULL,
        symptom_type                TEXT    NOT NULL,
        severity                    INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 10),
        note                        TEXT,
        source                      TEXT    NOT NULL DEFAULT 'manual'
                                            CHECK (source IN ('manual', 'ai_confirmed',
                                                              'healthkit', 'imported')),
        occurred_at                 TEXT    NOT NULL,
        occurred_local_date         TEXT    NOT NULL,
        occurred_tz                 TEXT    NOT NULL,
        occurred_utc_offset_minutes INTEGER NOT NULL,
        deleted_at                  TEXT,
        created_at                  TEXT    NOT NULL,
        updated_at                  TEXT    NOT NULL
      );

      -- Timeline pagination.
      CREATE INDEX IF NOT EXISTS idx_symptom_logs_occurred
        ON symptom_logs (user_id, occurred_at DESC);

      -- Day grouping reads occurred_local_date, never the UTC date (docs/PROJECT_PLAN.md 4.2).
      CREATE INDEX IF NOT EXISTS idx_symptom_logs_local_date
        ON symptom_logs (user_id, occurred_local_date);

      -- One row per table, holding the server updated_at watermark the next pull resumes from.
      CREATE TABLE IF NOT EXISTS sync_cursors (
        table_name TEXT PRIMARY KEY,
        cursor     TEXT,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 3,
    name: 'outbox_backoff',
    sql: `
      -- When a failed row may next be attempted. NULL means "now".
      -- ALTER TABLE ADD COLUMN has no IF NOT EXISTS in SQLite, so unlike the other migrations
      -- this one is not re-runnable on its own. It does not need to be: the runner applies a
      -- migration and records its version inside one transaction, and SQLite DDL is
      -- transactional, so a crash mid-migration rolls the column back with it.
      ALTER TABLE sync_queue ADD COLUMN next_attempt_at TEXT;

      CREATE INDEX IF NOT EXISTS idx_sync_queue_due
        ON sync_queue (status, next_attempt_at);

      -- One outbox row per record: an entry exists if and only if that record has local changes
      -- the server has not confirmed. Enqueuing again coalesces onto this row rather than
      -- queuing a second upload of the same log.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_unique_record
        ON sync_queue (table_name, record_id);
    `,
  },
];

/** Migrations that still need to run, in order. Pure — the unit under test. */
export function pendingMigrations(
  currentVersion: number,
  all: Migration[] = MIGRATIONS
): Migration[] {
  return all.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);
}

/** Highest version defined in code. */
export function targetVersion(all: Migration[] = MIGRATIONS): number {
  return all.reduce((max, m) => Math.max(max, m.version), 0);
}
