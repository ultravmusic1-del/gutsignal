/**
 * @jest-environment node
 *
 * Once-per-user events, against the real schema.
 */

import { migrate } from '@/services/db/migrator';
import { createTestDatabase, type TestDatabase } from '@/services/db/nodeSqlite.testing';

import { hasReachedMilestone, recordMilestone } from '../milestones';

const USER = 'user-1';
const OTHER = 'user-2';
const NOW = new Date('2026-09-07T12:00:00.000Z');

let db: TestDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await migrate(db);
});

afterEach(() => {
  db.close();
});

describe('recording a milestone', () => {
  it('is not reached before anything happens', async () => {
    expect(await hasReachedMilestone(db, USER, 'first_insight_available')).toBe(false);
  });

  it('is reached once recorded', async () => {
    await recordMilestone(db, USER, 'first_insight_available', NOW);

    expect(await hasReachedMilestone(db, USER, 'first_insight_available')).toBe(true);
  });

  /**
   * The return value is the whole point: it is what tells the caller whether to send the event.
   */
  it('reports that it recorded the first time and not the second', async () => {
    expect(await recordMilestone(db, USER, 'first_insight_available', NOW)).toBe(true);
    expect(await recordMilestone(db, USER, 'first_insight_available', NOW)).toBe(false);
  });

  /**
   * Two callers racing — a screen mounting twice, a re-render during a slow read — must not both
   * report the event. The database decides which one won, not the caller.
   */
  it('lets exactly one of several simultaneous callers record it', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => recordMilestone(db, USER, 'first_insight_available', NOW))
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('keeps one user milestone separate from another', async () => {
    await recordMilestone(db, USER, 'first_insight_available', NOW);

    expect(await hasReachedMilestone(db, OTHER, 'first_insight_available')).toBe(false);
  });

  /**
   * A milestone records that an event was sent from this install. Queuing it would sync that fact
   * to another device, which would then suppress a milestone it never reported.
   */
  it('queues nothing for sync', async () => {
    await recordMilestone(db, USER, 'first_insight_available', NOW);

    expect(await db.getAllAsync<{ id: string }>('SELECT id FROM sync_queue')).toEqual([]);
  });
});
