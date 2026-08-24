import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { MealDraft } from '@/domain/logs/meal';
import { resolveTimeZone } from '@/domain/time/occurrence';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSync } from '@/features/sync/SyncProvider';
import { openDatabase } from '@/services/db/database';
import {
  createMeal,
  listMealsForLocalDate,
  listRecentMeals,
  repeatMeal,
  type MealWithSync,
} from '@/services/logs/mealRepository';
import { newId } from '@/utils/id';

/**
 * Reading and writing meals from the UI.
 *
 * Like symptoms, these read from SQLite rather than Supabase: local storage is the source the
 * screens render from, which is what makes the app behave identically online and offline.
 */

export const mealsQueryKey = (userId: string, localDate: string) =>
  ['meals', userId, localDate] as const;

export const recentMealsQueryKey = (userId: string) => ['meals', userId, 'recent'] as const;

/** How many previous meals the repeat list offers (spec §40). */
export const RECENT_MEAL_COUNT = 6;

export function useMealsForDay(localDate: string) {
  const { userId } = useAuth();

  return useQuery<MealWithSync[]>({
    queryKey: userId ? mealsQueryKey(userId, localDate) : ['meals', 'anonymous', localDate],
    queryFn: async () => {
      const db = await openDatabase();
      return listMealsForLocalDate(db, { userId: userId as string, localDate });
    },
    enabled: Boolean(userId),
    staleTime: 0,
  });
}

/** Recent meals, for one-tap repeating. */
export function useRecentMeals(limit: number = RECENT_MEAL_COUNT) {
  const { userId } = useAuth();

  return useQuery<MealWithSync[]>({
    queryKey: userId ? recentMealsQueryKey(userId) : ['meals', 'anonymous', 'recent'],
    queryFn: async () => {
      const db = await openDatabase();
      return listRecentMeals(db, { userId: userId as string, limit });
    },
    enabled: Boolean(userId),
    staleTime: 0,
  });
}

function useInvalidateMeals() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return async (localDate: string) => {
    if (userId === null) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: mealsQueryKey(userId, localDate) }),
      queryClient.invalidateQueries({ queryKey: recentMealsQueryKey(userId) }),
    ]);
  };
}

/**
 * Saves a meal.
 *
 * Completes when SQLite commits. Sync is requested afterwards and deliberately not awaited:
 * whether the network is there changes nothing about whether the meal was recorded.
 */
export function useLogMeal() {
  const { userId } = useAuth();
  const { syncNow } = useSync();
  const invalidate = useInvalidateMeals();

  return useMutation<string, Error, MealDraft>({
    mutationFn: async (draft: MealDraft) => {
      if (userId === null) throw new Error('Not signed in.');

      const db = await openDatabase();
      const meal = await createMeal(
        db,
        { userId, draft, timeZone: resolveTimeZone() },
        { now: new Date(), generateId: newId }
      );

      return meal.occurredLocalDate;
    },

    onSuccess: async (localDate: string) => {
      await invalidate(localDate);
      syncNow();
    },
  });
}

/** Records a previous meal again at a new time (spec §40). */
export function useRepeatMeal() {
  const { syncNow } = useSync();
  const invalidate = useInvalidateMeals();

  return useMutation<string, Error, { sourceMealId: string; occurredAt: Date }>({
    mutationFn: async ({ sourceMealId, occurredAt }) => {
      const db = await openDatabase();
      const meal = await repeatMeal(
        db,
        { sourceMealId, occurredAt, timeZone: resolveTimeZone() },
        { now: new Date(), generateId: newId }
      );

      if (meal === null) throw new Error('That meal is no longer available to repeat.');
      return meal.occurredLocalDate;
    },

    onSuccess: async (localDate: string) => {
      await invalidate(localDate);
      syncNow();
    },
  });
}
