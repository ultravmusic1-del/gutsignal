import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BowelDraft } from '@/domain/logs/bowel';
import type { ContextDraft } from '@/domain/logs/context';
import type { LogEntryKind } from '@/domain/logs/entry';
import type { WellbeingDraft } from '@/domain/logs/wellbeing';
import { resolveTimeZone } from '@/domain/time/occurrence';
import { useAuth } from '@/features/auth/AuthProvider';
import { trackLogSaved } from '@/features/logs/logAnalytics';
import { useSync } from '@/features/sync/SyncProvider';
import { openDatabase } from '@/services/db/database';
import { createBowelLog, listBowelLogsForLocalDate } from '@/services/logs/bowelRepository';
import { createContextLog, listContextLogsForLocalDate } from '@/services/logs/contextRepository';
import {
  createWellbeingLog,
  listWellbeingLogsForLocalDate,
} from '@/services/logs/wellbeingRepository';
import { newId } from '@/utils/id';

/**
 * Reading and writing bowel, wellbeing and context logs.
 *
 * All three read from SQLite and all three write the same way, so the query and mutation shapes
 * are built once here rather than repeated per type.
 */

export const dayLogsQueryKey = (kind: string, userId: string, localDate: string) =>
  [kind, userId, localDate] as const;

function useDayQuery<T>(
  kind: string,
  localDate: string,
  read: (db: Awaited<ReturnType<typeof openDatabase>>, userId: string) => Promise<T[]>
) {
  const { userId } = useAuth();

  return useQuery<T[]>({
    queryKey: userId ? dayLogsQueryKey(kind, userId, localDate) : [kind, 'anonymous', localDate],
    queryFn: async () => read(await openDatabase(), userId as string),
    enabled: Boolean(userId),
    staleTime: 0,
  });
}

export function useBowelLogsForDay(localDate: string) {
  return useDayQuery('bowel-logs', localDate, (db, userId) =>
    listBowelLogsForLocalDate(db, { userId, localDate })
  );
}

export function useWellbeingLogsForDay(localDate: string) {
  return useDayQuery('wellbeing-logs', localDate, (db, userId) =>
    listWellbeingLogsForLocalDate(db, { userId, localDate })
  );
}

export function useContextLogsForDay(localDate: string) {
  return useDayQuery('context-logs', localDate, (db, userId) =>
    listContextLogsForLocalDate(db, { userId, localDate })
  );
}

/**
 * Builds a save mutation for one log type.
 *
 * The write completes when SQLite commits; sync is requested afterwards and its outcome is
 * deliberately not awaited. Whether the network is there changes nothing about whether the
 * entry was recorded.
 */
function useLogMutation<TDraft extends { occurredAt: Date }>(
  kind: string,
  logKind: LogEntryKind,
  write: (
    db: Awaited<ReturnType<typeof openDatabase>>,
    userId: string,
    draft: TDraft,
    timeZone: string
  ) => Promise<{ occurredLocalDate: string }>
) {
  const { userId } = useAuth();
  const { syncNow } = useSync();
  const queryClient = useQueryClient();

  return useMutation<string, Error, TDraft>({
    mutationFn: async (draft: TDraft) => {
      if (userId === null) throw new Error('Not signed in.');

      const db = await openDatabase();
      const log = await write(db, userId, draft, resolveTimeZone());
      return log.occurredLocalDate;
    },

    onSuccess: async (localDate: string) => {
      trackLogSaved(logKind, 'created');

      if (userId !== null) {
        await queryClient.invalidateQueries({ queryKey: dayLogsQueryKey(kind, userId, localDate) });
      }
      syncNow();
    },
  });
}

export function useLogBowel() {
  return useLogMutation<BowelDraft>('bowel-logs', 'bowel', (db, userId, draft, timeZone) =>
    createBowelLog(db, { userId, draft, timeZone }, { now: new Date(), generateId: newId })
  );
}

export function useLogContext() {
  return useLogMutation<ContextDraft>('context-logs', 'context', (db, userId, draft, timeZone) =>
    createContextLog(db, { userId, draft, timeZone }, { now: new Date(), generateId: newId })
  );
}

/**
 * Records a good day (spec §44).
 *
 * One tap, and deliberately so: this is the pattern engine's control group, and anything that
 * slows it down shrinks it. A control group only the most diligent users produce is a biased one.
 */
export function useLogWellbeing() {
  return useLogMutation<WellbeingDraft>(
    'wellbeing-logs',
    'wellbeing',
    (db, userId, draft, timeZone) =>
      createWellbeingLog(db, { userId, draft, timeZone }, { now: new Date(), generateId: newId })
  );
}
