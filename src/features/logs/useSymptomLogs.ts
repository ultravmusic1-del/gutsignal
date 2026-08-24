import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SymptomDraft } from '@/domain/logs/symptom';
import { localDateIn, resolveTimeZone } from '@/domain/time/occurrence';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSync } from '@/features/sync/SyncProvider';
import { openDatabase } from '@/services/db/database';
import {
  createSymptomLog,
  listSymptomLogsForLocalDate,
  type SymptomLogWithSync,
} from '@/services/logs/symptomRepository';
import { newId } from '@/utils/id';

/**
 * Reading and writing symptom logs from the UI.
 *
 * These read from SQLite, not from Supabase. Local storage is the source the screens render
 * from, which is what makes the app work identically online and offline — and why saving never
 * shows a spinner waiting on a network call (docs/PROJECT_PLAN.md §6).
 *
 * TanStack Query is still the right tool even though the data is local: the reads are async and
 * need caching, loading states and invalidation on write. What §10 warns against is mirroring
 * the server's database into client state, which is not what this is.
 */

export const symptomLogsQueryKey = (userId: string, localDate: string) =>
  ['symptom-logs', userId, localDate] as const;

/** The user's own calendar day, in their current zone. Never the UTC day. */
export function todayLocalDate(now: Date = new Date()): string {
  return localDateIn(now, resolveTimeZone());
}

export function useSymptomLogsForDay(localDate: string) {
  const { userId } = useAuth();

  return useQuery<SymptomLogWithSync[]>({
    queryKey: userId
      ? symptomLogsQueryKey(userId, localDate)
      : ['symptom-logs', 'anonymous', localDate],
    queryFn: async () => {
      const db = await openDatabase();
      return listSymptomLogsForLocalDate(db, { userId: userId as string, localDate });
    },
    enabled: Boolean(userId),
    // Local reads are cheap and always current after an invalidation.
    staleTime: 0,
  });
}

export type LogSymptomResult = { ok: true } | { ok: false; message: string };

/**
 * Saves a symptom log.
 *
 * The write completes when SQLite commits. Sync is requested afterwards and its outcome is
 * deliberately not awaited: whether the network is there or not changes nothing about whether
 * the user's entry was saved.
 */
export function useLogSymptom() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const { syncNow } = useSync();

  return useMutation<SymptomLogWithSync['occurredLocalDate'], Error, SymptomDraft>({
    mutationFn: async (draft: SymptomDraft) => {
      if (userId === null) throw new Error('Not signed in.');

      const db = await openDatabase();
      const timeZone = resolveTimeZone();

      const log = await createSymptomLog(
        db,
        { userId, draft, timeZone },
        { now: new Date(), generateId: newId }
      );

      return log.occurredLocalDate;
    },

    onSuccess: async (localDate: string) => {
      if (userId !== null) {
        await queryClient.invalidateQueries({ queryKey: symptomLogsQueryKey(userId, localDate) });
      }
      syncNow();
    },
  });
}
