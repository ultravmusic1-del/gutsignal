/**
 * @jest-environment node
 *
 * The offline write path, against a real SQL engine and the real shipped schema.
 */
import type { SymptomDraft } from '@/domain/logs/symptom';
import { migrate } from '@/services/db/migrator';
import { createTestDatabase, type TestDatabase } from '@/services/db/nodeSqlite.testing';
import type { SqlBindValue, SqlDatabase } from '@/services/db/sqlite';
import { markSynced, pendingCount, pendingRecordIds } from '@/services/sync/outbox';

import {
  applyServerRows,
  createSymptomLog,
  getSymptomLog,
  listRecentSymptomLogs,
  listSymptomLogsForLocalDate,
  softDeleteSymptomLog,
  toRow,
  updateSymptomLog,
  type SymptomLogRow,
} from '../symptomRepository';

const USER = 'user-1';
const NOW = new Date('2026-08-24T12:00:00Z');

let db: TestDatabase;
let counter = 0;
const generateId = () => `id-${(counter += 1)}`;
const deps = { now: NOW, generateId };

beforeEach(async () => {
  db = createTestDatabase();
  counter = 0;
  await migrate(db);
});

afterEach(() => {
  db.close();
});

function draft(overrides: Partial<SymptomDraft> = {}): SymptomDraft {
  return {
    symptomType: 'bloating',
    severity: 6,
    occurredAt: new Date('2026-08-24T11:00:00Z'),
    note: undefined,
    ...overrides,
  };
}

/** A database that fails any statement touching `fragment`, to simulate a crash mid-write. */
function failingOn(source: TestDatabase, fragment: string): SqlDatabase {
  return {
    ...source,
    runAsync: async (sql: string, ...params: SqlBindValue[]) => {
      if (sql.includes(fragment)) throw new Error('simulated crash');
      return source.runAsync(sql, ...params);
    },
  };
}

async function countLogs(): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM symptom_logs'
  );
  return row?.count ?? 0;
}

describe('createSymptomLog', () => {
  it('writes the log and returns it with a device-generated id', async () => {
    const log = await createSymptomLog(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    expect(log.id).toBe('id-1');
    expect(log).toMatchObject({ userId: USER, symptomType: 'bloating', severity: 6, note: null });
    expect(await getSymptomLog(db, log.id)).toEqual(log);
  });

  it('queues exactly one outbox row alongside it', async () => {
    const log = await createSymptomLog(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    expect(await pendingCount(db, 'symptom_logs')).toBe(1);
    expect([...(await pendingRecordIds(db, 'symptom_logs'))]).toEqual([log.id]);
  });

  it('writes the log and its outbox row atomically — neither survives alone', async () => {
    // This is the guarantee the whole offline design rests on (threat T9). If the outbox write
    // fails, the log must not exist either, or the app would show the user an entry it has
    // silently forgotten to send.
    const crashing = failingOn(db, 'sync_queue');

    await expect(
      createSymptomLog(crashing, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps)
    ).rejects.toThrow('simulated crash');

    expect(await countLogs()).toBe(0);
    expect(await pendingCount(db, 'symptom_logs')).toBe(0);
  });

  it('records the note when there is one', async () => {
    const log = await createSymptomLog(
      db,
      { userId: USER, draft: draft({ note: 'after lunch' }), timeZone: 'UTC' },
      deps
    );

    expect(log.note).toBe('after lunch');
  });

  it('marks the entry as manually recorded, never as AI-derived', async () => {
    const log = await createSymptomLog(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    expect(log.source).toBe('manual');
  });
});

describe('createSymptomLog — occurrence', () => {
  it('stores the local calendar day, not the UTC day', async () => {
    const log = await createSymptomLog(
      db,
      {
        userId: USER,
        draft: draft({ occurredAt: new Date('2026-08-24T02:00:00Z') }),
        timeZone: 'America/New_York',
      },
      deps
    );

    expect(log.occurredLocalDate).toBe('2026-08-23');
    expect(log.occurredTz).toBe('America/New_York');
    expect(log.occurredUtcOffsetMinutes).toBe(-240);
  });
});

describe('listSymptomLogsForLocalDate', () => {
  it('finds a late-evening log under the day the user actually lived it', async () => {
    const log = await createSymptomLog(
      db,
      {
        userId: USER,
        draft: draft({ occurredAt: new Date('2026-08-24T02:00:00Z') }),
        timeZone: 'America/New_York',
      },
      deps
    );

    const onLocalDay = await listSymptomLogsForLocalDate(db, {
      userId: USER,
      localDate: '2026-08-23',
    });
    const onUtcDay = await listSymptomLogsForLocalDate(db, {
      userId: USER,
      localDate: '2026-08-24',
    });

    expect(onLocalDay.map((entry) => entry.id)).toEqual([log.id]);
    expect(onUtcDay).toEqual([]);
  });

  it('never returns another user’s logs', async () => {
    await createSymptomLog(db, { userId: 'other-user', draft: draft(), timeZone: 'UTC' }, deps);

    expect(
      await listSymptomLogsForLocalDate(db, { userId: USER, localDate: '2026-08-24' })
    ).toEqual([]);
  });

  it('orders newest first within the day', async () => {
    const morning = await createSymptomLog(
      db,
      {
        userId: USER,
        draft: draft({ occurredAt: new Date('2026-08-24T08:00:00Z') }),
        timeZone: 'UTC',
      },
      deps
    );
    const evening = await createSymptomLog(
      db,
      {
        userId: USER,
        draft: draft({ occurredAt: new Date('2026-08-24T20:00:00Z') }),
        timeZone: 'UTC',
      },
      deps
    );

    const entries = await listSymptomLogsForLocalDate(db, {
      userId: USER,
      localDate: '2026-08-24',
    });

    expect(entries.map((entry) => entry.id)).toEqual([evening.id, morning.id]);
  });
});

describe('sync status', () => {
  it('reports a log as pending until the server confirms it', async () => {
    const log = await createSymptomLog(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    const [beforeSync] = await listRecentSymptomLogs(db, { userId: USER, limit: 10 });
    expect(beforeSync?.syncPending).toBe(true);

    const queued = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM sync_queue WHERE record_id = ?',
      log.id
    );
    await markSynced(db, queued!.id);

    const [afterSync] = await listRecentSymptomLogs(db, { userId: USER, limit: 10 });
    expect(afterSync?.syncPending).toBe(false);
  });
});

describe('updateSymptomLog', () => {
  it('edits the log without queuing a second upload', async () => {
    const log = await createSymptomLog(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    const updated = await updateSymptomLog(
      db,
      { id: log.id, draft: draft({ severity: 9 }), timeZone: 'UTC' },
      { now: new Date('2026-08-24T13:00:00Z'), generateId }
    );

    expect(updated?.severity).toBe(9);
    expect(await pendingCount(db, 'symptom_logs')).toBe(1);
  });

  it('returns null for a log that does not exist', async () => {
    expect(
      await updateSymptomLog(db, { id: 'missing', draft: draft(), timeZone: 'UTC' }, deps)
    ).toBeNull();
  });
});

describe('softDeleteSymptomLog', () => {
  it('tombstones rather than removing, so the deletion can replicate', async () => {
    const log = await createSymptomLog(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    expect(await softDeleteSymptomLog(db, log.id, deps)).toBe(true);

    expect(await countLogs()).toBe(1);
    expect((await getSymptomLog(db, log.id))?.deletedAt).not.toBeNull();
    expect(await listRecentSymptomLogs(db, { userId: USER, limit: 10 })).toEqual([]);
  });

  it('cancels the upload entirely if the log never reached the server', async () => {
    const log = await createSymptomLog(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    await softDeleteSymptomLog(db, log.id, deps);

    // Created and deleted while offline: the server was never told, so there is nothing to tell.
    expect(await pendingCount(db, 'symptom_logs')).toBe(0);
  });
});

describe('applyServerRows', () => {
  function serverRow(overrides: Partial<SymptomLogRow> = {}): SymptomLogRow {
    return {
      id: 'remote-1',
      user_id: USER,
      symptom_type: 'cramping',
      severity: 3,
      note: null,
      source: 'manual',
      occurred_at: '2026-08-24T09:00:00.000Z',
      occurred_local_date: '2026-08-24',
      occurred_tz: 'UTC',
      occurred_utc_offset_minutes: 0,
      deleted_at: null,
      created_at: '2026-08-24T09:00:00.000Z',
      updated_at: '2026-08-24T09:00:00.000Z',
      ...overrides,
    };
  }

  it('inserts a row the device has never seen — a reinstall restores history', async () => {
    const result = await applyServerRows(db, [serverRow()], new Set());

    expect(result).toEqual({ applied: 1, skipped: 0 });
    expect((await getSymptomLog(db, 'remote-1'))?.symptomType).toBe('cramping');
  });

  it('is idempotent — applying the same row twice changes nothing', async () => {
    await applyServerRows(db, [serverRow()], new Set());
    await applyServerRows(db, [serverRow()], new Set());

    expect(await countLogs()).toBe(1);
  });

  it('applies a newer server version over an older local one', async () => {
    await applyServerRows(db, [serverRow()], new Set());

    await applyServerRows(
      db,
      [serverRow({ severity: 8, updated_at: '2026-08-24T10:00:00.000Z' })],
      new Set()
    );

    expect((await getSymptomLog(db, 'remote-1'))?.severity).toBe(8);
  });

  it('refuses to overwrite an edit that has not been pushed yet', async () => {
    const log = await createSymptomLog(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    const result = await applyServerRows(
      db,
      [serverRow({ id: log.id, severity: 1, updated_at: '2099-01-01T00:00:00.000Z' })],
      await pendingRecordIds(db, 'symptom_logs')
    );

    expect(result).toEqual({ applied: 0, skipped: 1 });
    expect((await getSymptomLog(db, log.id))?.severity).toBe(6);
  });

  it('replicates a deletion made on another device', async () => {
    await applyServerRows(db, [serverRow()], new Set());

    await applyServerRows(
      db,
      [
        serverRow({
          deleted_at: '2026-08-24T11:00:00.000Z',
          updated_at: '2026-08-24T11:00:00.000Z',
        }),
      ],
      new Set()
    );

    expect(await listRecentSymptomLogs(db, { userId: USER, limit: 10 })).toEqual([]);
    expect(await countLogs()).toBe(1); // tombstoned, not vanished
  });

  it('round-trips a locally created log through the server row shape', async () => {
    const log = await createSymptomLog(db, { userId: USER, draft: draft(), timeZone: 'UTC' }, deps);

    await applyServerRows(db, [toRow(log)], new Set());

    expect(await getSymptomLog(db, log.id)).toEqual(log);
  });
});
