/**
 * Keeping the OS in step with the user's preferences.
 *
 * The one operation the app performs: take the current preferences, decide what should be
 * scheduled, and make the OS hold exactly that. Called after every settings change, and on boot,
 * because scheduled notifications survive a reinstall on iOS in ways that are hard to reason
 * about — reasserting the whole set is cheaper than tracking what is already there.
 *
 * Free of `expo-notifications` and of React, so what the app does with permission states can be
 * tested without a device.
 */

import { planReminders } from '@/domain/notifications/schedule';
import type { NotificationPreferences } from '@/domain/notifications/preferences';

import type { NotificationProvider } from './provider';

export type SyncOutcome =
  | { status: 'scheduled'; count: number; suppressed: number }
  | { status: 'nothing_to_schedule' }
  | { status: 'permission_missing' };

/**
 * Applies `preferences` to the OS.
 *
 * **Never asks for permission.** That is the caller's job and only in response to something the
 * user did, because iOS grants one prompt per install (spec §74). This function reads the current
 * state and works within it.
 *
 * Without permission it still cancels: a user who turns notifications off in Settings must not
 * find a queue of reminders waiting if they turn them back on months later.
 */
export async function syncReminders(
  provider: NotificationProvider,
  preferences: NotificationPreferences
): Promise<SyncOutcome> {
  const permission = await provider.getPermission();

  if (permission !== 'granted') {
    await provider.cancelAll();
    return { status: 'permission_missing' };
  }

  const plan = planReminders(preferences);

  // `apply([])` rather than an early return: everything switched off has to reach the OS as
  // "cancel what you are holding", not as "leave it alone".
  await provider.apply(plan.scheduled);

  if (plan.scheduled.length === 0) return { status: 'nothing_to_schedule' };

  return {
    status: 'scheduled',
    count: plan.scheduled.length,
    suppressed: plan.suppressed.length,
  };
}
