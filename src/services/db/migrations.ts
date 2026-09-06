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
  {
    version: 4,
    name: 'meal_logs',
    sql: `
      -- A meal is an aggregate: the occasion, what was eaten, and how it is described.
      CREATE TABLE IF NOT EXISTS meal_logs (
        id                          TEXT    PRIMARY KEY,
        user_id                     TEXT    NOT NULL,
        title                       TEXT    NOT NULL,
        meal_size                   TEXT    NOT NULL
                                            CHECK (meal_size IN ('small', 'medium', 'large')),
        note                        TEXT,
        source                      TEXT    NOT NULL DEFAULT 'manual'
                                            CHECK (source IN ('manual', 'ai_confirmed',
                                                              'healthkit', 'imported')),
        photo_asset_id              TEXT,
        occurred_at                 TEXT    NOT NULL,
        occurred_local_date         TEXT    NOT NULL,
        occurred_tz                 TEXT    NOT NULL,
        occurred_utc_offset_minutes INTEGER NOT NULL,
        deleted_at                  TEXT,
        created_at                  TEXT    NOT NULL,
        updated_at                  TEXT    NOT NULL,

        -- Needed as the target of the children's composite foreign key, which is what keeps a
        -- meal's items owned by the same user as the meal itself.
        UNIQUE (id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_meal_logs_occurred
        ON meal_logs (user_id, occurred_at DESC);

      CREATE INDEX IF NOT EXISTS idx_meal_logs_local_date
        ON meal_logs (user_id, occurred_local_date);

      -- What was eaten. Normalised rather than a blob because the engine's central question
      -- ("what happened after coffee?") becomes a join once factor_catalog lands at M8.
      CREATE TABLE IF NOT EXISTS meal_items (
        id                  TEXT    PRIMARY KEY,
        meal_id             TEXT    NOT NULL,
        user_id             TEXT    NOT NULL,
        -- The user's own words. Never overwritten; normalisation adds alongside it.
        raw_name            TEXT    NOT NULL,
        canonical_factor_id TEXT,
        confidence          REAL,
        user_confirmed      INTEGER NOT NULL DEFAULT 0,
        position            INTEGER NOT NULL DEFAULT 0,

        FOREIGN KEY (meal_id, user_id) REFERENCES meal_logs (id, user_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON meal_items (meal_id);

      -- Exposure lookup for the pattern engine (docs/PROJECT_PLAN.md 4.5).
      CREATE INDEX IF NOT EXISTS idx_meal_items_factor
        ON meal_items (user_id, canonical_factor_id);

      CREATE TABLE IF NOT EXISTS meal_tags (
        meal_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        tag     TEXT NOT NULL,

        PRIMARY KEY (meal_id, tag),
        FOREIGN KEY (meal_id, user_id) REFERENCES meal_logs (id, user_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_meal_tags_tag ON meal_tags (user_id, tag);
    `,
  },
  {
    version: 5,
    name: 'bowel_wellbeing_context_logs',
    sql: `
      CREATE TABLE IF NOT EXISTS bowel_logs (
        id                          TEXT    PRIMARY KEY,
        user_id                     TEXT    NOT NULL,
        bristol_type                INTEGER NOT NULL CHECK (bristol_type BETWEEN 1 AND 7),
        urgency                     TEXT    NOT NULL
                                            CHECK (urgency IN ('none','low','moderate','high')),
        difficulty                  TEXT    NOT NULL
                                            CHECK (difficulty IN ('easy','moderate','difficult')),
        incomplete                  INTEGER NOT NULL DEFAULT 0,
        note                        TEXT,
        source                      TEXT    NOT NULL DEFAULT 'manual'
                                            CHECK (source IN ('manual','ai_confirmed',
                                                              'healthkit','imported')),
        occurred_at                 TEXT    NOT NULL,
        occurred_local_date         TEXT    NOT NULL,
        occurred_tz                 TEXT    NOT NULL,
        occurred_utc_offset_minutes INTEGER NOT NULL,
        deleted_at                  TEXT,
        created_at                  TEXT    NOT NULL,
        updated_at                  TEXT    NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_bowel_logs_occurred
        ON bowel_logs (user_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bowel_logs_local_date
        ON bowel_logs (user_id, occurred_local_date);

      -- The control group. Never inferred from missing symptom logs (spec 44).
      CREATE TABLE IF NOT EXISTS wellbeing_logs (
        id                          TEXT    PRIMARY KEY,
        user_id                     TEXT    NOT NULL,
        note                        TEXT,
        source                      TEXT    NOT NULL DEFAULT 'manual'
                                            CHECK (source IN ('manual','ai_confirmed',
                                                              'healthkit','imported')),
        occurred_at                 TEXT    NOT NULL,
        occurred_local_date         TEXT    NOT NULL,
        occurred_tz                 TEXT    NOT NULL,
        occurred_utc_offset_minutes INTEGER NOT NULL,
        deleted_at                  TEXT,
        created_at                  TEXT    NOT NULL,
        updated_at                  TEXT    NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_wellbeing_logs_occurred
        ON wellbeing_logs (user_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_wellbeing_logs_local_date
        ON wellbeing_logs (user_id, occurred_local_date);

      CREATE TABLE IF NOT EXISTS context_logs (
        id                          TEXT    PRIMARY KEY,
        user_id                     TEXT    NOT NULL,
        context_type                TEXT    NOT NULL
                                            CHECK (context_type IN ('stress','sleep_quality',
                                                                    'exercise')),
        value_numeric               INTEGER CHECK (value_numeric IS NULL
                                                   OR value_numeric BETWEEN 1 AND 5),
        value_text                  TEXT    CHECK (value_text IS NULL
                                                   OR value_text IN ('none','light','moderate',
                                                                     'intense')),
        note                        TEXT,
        source                      TEXT    NOT NULL DEFAULT 'manual'
                                            CHECK (source IN ('manual','ai_confirmed',
                                                              'healthkit','imported')),
        occurred_at                 TEXT    NOT NULL,
        occurred_local_date         TEXT    NOT NULL,
        occurred_tz                 TEXT    NOT NULL,
        occurred_utc_offset_minutes INTEGER NOT NULL,
        deleted_at                  TEXT,
        created_at                  TEXT    NOT NULL,
        updated_at                  TEXT    NOT NULL,

        -- Scaled types carry a number; exercise carries a level. Exactly one, never both.
        CHECK (
          (context_type IN ('stress','sleep_quality')
             AND value_numeric IS NOT NULL AND value_text IS NULL)
          OR (context_type = 'exercise'
             AND value_text IS NOT NULL AND value_numeric IS NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_context_logs_occurred
        ON context_logs (user_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_context_logs_local_date
        ON context_logs (user_id, occurred_local_date, context_type);
    `,
  },
  {
    version: 6,
    name: 'notification_preferences',
    sql: `
      -- When GutSignal may interrupt someone (spec §74-75).
      --
      -- Local only, and deliberately not in the outbox. A reminder is scheduled with this
      -- device's OS against this device's clock, so it is a property of the phone rather than of
      -- the account: syncing it would mean a tablet silently rescheduling a phone. It is also the
      -- one table here that holds no health information at all.
      --
      -- Times are stored as separate hour and minute integers rather than as 'HH:MM'. They are
      -- wall-clock values that go straight to the OS scheduler as numbers, and a text column
      -- would only add a parse step that can fail.
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id                 TEXT    PRIMARY KEY,

        morning_check_in        INTEGER NOT NULL CHECK (morning_check_in IN (0, 1)),
        evening_check_in        INTEGER NOT NULL CHECK (evening_check_in IN (0, 1)),
        weekly_review           INTEGER NOT NULL CHECK (weekly_review IN (0, 1)),

        morning_hour            INTEGER NOT NULL CHECK (morning_hour BETWEEN 0 AND 23),
        morning_minute          INTEGER NOT NULL CHECK (morning_minute BETWEEN 0 AND 59),
        evening_hour            INTEGER NOT NULL CHECK (evening_hour BETWEEN 0 AND 23),
        evening_minute          INTEGER NOT NULL CHECK (evening_minute BETWEEN 0 AND 59),

        -- 1 = Sunday, matching expo-notifications' numbering rather than JavaScript's.
        weekly_weekday          INTEGER NOT NULL CHECK (weekly_weekday BETWEEN 1 AND 7),
        weekly_hour             INTEGER NOT NULL CHECK (weekly_hour BETWEEN 0 AND 23),
        weekly_minute           INTEGER NOT NULL CHECK (weekly_minute BETWEEN 0 AND 59),

        quiet_hours_enabled     INTEGER NOT NULL CHECK (quiet_hours_enabled IN (0, 1)),
        quiet_from_hour         INTEGER NOT NULL CHECK (quiet_from_hour BETWEEN 0 AND 23),
        quiet_from_minute       INTEGER NOT NULL CHECK (quiet_from_minute BETWEEN 0 AND 59),
        quiet_until_hour        INTEGER NOT NULL CHECK (quiet_until_hour BETWEEN 0 AND 23),
        quiet_until_minute      INTEGER NOT NULL CHECK (quiet_until_minute BETWEEN 0 AND 59),

        created_at              TEXT    NOT NULL,
        updated_at              TEXT    NOT NULL
      );
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
