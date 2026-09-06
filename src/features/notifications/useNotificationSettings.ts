import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import {
  defaultPreferences,
  type NotificationPreferences,
} from '@/domain/notifications/preferences';
import { planReminders, type ReminderPlan } from '@/domain/notifications/schedule';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';
import { openDatabase } from '@/services/db/database';
import { createExpoNotificationProvider } from '@/services/notifications/expoNotificationProvider';
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '@/services/notifications/preferencesRepository';
import type { NotificationPermission } from '@/services/notifications/provider';
import { syncReminders } from '@/services/notifications/reminders';

/**
 * The notification settings screen's data (spec §75).
 *
 * Two independent pieces of state that the screen has to show together: what the user has asked
 * for, which lives in the local database, and what the OS currently permits, which lives outside
 * the app entirely and can change while it is backgrounded. Keeping them as separate queries is
 * what lets the screen say "these are your settings, and iOS is not delivering them" — a single
 * merged value would have to pick one of those to be wrong about.
 */

const provider = createExpoNotificationProvider();

export const notificationPreferencesKey = (userId: string) =>
  ['notification-preferences', userId] as const;

export const notificationPermissionKey = ['notification-permission'] as const;

export function useNotificationPermission() {
  return useQuery<NotificationPermission>({
    queryKey: notificationPermissionKey,
    queryFn: () => provider.getPermission(),
    // The OS setting can change in iOS Settings while the app is backgrounded, so this is never
    // treated as fresh. It is one cheap native call.
    staleTime: 0,
  });
}

export function useNotificationSettings() {
  const { userId } = useAuth();
  const profile = useProfile();
  const queryClient = useQueryClient();

  const trackingStyle =
    profile.data?.ok === true ? profile.data.profile.tracking_style : 'balanced';

  const preferences = useQuery<NotificationPreferences>({
    queryKey: userId
      ? notificationPreferencesKey(userId)
      : ['notification-preferences', 'anonymous'],
    queryFn: async () =>
      loadNotificationPreferences(await openDatabase(), userId as string, trackingStyle),
    enabled: Boolean(userId),
  });

  const permission = useNotificationPermission();

  /**
   * Saves, then reconciles the OS.
   *
   * In that order, and both every time. A preference the user changed must survive even if
   * scheduling fails — the setting is the record of what they asked for, and the OS is a cache of
   * it that `syncReminders` can rebuild on the next launch.
   */
  const save = useMutation({
    mutationFn: async (next: NotificationPreferences) => {
      const db = await openDatabase();
      await saveNotificationPreferences(db, userId as string, next, new Date());
      return syncReminders(provider, next);
    },
    onSuccess: (_result, next) => {
      if (userId) queryClient.setQueryData(notificationPreferencesKey(userId), next);
    },
  });

  /**
   * Asks the OS, once, because the user pressed something that said it would.
   *
   * iOS gives an app a single prompt per install (spec §74). A `granted` answer is followed
   * immediately by a sync, so the reminders they have just enabled are actually registered rather
   * than waiting for the next save.
   */
  const request = useMutation({
    mutationFn: async () => {
      const granted = await provider.requestPermission();

      if (granted === 'granted' && preferences.data) {
        await syncReminders(provider, preferences.data);
      }

      return granted;
    },
    onSuccess: (granted) => {
      queryClient.setQueryData(notificationPermissionKey, granted);
    },
  });

  const current = preferences.data ?? defaultPreferences(trackingStyle);

  const update = useCallback(
    (change: Partial<NotificationPreferences>) => save.mutate({ ...current, ...change }),
    [current, save]
  );

  const plan: ReminderPlan = planReminders(current);

  return {
    preferences: current,
    isLoading: preferences.isPending,
    permission: permission.data ?? 'undetermined',
    isPermissionLoading: permission.isPending,
    plan,
    update,
    isSaving: save.isPending,
    saveFailed: save.isError,
    requestPermission: request.mutate,
    isRequestingPermission: request.isPending,
  };
}
