/**
 * @jest-environment node
 *
 * The sync engine, driven against a real local database and a fake server.
 */
import type { SymptomDraft } from '@/domain/logs/symptom';
import { migrate } from '@/services/db/migrator';
import { createTestDatabase, type TestDatabase } from '@/services/db/nodeSqlite.testing';
import {
  createSymptomLog,
  getSymptomLog,
  listRecentSymptomLogs,
  softDeleteSymptomLog,
  type SymptomLogRow,
} from '@/services/logs/symptomRepository';

import { readCursor } from '../cursors';
import type { NetworkMonitor } from '../network';
import { claimDue, pendingCount } from '../outbox';
import { applyServerRows } from '@/services/logs/symptomRepository';

import { createSyncEngine, type SyncableRow, type SyncEntity } from '../syncEngine';

const USER = 'user-1';
const NOW = new Date('2026-08-24T12:00:00Z');

let db: TestDatabase;
let counter = 0;
const generateId = () => `id-${(counter += 1)}`;

/** A server that remembers what it was told, and can be made to misbehave. */
class FakeRemote {
  rows = new Map<string, SymptomLogRow>();
  upsertCalls: SymptomLogRow[][] = [];
  failEntireUpsert = 0;
  rejectIds = new Set<string>();

  async upsert(payloads: unknown[]): Promise<void> {
    const rows = payloads as SymptomLogRow[];
    this.upsertCalls.push(rows);

    if (this.failEntireUpsert > 0) {
      this.failEntireUpsert -= 1;
      throw new Error('network unreachable');
    }

    if (rows.some((row) => this.rejectIds.has(row.id))) {
      throw new Error('rejected by server');
    }

    for (const row of rows) this.rows.set(row.id, row);
  }

  async fetchChangedSince({
    cursor,
    limit,
  }: {
    cursor: string | null;
    limit: number;
  }): Promise<SyncableRow[]> {
    return [...this.rows.values()]
      .filter((row) => cursor === null || row.updated_at >= cursor)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .slice(0, limit);
  }
}

const online: NetworkMonitor = { isConnected: async () => true, subscribe: () => () => {} };
const offline: NetworkMonitor = { isConnected: async () => false, subscribe: () => () => {} };

let remote: FakeRemote;

beforeEach(async () => {
  db = createTestDatabase();
  counter = 0;
  remote = new FakeRemote();
  await migrate(db);
});

afterEach(() => {
  db.close();
});

/** Wraps the fake server in the entity shape the engine drives. */
function symptomEntity(): SyncEntity {
  return {
    tableName: 'symptom_logs',
    upsert: (payloads) => remote.upsert(payloads),
    fetchChangedSince: (args) => remote.fetchChangedSince(args),
    apply: (database, rows, pending) => applyServerRows(database, rows as SymptomLogRow[], pending),
  };
}

function engine(network: NetworkMonitor = online) {
  return createSyncEngine({
    db,
    entities: [symptomEntity()],
    network,
    now: () => NOW,
    random: () => 0.5,
  });
}

function draft(overrides: Partial<SymptomDraft> = {}): SymptomDraft {
  return {
    symptomType: 'bloating',
    severity: 6,
    occurredAt: new Date('2026-08-24T11:00:00Z'),
    note: undefined,
    ...overrides,
  };
}

async function log(overrides: Partial<SymptomDraft> = {}) {
  return createSymptomLog(
    db,
    { userId: USER, draft: draft(overrides), timeZone: 'UTC' },
    { now: NOW, generateId }
  );
}

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

describe('push', () => {
  it('sends a queued log and empties the outbox', async () => {
    const created = await log();

    const result = await engine().syncNow();

    expect(result).toMatchObject({ pushed: 1, failed: 0, offline: false });
    expect(remote.rows.get(created.id)?.severity).toBe(6);
    expect(await pendingCount(db, 'symptom_logs')).toBe(0);
  });

  it('sends a batch in a single request', async () => {
    await log();
    await log({ severity: 3 });
    await log({ severity: 9 });

    await engine().syncNow();

    expect(remote.upsertCalls[0]).toHaveLength(3);
    expect(remote.rows.size).toBe(3);
  });

  it('does not duplicate when the same log is synced twice', async () => {
    // The idempotency guarantee: the id is the device's, so a repeat is an update.
    const created = await log();

    await engine().syncNow();
    await engine().syncNow();

    expect(remote.rows.size).toBe(1);
    expect(remote.rows.has(created.id)).toBe(true);
  });

  it('keeps the log and counts an attempt when the server is unreachable', async () => {
    const created = await log();
    remote.failEntireUpsert = 2; // batch attempt, then the isolated retry

    const result = await engine().syncNow();

    expect(result).toMatchObject({ pushed: 0, failed: 1 });
    expect(await pendingCount(db, 'symptom_logs')).toBe(1);
    // The user's log is untouched and still readable — the failure is invisible to them.
    expect(await getSymptomLog(db, created.id)).not.toBeNull();
  });

  it('retries successfully once the server recovers', async () => {
    const created = await log();
    remote.failEntireUpsert = 2;
    await engine().syncNow();

    const later = new Date(NOW.getTime() + 60_000);
    const recovered = createSyncEngine({
      db,
      entities: [symptomEntity()],
      network: online,
      now: () => later,
      random: () => 0.5,
    });
    const result = await recovered.syncNow();

    expect(result.pushed).toBe(1);
    expect(remote.rows.has(created.id)).toBe(true);
    expect(await pendingCount(db, 'symptom_logs')).toBe(0);
  });

  it('does not let one rejected log block the rest of the queue', async () => {
    const good = await log();
    const bad = await log({ severity: 9 });
    remote.rejectIds.add(bad.id);

    const result = await engine().syncNow();

    expect(result).toMatchObject({ pushed: 1, failed: 1 });
    expect(remote.rows.has(good.id)).toBe(true);
    expect(remote.rows.has(bad.id)).toBe(false);
    // The rejected one is still queued, not discarded.
    expect(await pendingCount(db, 'symptom_logs')).toBe(1);
  });

  it('pushes a tombstone so a deletion reaches the server', async () => {
    const created = await log();
    await engine().syncNow();

    await softDeleteSymptomLog(db, created.id, { now: NOW, generateId });
    await engine().syncNow();

    expect(remote.rows.get(created.id)?.deleted_at).not.toBeNull();
  });
});

describe('offline', () => {
  it('does nothing at all, and does not burn a retry attempt', async () => {
    await log();

    const result = await engine(offline).syncNow();

    expect(result.offline).toBe(true);
    expect(remote.upsertCalls).toHaveLength(0);

    // Still claimable immediately: no backoff was applied for being offline.
    const claimed = await claimDue(db, { tableName: 'symptom_logs', limit: 10, now: NOW });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.attemptCount).toBe(0);
  });

  it('syncs everything queued while offline once connectivity returns', async () => {
    await log();
    await log({ severity: 2 });
    await engine(offline).syncNow();

    const result = await engine(online).syncNow();

    expect(result.pushed).toBe(2);
    expect(await pendingCount(db, 'symptom_logs')).toBe(0);
  });
});

describe('pull', () => {
  it('brings down rows this device has never seen', async () => {
    remote.rows.set('remote-1', serverRow());

    const result = await engine().syncNow();

    expect(result.pulled).toBe(1);
    expect((await getSymptomLog(db, 'remote-1'))?.symptomType).toBe('cramping');
  });

  it('advances the cursor so the next pull does not refetch everything', async () => {
    remote.rows.set('remote-1', serverRow());
    await engine().syncNow();

    expect(await readCursor(db, 'symptom_logs')).toBe('2026-08-24T09:00:00.000Z');
  });

  it('terminates when every row sits exactly on the cursor', async () => {
    // The cursor is inclusive, so the last page always returns itself. This must not loop.
    remote.rows.set('remote-1', serverRow());

    await engine().syncNow();
    const result = await engine().syncNow();

    expect(result.pulled).toBe(0);
  });

  it('never overwrites a local edit that has not been pushed', async () => {
    const created = await log();
    remote.rows.set(
      created.id,
      serverRow({ id: created.id, severity: 1, updated_at: '2099-01-01T00:00:00.000Z' })
    );

    // Offline, so the local edit stays queued while the pull would otherwise apply.
    const result = await engine(offline).syncNow();
    expect(result.offline).toBe(true);

    expect((await getSymptomLog(db, created.id))?.severity).toBe(6);
  });

  it('replicates a deletion made elsewhere', async () => {
    remote.rows.set('remote-1', serverRow());
    await engine().syncNow();

    remote.rows.set(
      'remote-1',
      serverRow({ deleted_at: '2026-08-24T10:00:00.000Z', updated_at: '2026-08-24T10:00:00.000Z' })
    );
    await engine().syncNow();

    expect(await listRecentSymptomLogs(db, { userId: USER, limit: 10 })).toEqual([]);
  });
});

describe('start', () => {
  it('recovers work stranded by a crash mid-push', async () => {
    await log();
    // Claim without finishing, as a force-quit would leave it.
    await claimDue(db, { tableName: 'symptom_logs', limit: 10, now: NOW });
    expect(await claimDue(db, { tableName: 'symptom_logs', limit: 10, now: NOW })).toHaveLength(0);

    const sync = engine();
    const stop = await sync.start();
    await sync.syncNow(); // start() does not block boot on the network; join its run

    expect(remote.rows.size).toBe(1);
    expect(await pendingCount(db, 'symptom_logs')).toBe(0);
    stop();
  });

  it('syncs again when connectivity returns', async () => {
    const listeners: ((connected: boolean) => void)[] = [];
    let connected = false;

    const flaky: NetworkMonitor = {
      isConnected: async () => connected,
      subscribe: (listener) => {
        listeners.push(listener);
        return () => {};
      },
    };

    await log();
    const sync = engine(flaky);
    const stop = await sync.start();
    await sync.syncNow();

    expect(remote.rows.size).toBe(0); // offline at start

    connected = true;
    for (const listener of listeners) listener(true);
    await sync.syncNow();

    expect(remote.rows.size).toBe(1);
    stop();
  });
});

describe('concurrent runs', () => {
  it('coalesces overlapping calls instead of pushing the same row twice', async () => {
    await log();
    const sync = engine();

    const [first, second] = await Promise.all([sync.syncNow(), sync.syncNow()]);

    expect(first.pushed + second.pushed).toBeLessThanOrEqual(2);
    expect(remote.rows.size).toBe(1);
    expect(await pendingCount(db, 'symptom_logs')).toBe(0);
  });
});
