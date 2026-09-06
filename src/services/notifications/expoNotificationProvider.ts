/**
 * The iOS implementation of the notification seam, over `expo-notifications`.
 *
 * Everything here is local scheduling. GutSignal sends no remote push: there is no server that
 * does it, no push credential, and — for a diary — no message worth sending from one. That also
 * means the whole feature works in Expo Go, where remote push does not.
 *
 * This module is the only place `expo-notifications` is imported. Nothing above it knows the
 * vendor exists.
 */

import * as Notifications from 'expo-notifications';

import type { PlannedReminder } from '@/domain/notifications/schedule';

import type { NotificationPermission, NotificationProvider } from './provider';

/**
 * How a reminder looks when it arrives while the app is open.
 *
 * A banner, no sound, no badge. The reminder is a nudge, and a diary that pings and increments a
 * red number for a check-in is a diary people turn off (spec §74, "do not spam users").
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function toPermission(status: Notifications.PermissionStatus): NotificationPermission {
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
}

/**
 * The trigger for one reminder.
 *
 * `DAILY` and `WEEKLY` fire on the device's own wall clock, which is what a diary wants: "nine in
 * the morning" has to stay nine in the morning after a flight or a daylight-saving change, and an
 * interval computed in seconds would drift by an hour twice a year (`CLAUDE.md` §16).
 */
function triggerFor(reminder: PlannedReminder): Notifications.NotificationTriggerInput {
  if (reminder.weekday === undefined) {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: reminder.at.hour,
      minute: reminder.at.minute,
    };
  }

  return {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    weekday: reminder.weekday,
    hour: reminder.at.hour,
    minute: reminder.at.minute,
  };
}

export function createExpoNotificationProvider(): NotificationProvider {
  return {
    async getPermission(): Promise<NotificationPermission> {
      const { status } = await Notifications.getPermissionsAsync();
      return toPermission(status);
    },

    async requestPermission(): Promise<NotificationPermission> {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: false },
      });
      return toPermission(status);
    },

    async apply(reminders: PlannedReminder[]): Promise<void> {
      // Cancel first, always. Saving the settings screen twice must not leave two morning
      // reminders behind, and there is no reliable way to diff against what iOS already holds.
      await Notifications.cancelAllScheduledNotificationsAsync();

      for (const reminder of reminders) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: reminder.title,
            body: reminder.body,
            // Identifies which reminder was tapped without putting anything about the person in
            // the payload. A notification payload is stored by the OS outside the app's sandbox.
            data: { kind: reminder.kind },
          },
          trigger: triggerFor(reminder),
        });
      }
    },

    async cancelAll(): Promise<void> {
      await Notifications.cancelAllScheduledNotificationsAsync();
    },
  };
}
