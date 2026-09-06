import { defaultPreferences } from '@/domain/notifications/preferences';
import type { PlannedReminder } from '@/domain/notifications/schedule';

import type { NotificationPermission, NotificationProvider } from '../provider';
import { syncReminders } from '../reminders';

/**
 * What the app does with the OS, and what it refuses to do.
 *
 * Two rules carry the weight. Applying twice must not stack duplicates — a settings screen is
 * saved repeatedly, and reminders that accumulate are the fastest way to make someone disable
 * notifications for good. And nothing here may ever open the permission sheet: iOS grants one
 * prompt per install, so it belongs to a deliberate action by the user, not to a background sync.
 */

function createFakeProvider(permission: NotificationPermission = 'granted') {
  /** Stands in for what the OS is currently holding. */
  let held: PlannedReminder[] = [];
  const calls: string[] = [];

  const provider: NotificationProvider = {
    async getPermission() {
      calls.push('getPermission');
      return permission;
    },

    async requestPermission() {
      calls.push('requestPermission');
      return permission;
    },

    async apply(reminders) {
      calls.push('apply');
      // Replace, the way the real implementation must: cancel then schedule.
      held = [...reminders];
    },

    async cancelAll() {
      calls.push('cancelAll');
      held = [];
    },
  };

  return { provider, calls, scheduled: () => held };
}

describe('syncing reminders to the OS', () => {
  it('schedules the plan when permission has been granted', async () => {
    const fake = createFakeProvider('granted');

    const outcome = await syncReminders(fake.provider, defaultPreferences('balanced'));

    expect(outcome).toEqual({ status: 'scheduled', count: 3, suppressed: 0 });
    expect(fake.scheduled().map((reminder) => reminder.kind)).toEqual([
      'morning_check_in',
      'evening_check_in',
      'weekly_review',
    ]);
  });

  /**
   * The bug this is here to prevent: four identical morning reminders by the end of a session.
   */
  it('leaves the same set behind however many times it runs', async () => {
    const fake = createFakeProvider('granted');
    const preferences = defaultPreferences('balanced');

    await syncReminders(fake.provider, preferences);
    await syncReminders(fake.provider, preferences);
    await syncReminders(fake.provider, preferences);

    expect(fake.scheduled()).toHaveLength(3);
  });

  it('clears the OS when every reminder is switched off', async () => {
    const fake = createFakeProvider('granted');

    await syncReminders(fake.provider, defaultPreferences('balanced'));
    const outcome = await syncReminders(fake.provider, {
      ...defaultPreferences('balanced'),
      morningCheckIn: false,
      eveningCheckIn: false,
      weeklyReview: false,
    });

    expect(outcome).toEqual({ status: 'nothing_to_schedule' });
    expect(fake.scheduled()).toEqual([]);
  });

  it('reports how many the quiet hours suppressed', async () => {
    const fake = createFakeProvider('granted');

    const outcome = await syncReminders(fake.provider, {
      ...defaultPreferences('balanced'),
      morningAt: { hour: 6, minute: 0 },
    });

    expect(outcome).toEqual({ status: 'scheduled', count: 2, suppressed: 1 });
  });

  /**
   * Permission is one prompt per install (spec §74). Spending it on a background sync — before the
   * user has seen why the app wants it — is the failure this asserts against.
   */
  it.each(['denied', 'undetermined'] as const)(
    'never opens the permission sheet when permission is %s',
    async (permission) => {
      const fake = createFakeProvider(permission);

      await syncReminders(fake.provider, defaultPreferences('balanced'));

      expect(fake.calls).not.toContain('requestPermission');
    }
  );

  /**
   * Someone who turns notifications off in iOS Settings must not find a backlog waiting if they
   * turn them back on later.
   */
  it.each(['denied', 'undetermined'] as const)(
    'cancels everything when permission is %s',
    async (permission) => {
      const granted = createFakeProvider('granted');
      await syncReminders(granted.provider, defaultPreferences('balanced'));

      const revoked = createFakeProvider(permission);
      const outcome = await syncReminders(revoked.provider, defaultPreferences('balanced'));

      expect(outcome).toEqual({ status: 'permission_missing' });
      expect(revoked.calls).toContain('cancelAll');
      expect(revoked.calls).not.toContain('apply');
    }
  );
});
