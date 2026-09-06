import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';
import { openDatabase } from '@/services/db/database';
import { createExpoNotificationProvider } from '@/services/notifications/expoNotificationProvider';
import { loadNotificationPreferences } from '@/services/notifications/preferencesRepository';
import { syncReminders } from '@/services/notifications/reminders';

/**
 * Keeps the OS holding what the user asked for, without them visiting the settings screen.
 *
 * ## Why this exists at all
 *
 * Notification permission lives outside the app and changes without telling it. Someone can grant
 * it in iOS Settings weeks after refusing, or revoke it while the app is backgrounded — and the
 * settings screen is the only other place that reconciles, so without this a granted permission
 * would schedule nothing until they happened to open that screen again.
 *
 * It runs on mount and on every return to the foreground, which is the moment a Settings change
 * has just happened. `syncReminders` is idempotent and cancels before scheduling, so running it
 * often is free.
 *
 * It never asks for permission — that belongs to a button the user pressed (spec §74).
 *
 * Renders nothing. Mounted once, under the auth provider, so it has a user to sync for.
 */
export function ReminderSync() {
  const { userId } = useAuth();
  const profile = useProfile();

  const trackingStyle =
    profile.data?.ok === true ? profile.data.profile.tracking_style : 'balanced';

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const reconcile = async () => {
      // A failure here must never reach the user. Reminders are a convenience; a diary that will
      // not open because its notification schedule could not be written would be absurd (§54).
      try {
        const db = await openDatabase();
        const preferences = await loadNotificationPreferences(db, userId, trackingStyle);
        if (cancelled) return;
        await syncReminders(createExpoNotificationProvider(), preferences);
      } catch {
        // Deliberately silent. The settings screen reconciles again on its next visit, and the
        // next foreground will retry this.
      }
    };

    void reconcile();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void reconcile();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [userId, trackingStyle]);

  return null;
}
