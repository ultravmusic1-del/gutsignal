/**
 * @jest-environment node
 *
 * What happens when things go wrong (review §29).
 *
 * The sync engine's happy paths are covered in `syncEngine.test.ts`. This file is the other half:
 * the architecture exists specifically to survive a bad server, a corrupt row and a dead network,
 * and none of that is evidence until it has been made to happen.
 *
 * The rule every test here defends is `CLAUDE.md` §15 — a user's entry is never silently
 * discarded. A failure may retry, back off, or report itself. It may not lose anything.
 */
import type { SymptomDraft } from '@/domain/logs/symptom';
import { migrate } from '@/services/db/migrator';
import { createTestDatabase, type TestDatabase } from '@/services/db/nodeSqlite.testing';
import {
  applyServerRows,
  createSymptomLog,
  getSymptomLog,
  listRecentSymptomLogs,
  type SymptomLogRow,
} from '@/services/logs/symptomRepository';

import { readCursor } from '../cursors';
import type { NetworkMonitor } from '../network';
import { pendingCount } from '../outbox';
import {
  createSyncEngine,
  PUSH_BATCH_SIZE,
  type SyncEntity,
  type SyncableRow,
} from '../syncEngine';

const USER = 'user-1';
const NOW = new Date('2026-08-24T12:00:00Z');

let db: TestDatabase;
let counter = 0;
const generateId = () => `id-${(counter += 1)}`;

const online: NetworkMonitor = { isConnected: async () => true, subscribe: () => () => {} };

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

const log = (overrides: Partial<SymptomDraft> = {}) =>
  createSymptomLog(
    db,
    { userId: USER, draft: draft(overrides), timeZone: 'UTC' },
    { now: NOW, generateId }
  );

/** An entity whose server behaviour each test defines for itself. */
function entityThat(
  behaviour: Partial<Pick<SyncEntity, 'upsert' | 'fetchChangedSince'>>
): SyncEntity {
  return {
    tableName: 'symptom_logs',
    upsert: behaviour.upsert ?? (async () => {}),
    fetchChangedSince: behaviour.fetchChangedSince ?? (async () => []),
    apply: (database, rows, pending) => applyServerRows(database, rows as SymptomLogRow[], pending),
  };
}

const engineWith = (entity: SyncEntity, now: Date = NOW) =>
  createSyncEngine({ db, entities: [entity], network: online, now: () => now, random: () => 0.5 });

/**
 * A page of rows the schema rejects — a partially applied migration, or a server a version ahead.
 *
 * §11 requires this to surface as a clean sync failure that retries, not as `undefined` reaching
 * the pattern engine months later and quietly changing what a person is told about their health.
 */
describe('a server row the app cannot understand', () => {
  const rejectsEveryPage = entityThat({
    fetchChangedSince: async () => {
      throw new Error('symptom_logs fetch returned rows in an unexpected shape');
    },
  });

  it('reports the failure instead of applying anything', async () => {
    const created = await log();

    const result = await engineWith(rejectsEveryPage).syncNow();

    expect(result.failureReason).not.toBeNull();
    // The local entry is untouched and still readable. A bad server must not cost the user data.
    expect((await getSymptomLog(db, created.id))?.severity).toBe(6);
  });

  /**
   * A cursor advanced past a page that could not be read would turn a transient server fault into
   * permanent, silent data loss: the next pull would start after rows this device never applied,
   * and nothing would ever ask for them again.
   */
  it('leaves the cursor alone, so the bad page is retried rather than skipped', async () => {
    await engineWith(rejectsEveryPage).syncNow();

    expect(await readCursor(db, 'symptom_logs')).toBeNull();
  });

  // One entity's bad page must not stop the others. Before this was isolated, a throw here left
  // the whole run and took every entity after it along with the push results already collected.
  it('does not stop other entities from syncing', async () => {
    const healthy: SyncEntity = {
      ...entityThat({ fetchChangedSince: async () => [] }),
      tableName: 'wellbeing_logs',
      apply: async () => ({ applied: 0, skipped: 0 }),
    };

    const engine = createSyncEngine({
      db,
      entities: [rejectsEveryPage, healthy],
      network: online,
      now: () => NOW,
      random: () => 0.5,
    });

    const result = await engine.syncNow();

    // The run completed and reported the failure rather than rejecting.
    expect(result.offline).toBe(false);
    expect(result.failureReason).not.toBeNull();
  });
});

/**
 * A queued payload that will not parse.
 *
 * It can never succeed, so retrying it at full speed forever is the wrong answer — and so is
 * dropping it, which loses whatever it was. It fails, backs off, and stays visible in the outbox.
 */
describe('a corrupt row in the outbox', () => {
  it('fails the corrupt row without blocking the ones around it', async () => {
    const good = await log();
    const bad = await log({ severity: 9 });

    // Corrupt one payload in place, the way a truncated write would.
    await db.runAsync('UPDATE sync_queue SET payload = ? WHERE record_id = ?', '{not json', bad.id);

    const sent: unknown[] = [];
    const result = await engineWith(
      entityThat({
        upsert: async (payloads) => {
          sent.push(...payloads);
        },
      })
    ).syncNow();

    expect(result.pushed).toBe(1);
    expect(result.failed).toBe(1);
    expect(sent).toHaveLength(1);

    // The good one left the queue; the corrupt one is still there to be looked at.
    expect(await pendingCount(db, 'symptom_logs')).toBe(1);
    // And the entry itself is still on the device, which is what actually matters to the user.
    expect(await getSymptomLog(db, bad.id)).not.toBeNull();
    expect(await getSymptomLog(db, good.id)).not.toBeNull();
  });
});

/**
 * Scale. Someone logs for months with no connection, then opens the app on hotel wifi.
 *
 * The batch size is deliberate — one request per fifty rows, not one per row — so a large backlog
 * drains over several passes rather than in one enormous request that fails as a unit.
 */
describe('a large backlog', () => {
  const BACKLOG = 400;

  it('drains completely, with every row sent exactly once', async () => {
    const created: string[] = [];
    for (let i = 0; i < BACKLOG; i += 1) {
      created.push((await log({ severity: (i % 10) + 1 })).id);
    }

    expect(await pendingCount(db, 'symptom_logs')).toBe(BACKLOG);

    const seen: string[] = [];
    const entity = entityThat({
      upsert: async (payloads) => {
        for (const payload of payloads) seen.push((payload as { id: string }).id);
      },
    });

    // Each pass claims one batch, so a backlog needs several. Bounded well above what is required,
    // so a failure here means "never drained", not "needed one more turn".
    for (let pass = 0; pass < Math.ceil(BACKLOG / PUSH_BATCH_SIZE) + 2; pass += 1) {
      await engineWith(entity).syncNow();
    }

    expect(await pendingCount(db, 'symptom_logs')).toBe(0);
    expect(seen).toHaveLength(BACKLOG);
    // Exactly once each: a resend would mean the outbox released a row it had not confirmed.
    expect(new Set(seen).size).toBe(BACKLOG);
    expect(new Set(seen)).toEqual(new Set(created));
  });

  it('never sends more than one batch in a single request', async () => {
    for (let i = 0; i < BACKLOG; i += 1) await log();

    const batchSizes: number[] = [];
    await engineWith(
      entityThat({
        upsert: async (payloads) => {
          batchSizes.push(payloads.length);
        },
      })
    ).syncNow();

    expect(Math.max(...batchSizes)).toBeLessThanOrEqual(PUSH_BATCH_SIZE);
  });
});

/**
 * The same entry changed in two places.
 *
 * Last writer wins, by the server's `updated_at` — except that an unpushed local edit is never
 * overwritten, because its own push is what will resolve the difference.
 */
describe('the same record edited on two devices', () => {
  it('takes the newer remote edit when nothing local is waiting to be sent', async () => {
    const created = await log();

    // Push first, so nothing is pending and the local row is settled.
    await engineWith(entityThat({})).syncNow();
    expect(await pendingCount(db, 'symptom_logs')).toBe(0);

    const remoteRow = {
      ...(await serverShapeOf(created.id)),
      severity: 2,
      updated_at: '2099-01-01T00:00:00.000Z',
    };

    await engineWith(
      entityThat({ fetchChangedSince: async () => [remoteRow as unknown as SyncableRow] })
    ).syncNow();

    expect((await getSymptomLog(db, created.id))?.severity).toBe(2);
  });

  /**
   * A deletion made elsewhere is just another edit, and it must win on recency like any other.
   * The failure this prevents is an entry the user deleted on their phone reappearing forever
   * because a stale copy on the server kept being pulled back down.
   */
  it('applies a remote deletion that is newer than the local row', async () => {
    const created = await log();
    await engineWith(entityThat({})).syncNow();

    const tombstone = {
      ...(await serverShapeOf(created.id)),
      deleted_at: '2099-01-01T00:00:00.000Z',
      updated_at: '2099-01-01T00:00:00.000Z',
    };

    await engineWith(
      entityThat({ fetchChangedSince: async () => [tombstone as unknown as SyncableRow] })
    ).syncNow();

    expect(await listRecentSymptomLogs(db, { userId: USER, limit: 10 })).toEqual([]);
    // Tombstoned, not removed: another device still needs to learn about the deletion.
    expect((await getSymptomLog(db, created.id))?.deletedAt).toBe('2099-01-01T00:00:00.000Z');
  });

  it('refuses an older remote edit rather than undoing newer local work', async () => {
    const created = await log();
    await engineWith(entityThat({})).syncNow();

    const stale = {
      ...(await serverShapeOf(created.id)),
      severity: 1,
      updated_at: '2000-01-01T00:00:00.000Z',
    };

    await engineWith(
      entityThat({ fetchChangedSince: async () => [stale as unknown as SyncableRow] })
    ).syncNow();

    expect((await getSymptomLog(db, created.id))?.severity).toBe(6);
  });
});

/** Reads a row back in the shape the server would have returned it. */
async function serverShapeOf(id: string): Promise<Record<string, unknown>> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM symptom_logs WHERE id = ?',
    id
  );

  if (row === null || row === undefined) throw new Error(`no local row ${id}`);

  return row;
}
