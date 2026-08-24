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
