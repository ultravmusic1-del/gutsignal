import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { LogEntryKind } from '@/domain/logs/entry';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSync } from '@/features/sync/SyncProvider';
import { openDatabase } from '@/services/db/database';
import { softDeleteBowelLog } from '@/services/logs/bowelRepository';
import { softDeleteContextLog } from '@/services/logs/contextRepository';
import { softDeleteMeal } from '@/services/logs/mealRepository';
import { softDeleteSymptomLog } from '@/services/logs/symptomRepository';
import {
  countTimelineEntries,
  fetchTimelinePage,
  type TimelineCursor,
  type TimelinePage,
} from '@/services/logs/timelineRepository';
import { softDeleteWellbeingLog } from '@/services/logs/wellbeingRepository';
import { newId } from '@/utils/id';

/**
 * The timeline's data (spec §48).
 *
 * Pages come from local storage, so scrolling a year of history never waits on a network call
 * and works identically offline.
 */

export const timelineQueryKey = (userId: string, filter: string, search: string) =>
  ['timeline', userId, filter, search] as const;

export const timelineCountQueryKey = (userId: string) => ['timeline-count', userId] as const;

export function useTimeline({ kind, search }: { kind: LogEntryKind | null; search: string }) {
  const { userId } = useAuth();

  return useInfiniteQuery<
    TimelinePage,
    Error,
    TimelinePage[],
    readonly unknown[],
    TimelineCursor | null
  >({
    queryKey: userId
      ? timelineQueryKey(userId, kind ?? 'all', search)
      : ['timeline', 'anonymous', kind ?? 'all', search],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const db = await openDatabase();
      return fetchTimelinePage(db, {
        userId: userId as string,
        kind,
        search,
        cursor: pageParam,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(userId),
    staleTime: 0,
    select: (data) => data.pages,
  });
}

/**
 * How many entries exist at all, ignoring filters.
 *
 * Lets the empty state tell "you have not logged anything yet" apart from "your filter matched
 * nothing" — two situations that need completely different words.
 */
export function useTimelineCount() {
  const { userId } = useAuth();

  return useQuery<number>({
    queryKey: userId ? timelineCountQueryKey(userId) : ['timeline-count', 'anonymous'],
    queryFn: async () => countTimelineEntries(await openDatabase(), userId as string),
    enabled: Boolean(userId),
    staleTime: 0,
  });
}

const DELETERS: Record<
  LogEntryKind,
  (
    db: Awaited<ReturnType<typeof openDatabase>>,
    id: string,
    deps: { now: Date; generateId: () => string }
  ) => Promise<boolean>
> = {
  meal: softDeleteMeal,
  symptom: softDeleteSymptomLog,
  bowel: softDeleteBowelLog,
  wellbeing: softDeleteWellbeingLog,
  context: softDeleteContextLog,
};

/**
 * Deletes an entry.
 *
 * A tombstone, not a removal: the row stays with `deleted_at` set so the deletion itself
 * replicates. On another device this arrives as "the user deleted this", not as a row that
 * mysteriously never appeared.
 */
export function useDeleteEntry() {
  const queryClient = useQueryClient();
  const { syncNow } = useSync();

  return useMutation<void, Error, { kind: LogEntryKind; id: string }>({
    mutationFn: async ({ kind, id }) => {
      const db = await openDatabase();
      const deleted = await DELETERS[kind](db, id, { now: new Date(), generateId: newId });

      if (!deleted) throw new Error('That entry is no longer here.');
    },

    onSuccess: async () => {
      // Everything that shows entries: the timeline itself, its count, and Today.
      await queryClient.invalidateQueries();
      syncNow();
    },
  });
}
