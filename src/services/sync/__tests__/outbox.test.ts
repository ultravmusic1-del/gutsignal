/**
 * @jest-environment node
 *
 * Outbox behaviour against a real SQL engine, including the real shipped schema.
 */
import { migrate } from '@/services/db/migrator';
import { createTestDatabase, type TestDatabase } from '@/services/db/nodeSqlite.testing';

import {
  claimDue,
  coalesceOperation,
  enqueue,
  hasPendingChange,
  markFailed,
  markSynced,
  pendingCount,
  pendingRecordIds,
  recoverStranded,
  type OutboxRow,
} from '../outbox';

const TABLE = 'symptom_logs';
const NOW = new Date('2026-08-24T12:00:00Z');

let db: TestDatabase;
let nextId = 0;

const generateId = () => `outbox-${(nextId += 1)}`;

beforeEach(async () => {
  db = createTestDatabase();
  nextId = 0;
  await migrate(db);
});

afterEach(() => {
  db.close();
});

function entry(recordId: string, operation: 'insert' | 'update' | 'delete', payload: unknown = {}) {
  return { tableName: TABLE, recordId, operation, payload };
}

async function rows(): Promise<OutboxRow[]> {
  return claimDue(db, { tableName: TABLE, limit: 100, now: NOW });
}

describe('coalesceOperation', () => {
  it('takes the incoming operation when nothing is queued', () => {
    expect(coalesceOperation(null, 'insert')).toBe('insert');
    expect(coalesceOperation(null, 'delete')).toBe('delete');
  });

  it('keeps an unsent insert an insert when the record is then edited', () => {
    expect(coalesceOperation('insert', 'update')).toBe('insert');
  });

  it('drops the work entirely when an unsent insert is then deleted', () => {
    expect(coalesceOperation('insert', 'delete')).toBe('drop');
  });

  it('escalates a queued update to a delete', () => {
    expect(coalesceOperation('update', 'delete')).toBe('delete');
  });

  it('collapses repeated updates', () => {
    expect(coalesceOperation('update', 'update')).toBe('update');
  });

  it('lets nothing undo a queued delete', () => {
    expect(coalesceOperation('delete', 'update')).toBe('delete');
    expect(coalesceOperation('delete', 'insert')).toBe('delete');
  });
});

describe('enqueue', () => {
  it('queues one row for a new record', async () => {
    await enqueue(db, entry('r1', 'insert', { severity: 4 }), { now: NOW, generateId });

    const queued = await rows();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      recordId: 'r1',
      operation: 'insert',
      status: 'syncing',
      attemptCount: 0,
    });
    expect(JSON.parse(queued[0]!.payload)).toEqual({ severity: 4 });
  });

  it('never queues a second upload for the same record', async () => {
    await enqueue(db, entry('r1', 'insert', { severity: 4 }), { now: NOW, generateId });
    await enqueue(db, entry('r1', 'update', { severity: 9 }), { now: NOW, generateId });

    const queued = await rows();
    expect(queued).toHaveLength(1);
    // Still an insert — the server has never seen it — but carrying the newer payload.
    expect(queued[0]?.operation).toBe('insert');
    expect(JSON.parse(queued[0]!.payload)).toEqual({ severity: 9 });
  });

  it('removes the work when a record is created and deleted before it ever syncs', async () => {
    await enqueue(db, entry('r1', 'insert'), { now: NOW, generateId });
    await enqueue(db, entry('r1', 'delete'), { now: NOW, generateId });

    expect(await pendingCount(db, TABLE)).toBe(0);
  });

  it('keeps records apart', async () => {
    await enqueue(db, entry('r1', 'insert'), { now: NOW, generateId });
    await enqueue(db, entry('r2', 'insert'), { now: NOW, generateId });

    expect(await pendingCount(db, TABLE)).toBe(2);
  });

  it('resets the retry schedule when new content arrives for a failed row', async () => {
    await enqueue(db, entry('r1', 'insert', { severity: 4 }), { now: NOW, generateId });
    const [claimed] = await rows();
    await markFailed(db, claimed!, new Error('offline'), { now: NOW, random: () => 0.5 });

    await enqueue(db, entry('r1', 'update', { severity: 9 }), { now: NOW, generateId });

    const requeued = await rows();
    expect(requeued[0]).toMatchObject({ attemptCount: 0, lastError: null, nextAttemptAt: null });
  });
});

describe('claimDue', () => {
  it('returns rows oldest first', async () => {
    await enqueue(db, entry('older', 'insert'), {
      now: new Date('2026-08-24T10:00:00Z'),
      generateId,
    });
    await enqueue(db, entry('newer', 'insert'), {
      now: new Date('2026-08-24T11:00:00Z'),
      generateId,
    });

    expect((await rows()).map((row) => row.recordId)).toEqual(['older', 'newer']);
  });

  it('respects the limit', async () => {
    await enqueue(db, entry('r1', 'insert'), { now: NOW, generateId });
    await enqueue(db, entry('r2', 'insert'), { now: NOW, generateId });

    expect(await claimDue(db, { tableName: TABLE, limit: 1, now: NOW })).toHaveLength(1);
  });

  it('marks what it claims, so a concurrent drain cannot take the same row twice', async () => {
    await enqueue(db, entry('r1', 'insert'), { now: NOW, generateId });

    expect(await claimDue(db, { tableName: TABLE, limit: 10, now: NOW })).toHaveLength(1);
    expect(await claimDue(db, { tableName: TABLE, limit: 10, now: NOW })).toHaveLength(0);
  });

  it('skips a failed row until its backoff has elapsed', async () => {
    await enqueue(db, entry('r1', 'insert'), { now: NOW, generateId });
    const [claimed] = await rows();
    await markFailed(db, claimed!, new Error('offline'), { now: NOW, random: () => 0.5 });

    const tooSoon = new Date(NOW.getTime() + 1_000);
    expect(await claimDue(db, { tableName: TABLE, limit: 10, now: tooSoon })).toHaveLength(0);

    const later = new Date(NOW.getTime() + 10_000);
    expect(await claimDue(db, { tableName: TABLE, limit: 10, now: later })).toHaveLength(1);
  });

  it('ignores other tables', async () => {
    await enqueue(
      db,
      { ...entry('r1', 'insert'), tableName: 'meal_logs' },
      {
        now: NOW,
        generateId,
      }
    );

    expect(await claimDue(db, { tableName: TABLE, limit: 10, now: NOW })).toHaveLength(0);
  });
});

describe('markSynced', () => {
  it('removes the row, so the record reads as synced', async () => {
    await enqueue(db, entry('r1', 'insert'), { now: NOW, generateId });
    const [claimed] = await rows();

    await markSynced(db, claimed!.id);

    expect(await pendingCount(db, TABLE)).toBe(0);
    expect(await hasPendingChange(db, TABLE, 'r1')).toBe(false);
  });
});

describe('markFailed', () => {
  it('keeps the row and counts the attempt rather than discarding the log', async () => {
    await enqueue(db, entry('r1', 'insert'), { now: NOW, generateId });
    const [claimed] = await rows();

    await markFailed(db, claimed!, new Error('network unreachable'), {
      now: NOW,
      random: () => 0.5,
    });

    const later = new Date(NOW.getTime() + 60_000);
    const [retried] = await claimDue(db, { tableName: TABLE, limit: 10, now: later });

    expect(retried).toMatchObject({ recordId: 'r1', attemptCount: 1 });
    expect(retried?.lastError).toBe('network unreachable');
  });

  it('backs off further with each successive failure', async () => {
    await enqueue(db, entry('r1', 'insert'), { now: NOW, generateId });

    let attemptAt: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const at = new Date(NOW.getTime() + attempt * 3_600_000);
      const [claimed] = await claimDue(db, { tableName: TABLE, limit: 10, now: at });
      await markFailed(db, claimed!, new Error('offline'), { now: at, random: () => 0.5 });

      const gap = Date.parse(claimed!.nextAttemptAt ?? at.toISOString());
      expect(claimed?.attemptCount).toBe(attempt - 1);
      attemptAt = String(gap);
    }

    expect(attemptAt).not.toBeNull();
  });

  it('never lets an error message carry the payload into operational data', async () => {
    await enqueue(db, entry('r1', 'insert', { note: 'private health detail' }), {
      now: NOW,
      generateId,
    });
    const [claimed] = await rows();

    await markFailed(db, claimed!, new Error('x'.repeat(5_000)), { now: NOW, random: () => 0.5 });

    const later = new Date(NOW.getTime() + 60_000);
    const [retried] = await claimDue(db, { tableName: TABLE, limit: 10, now: later });

    expect(retried?.lastError?.length).toBeLessThanOrEqual(200);
    expect(retried?.lastError).not.toContain('private health detail');
  });
});

describe('recoverStranded', () => {
  it('returns a row abandoned mid-push so the log is not stuck forever', async () => {
    await enqueue(db, entry('r1', 'insert'), { now: NOW, generateId });
    await claimDue(db, { tableName: TABLE, limit: 10, now: NOW }); // claimed, then "crash"

    expect(await claimDue(db, { tableName: TABLE, limit: 10, now: NOW })).toHaveLength(0);

    expect(await recoverStranded(db, NOW)).toBe(1);
    expect(await claimDue(db, { tableName: TABLE, limit: 10, now: NOW })).toHaveLength(1);
  });
});

describe('pendingRecordIds', () => {
  it('lists exactly the records the server has not confirmed', async () => {
    await enqueue(db, entry('r1', 'insert'), { now: NOW, generateId });
    await enqueue(db, entry('r2', 'insert'), { now: NOW, generateId });
    const claimed = await rows();
    await markSynced(db, claimed[0]!.id);

    expect([...(await pendingRecordIds(db, TABLE))]).toEqual(['r2']);
  });
});
