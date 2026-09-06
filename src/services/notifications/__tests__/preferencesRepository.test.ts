/**
 * @jest-environment node
 *
 * Notification preferences on this device, against the real schema.
 */

import { defaultPreferences } from '@/domain/notifications/preferences';
import { migrate } from '@/services/db/migrator';
import { createTestDatabase, type TestDatabase } from '@/services/db/nodeSqlite.testing';

import {
  hasSavedNotificationPreferences,
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '../preferencesRepository';

const USER = 'user-1';
const OTHER = 'user-2';
const NOW = new Date('2026-09-06T12:00:00.000Z');

let db: TestDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await migrate(db);
});

afterEach(() => {
  db.close();
});

describe('notification preferences', () => {
  it('answers with the defaults for a user who has never saved any', async () => {
    expect(await loadNotificationPreferences(db, USER, 'minimal')).toEqual(
      defaultPreferences('minimal')
    );
    expect(await loadNotificationPreferences(db, USER, 'balanced')).toEqual(
      defaultPreferences('balanced')
    );
  });

  /**
   * The fallback must not be written on read.
   *
   * "Never chose" and "chose exactly the defaults" have to stay distinguishable, because the day
   * the defaults change one of those users should move and the other should not.
   */
  it('does not persist the defaults just because they were read', async () => {
    await loadNotificationPreferences(db, USER, 'balanced');

    expect(await hasSavedNotificationPreferences(db, USER)).toBe(false);
  });

  it('round-trips every field', async () => {
    const preferences = {
      ...defaultPreferences('balanced'),
      morningCheckIn: false,
      eveningCheckIn: true,
      weeklyReview: false,
      morningAt: { hour: 7, minute: 45 },
      eveningAt: { hour: 21, minute: 15 },
      weeklyReviewWeekday: 6,
      weeklyReviewAt: { hour: 11, minute: 30 },
      quietHours: {
        enabled: false,
        from: { hour: 23, minute: 5 },
        until: { hour: 6, minute: 55 },
      },
    };

    await saveNotificationPreferences(db, USER, preferences, NOW);

    expect(await loadNotificationPreferences(db, USER, 'balanced')).toEqual(preferences);
    expect(await hasSavedNotificationPreferences(db, USER)).toBe(true);
  });

  it('replaces rather than duplicating when saved again', async () => {
    await saveNotificationPreferences(db, USER, defaultPreferences('balanced'), NOW);
    await saveNotificationPreferences(
      db,
      USER,
      { ...defaultPreferences('balanced'), morningCheckIn: false },
      NOW
    );

    const rows = await db.getAllAsync<{ user_id: string }>(
      'SELECT user_id FROM notification_preferences'
    );

    expect(rows).toHaveLength(1);
    expect((await loadNotificationPreferences(db, USER, 'balanced')).morningCheckIn).toBe(false);
  });

  it('keeps one user out of another user settings', async () => {
    await saveNotificationPreferences(
      db,
      USER,
      { ...defaultPreferences('balanced'), morningAt: { hour: 5, minute: 0 } },
      NOW
    );

    expect(await loadNotificationPreferences(db, OTHER, 'balanced')).toEqual(
      defaultPreferences('balanced')
    );
  });

  /**
   * The schema refuses nonsense rather than trusting the caller. Hour 24 does not exist, and a
   * time the OS scheduler cannot use is better rejected here than silently never firing.
   */
  it('refuses an impossible time', async () => {
    const insert = (hour: number) =>
      saveNotificationPreferences(
        db,
        `user-${hour}`,
        { ...defaultPreferences('balanced'), morningAt: { hour, minute: 0 } },
        NOW
      );

    await expect(insert(24)).rejects.toThrow();
    await expect(insert(-1)).rejects.toThrow();
    await expect(insert(23)).resolves.toBeUndefined();
  });

  /**
   * Reminders are a property of the phone, not the account — this table is deliberately outside
   * the outbox, and a saved preference must never queue an upload.
   */
  it('queues nothing for sync', async () => {
    await saveNotificationPreferences(db, USER, defaultPreferences('balanced'), NOW);

    const queued = await db.getAllAsync<{ id: string }>('SELECT id FROM sync_queue');

    expect(queued).toEqual([]);
  });
});
