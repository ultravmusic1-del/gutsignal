/**
 * @jest-environment node
 *
 * The real migration set, applied to a real SQL engine.
 *
 * Node 24 ships `node:sqlite`, so the SQL that will run on a user's phone can be executed here
 * on Windows. A typo in a CREATE TABLE now fails in CI rather than on first launch on a device.
 */
import { MIGRATIONS } from '../migrations';
import { getSchemaVersion, migrate } from '../migrator';
import { createTestDatabase, type TestDatabase } from '../nodeSqlite.testing';

let db: TestDatabase;

beforeEach(() => {
  db = createTestDatabase();
});

afterEach(() => {
  db.close();
});

async function tableNames(): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
  );
  return rows.map((row) => row.name);
}

async function columnNames(table: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((row) => row.name);
}

describe('migrate', () => {
  it('applies every shipped migration to an empty database', async () => {
    await migrate(db);

    expect(await getSchemaVersion(db)).toBe(MIGRATIONS.length);
    expect(await tableNames()).toEqual(
      expect.arrayContaining(['schema_migrations', 'symptom_logs', 'sync_cursors', 'sync_queue'])
    );
  });

  it('is idempotent — a second run applies nothing and changes nothing', async () => {
    await migrate(db);
    const first = await getSchemaVersion(db);

    await migrate(db);

    expect(await getSchemaVersion(db)).toBe(first);
  });

  it('resumes a partially migrated database without redoing applied work', async () => {
    await migrate(db, MIGRATIONS.slice(0, 1));
    expect(await getSchemaVersion(db)).toBe(1);
    expect(await tableNames()).not.toContain('symptom_logs');

    await migrate(db);

    expect(await getSchemaVersion(db)).toBe(MIGRATIONS.length);
    expect(await tableNames()).toContain('symptom_logs');
  });

  it('rolls back a failing migration rather than leaving the schema half-applied', async () => {
    await migrate(db, MIGRATIONS.slice(0, 1));

    const broken = [
      ...MIGRATIONS.slice(0, 1),
      {
        version: 2,
        name: 'broken',
        sql: `
          CREATE TABLE IF NOT EXISTS half_applied (id TEXT PRIMARY KEY);
          THIS IS NOT SQL;
        `,
      },
    ];

    await expect(migrate(db, broken)).rejects.toThrow();

    expect(await getSchemaVersion(db)).toBe(1);
    expect(await tableNames()).not.toContain('half_applied');
  });

  it('gives the outbox its backoff column and the log table its occurrence columns', async () => {
    await migrate(db);

    expect(await columnNames('sync_queue')).toContain('next_attempt_at');
    expect(await columnNames('symptom_logs')).toEqual(
      expect.arrayContaining([
        'occurred_at',
        'occurred_local_date',
        'occurred_tz',
        'occurred_utc_offset_minutes',
        'deleted_at',
      ])
    );
  });
});

describe('the shipped schema constraints', () => {
  beforeEach(async () => {
    await migrate(db);
  });

  it('refuses a severity outside the 1–10 scale', async () => {
    const insert = (severity: number) =>
      db.runAsync(
        `INSERT INTO symptom_logs (id, user_id, symptom_type, severity, occurred_at,
           occurred_local_date, occurred_tz, occurred_utc_offset_minutes, created_at, updated_at)
         VALUES (?, 'u1', 'bloating', ?, '2026-08-24T12:00:00.000Z', '2026-08-24', 'UTC', 0,
                 '2026-08-24T12:00:00.000Z', '2026-08-24T12:00:00.000Z')`,
        `id-${severity}`,
        severity
      );

    await expect(insert(0)).rejects.toThrow();
    await expect(insert(11)).rejects.toThrow();
    await expect(insert(1)).resolves.toBeDefined();
    await expect(insert(10)).resolves.toBeDefined();
  });

  it('refuses an unknown source', async () => {
    await expect(
      db.runAsync(
        `INSERT INTO symptom_logs (id, user_id, symptom_type, severity, source, occurred_at,
           occurred_local_date, occurred_tz, occurred_utc_offset_minutes, created_at, updated_at)
         VALUES ('x', 'u1', 'bloating', 5, 'guessed', '2026-08-24T12:00:00.000Z', '2026-08-24',
                 'UTC', 0, '2026-08-24T12:00:00.000Z', '2026-08-24T12:00:00.000Z')`
      )
    ).rejects.toThrow();
  });

  it('allows only one outbox row per record', async () => {
    const insert = (id: string) =>
      db.runAsync(
        `INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at,
           updated_at)
         VALUES (?, 'symptom_logs', 'record-1', 'insert', '{}', '2026-08-24T12:00:00.000Z',
                 '2026-08-24T12:00:00.000Z')`,
        id
      );

    await expect(insert('outbox-1')).resolves.toBeDefined();
    await expect(insert('outbox-2')).rejects.toThrow();
  });
});
