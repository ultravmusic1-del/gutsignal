import { useQuery } from '@tanstack/react-query';

import { analyse } from '@/domain/pattern-engine/engine';
import { buildWeeklyReview, weekBefore, weekEnding } from '@/domain/reports/weeklyReview';
import type { WeeklyReview } from '@/domain/reports/weeklyReview';
import { useAuth } from '@/features/auth/AuthProvider';
import { todayLocalDate } from '@/features/logs/useSymptomLogs';
import { openDatabase } from '@/services/db/database';
import { defaultAnalysisRange, loadLogSet } from '@/services/logs/logSetRepository';

/**
 * The weekly review's data.
 *
 * Two log sets and one analysis. The week and the week before it are loaded separately rather than
 * as one fortnight and sliced, because they are the two things the review compares and keeping
 * them apart makes it impossible to accidentally count a day in both.
 *
 * Findings are computed over the **full analysis range**, not over the week. Seven days is far too
 * short to support an association, and running the engine on it would produce exactly the
 * underpowered conclusions §21 exists to prevent. The review shows the standing findings from the
 * user's whole diary alongside the week's numbers; it does not derive new ones from a week.
 */

export const weeklyReviewQueryKey = (userId: string, weekEnd: string) =>
  ['weekly-review', userId, weekEnd] as const;

/** A week's numbers only change when the diary does, and every log mutation invalidates broadly. */
const STALE_TIME_MS = 60_000;

export function useWeeklyReview() {
  const { userId } = useAuth();

  const today = todayLocalDate();
  const week = weekEnding(today);

  return useQuery<WeeklyReview>({
    queryKey: userId ? weeklyReviewQueryKey(userId, week.end) : ['weekly-review', 'anonymous'],

    queryFn: async () => {
      const db = await openDatabase();
      const analysisRange = defaultAnalysisRange(today);

      const [logs, previousLogs, analysisLogs] = await Promise.all([
        loadLogSet(db, { userId: userId as string, range: week }),
        loadLogSet(db, { userId: userId as string, range: weekBefore(week) }),
        loadLogSet(db, { userId: userId as string, range: analysisRange }),
      ]);

      return buildWeeklyReview({
        logs,
        previousLogs,
        findings: analyse({ logs: analysisLogs, range: analysisRange }),
        range: week,
        generatedAt: new Date(),
      });
    },

    enabled: Boolean(userId),
    staleTime: STALE_TIME_MS,
  });
}
