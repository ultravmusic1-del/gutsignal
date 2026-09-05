import { useQuery } from '@tanstack/react-query';

import { defaultAnalysisRange } from '@/services/logs/logSetRepository';
import type { DateRange } from '@/domain/pattern-engine/observations';
import { buildInsights, type Insights } from '@/domain/patterns/insights';
import { useAuth } from '@/features/auth/AuthProvider';
import { todayLocalDate } from '@/features/logs/useSymptomLogs';
import { openDatabase } from '@/services/db/database';
import { loadLogSet } from '@/services/logs/logSetRepository';

/**
 * Running the pattern engine for the Insights screen.
 *
 * Everything interesting happens in `buildInsights`, which is pure and tested on its own. This
 * hook does one thing: fetch the diary and hand it over.
 *
 * **Findings are computed, not fetched.** The engine reads local SQLite, so insights work with no
 * connection and always agree with what the user can see in their own timeline. Nothing here
 * talks to Supabase.
 */

export const insightsQueryKey = (userId: string, range: DateRange) =>
  ['insights', userId, range.start, range.end] as const;

/**
 * Findings are only stale when the logs change, and every log mutation already invalidates
 * broadly. A minute of staleness therefore costs nothing in correctness and avoids re-running
 * the engine every time the tab regains focus.
 */
const STALE_TIME_MS = 60_000;

export function useInsights(range?: DateRange) {
  const { userId } = useAuth();
  const analysisRange = range ?? defaultAnalysisRange(todayLocalDate());

  return useQuery<Insights>({
    queryKey: userId
      ? insightsQueryKey(userId, analysisRange)
      : ['insights', 'anonymous', analysisRange.start, analysisRange.end],

    queryFn: async () => {
      const db = await openDatabase();
      const logs = await loadLogSet(db, { userId: userId as string, range: analysisRange });

      // Synchronous, and fast at diary scale — a few hundred logs, measured in milliseconds.
      // If a multi-year history ever makes this noticeable it moves off the JS thread rather
      // than getting quietly slower (CLAUDE.md §37); the engine is pure and portable, which is
      // what makes that possible.
      return buildInsights({ logs, range: analysisRange });
    },

    enabled: Boolean(userId),
    staleTime: STALE_TIME_MS,
  });
}
