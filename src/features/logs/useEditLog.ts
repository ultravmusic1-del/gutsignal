import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BowelDraft, BowelLog } from '@/domain/logs/bowel';
import type { ContextDraft, ContextLog } from '@/domain/logs/context';
import type { LogEntryKind } from '@/domain/logs/entry';
import type { Meal, MealDraft } from '@/domain/logs/meal';
import type { SymptomDraft, SymptomLog } from '@/domain/logs/symptom';
import type { WellbeingDraft, WellbeingLog } from '@/domain/logs/wellbeing';
import { resolveTimeZone } from '@/domain/time/occurrence';
import { trackLogSaved } from '@/features/logs/logAnalytics';
import { useSync } from '@/features/sync/SyncProvider';
import { openDatabase } from '@/services/db/database';
import { getBowelLog, updateBowelLog } from '@/services/logs/bowelRepository';
import { getContextLog, updateContextLog } from '@/services/logs/contextRepository';
import { getMeal, updateMeal } from '@/services/logs/mealRepository';
import { getSymptomLog, updateSymptomLog } from '@/services/logs/symptomRepository';
import { getWellbeingLog, updateWellbeingLog } from '@/services/logs/wellbeingRepository';
import { newId } from '@/utils/id';

/**
 * Loading an existing entry to edit it, and saving the correction (spec §48).
 *
 * Editing goes through the same atomic path as creating: the row and its outbox entry commit
 * together, and coalescing means correcting an entry that has not synced yet still leaves
 * exactly one thing for the server to be told.
 *
 * An edit preserves `createdAt` and the entry's id. The user is correcting a record of
 * something that happened, not recording it again — which is what Repeat is for.
 */

const editQueryKey = (kind: string, id: string) => ['log-entry', kind, id] as const;

function useEntryQuery<T>(
  kind: string,
  id: string | undefined,
  load: (db: Awaited<ReturnType<typeof openDatabase>>, id: string) => Promise<T | null>
) {
  return useQuery<T | null>({
    queryKey: editQueryKey(kind, id ?? 'new'),
    queryFn: async () => load(await openDatabase(), id as string),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

export const useSymptomLogForEdit = (id?: string) =>
  useEntryQuery<SymptomLog>('symptom', id, getSymptomLog);
export const useMealForEdit = (id?: string) => useEntryQuery<Meal>('meal', id, getMeal);
export const useBowelLogForEdit = (id?: string) =>
  useEntryQuery<BowelLog>('bowel', id, getBowelLog);
export const useWellbeingLogForEdit = (id?: string) =>
  useEntryQuery<WellbeingLog>('wellbeing', id, getWellbeingLog);
export const useContextLogForEdit = (id?: string) =>
  useEntryQuery<ContextLog>('context', id, getContextLog);

/**
 * Builds the save mutation for one entry type.
 *
 * Invalidates broadly on success. An edit can move an entry to a different day and out of the
 * current filter, so the set of views it affects is not knowable from the entry alone — and
 * these queries all read local storage, where a refetch is cheap.
 */
function useUpdateMutation<TDraft, TResult>(
  kind: LogEntryKind,
  save: (
    db: Awaited<ReturnType<typeof openDatabase>>,
    id: string,
    draft: TDraft,
    timeZone: string
  ) => Promise<TResult | null>
) {
  const queryClient = useQueryClient();
  const { syncNow } = useSync();

  return useMutation<void, Error, { id: string; draft: TDraft }>({
    mutationFn: async ({ id, draft }) => {
      const db = await openDatabase();
      const saved = await save(db, id, draft, resolveTimeZone());

      if (saved === null) throw new Error('That entry is no longer here.');
    },

    onSuccess: async (_result, { id }) => {
      trackLogSaved(kind, 'edited');

      await queryClient.invalidateQueries();
      await queryClient.invalidateQueries({ queryKey: editQueryKey(kind, id) });
      syncNow();
    },
  });
}

const deps = () => ({ now: new Date(), generateId: newId });

export const useUpdateSymptomLog = () =>
  useUpdateMutation<SymptomDraft, SymptomLog>('symptom', (db, id, draft, timeZone) =>
    updateSymptomLog(db, { id, draft, timeZone }, deps())
  );

export const useUpdateMeal = () =>
  useUpdateMutation<MealDraft, Meal>('meal', (db, id, draft, timeZone) =>
    updateMeal(db, { id, draft, timeZone }, deps())
  );

export const useUpdateBowelLog = () =>
  useUpdateMutation<BowelDraft, BowelLog>('bowel', (db, id, draft, timeZone) =>
    updateBowelLog(db, { id, draft, timeZone }, deps())
  );

export const useUpdateWellbeingLog = () =>
  useUpdateMutation<WellbeingDraft, WellbeingLog>('wellbeing', (db, id, draft, timeZone) =>
    updateWellbeingLog(db, { id, draft, timeZone }, deps())
  );

export const useUpdateContextLog = () =>
  useUpdateMutation<ContextDraft, ContextLog>('context', (db, id, draft, timeZone) =>
    updateContextLog(db, { id, draft, timeZone }, deps())
  );
