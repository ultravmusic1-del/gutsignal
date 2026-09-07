import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { REMINDER_KINDS, type ReminderKind } from '@/domain/notifications/preferences';

/**
 * Where each reminder goes when it is tapped.
 *
 * Milestone 14 shipped reminders with nowhere to land: tapping "Your weekly review is ready"
 * opened the app at whatever screen was last shown. A notification that promises something and
 * then does not deliver it is worse than no notification, so the mapping is exhaustive by type —
 * adding a reminder kind without deciding where it goes is a compile error.
 */
const DESTINATION: Record<ReminderKind, string> = {
  morning_check_in: '/log',
  evening_check_in: '/log',
  weekly_review: '/weekly-review',
};

/** Narrows the notification payload, which is `unknown` as far as the app is concerned. */
function reminderKindOf(data: unknown): ReminderKind | null {
  if (typeof data !== 'object' || data === null) return null;

  const kind = (data as { kind?: unknown }).kind;
  if (typeof kind !== 'string') return null;

  return (REMINDER_KINDS as readonly string[]).includes(kind) ? (kind as ReminderKind) : null;
}

/**
 * Routes a tapped reminder, including one that launched the app from cold.
 *
 * Two paths, and both are needed. `addNotificationResponseReceivedListener` covers a tap while the
 * app is running or backgrounded; `getLastNotificationResponseAsync` covers the case where the tap
 * *started* the process, where the listener is registered too late to have seen it.
 *
 * The payload is data from outside the app, so it is validated rather than trusted. An unknown
 * kind — an old notification scheduled by a previous version, say — routes nowhere rather than to
 * a guess.
 *
 * Renders nothing. Mounted once, inside the router.
 */
export function useNotificationRouting(): void {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const go = (data: unknown) => {
      const kind = reminderKindOf(data);
      if (kind === null || cancelled) return;

      router.push(DESTINATION[kind]);
    };

    // A tap that launched the app. Read once, on mount, before the listener could have fired.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) go(response.notification.request.content.data);
      })
      .catch(() => {
        // A reminder that cannot be routed must not take down the app that was opening.
      });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      go(response.notification.request.content.data);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [router]);
}
