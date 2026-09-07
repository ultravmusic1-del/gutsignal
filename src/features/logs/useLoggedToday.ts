import type { LoggedToday } from '@/domain/logs/quickActions';

import { useMealsForDay } from './useMealLogs';
import { useBowelLogsForDay, useContextLogsForDay, useWellbeingLogsForDay } from './useSimpleLogs';
import { useSymptomLogsForDay } from './useSymptomLogs';

/**
 * What today already holds, by kind.
 *
 * Uses the same five day queries `TodayEntries` does. That is not a duplicate read: TanStack
 * dedupes by query key, so both components share one set of results and one trip to SQLite.
 *
 * A query that has not answered yet reports `false` rather than blocking. The only thing this
 * feeds is button ordering, and holding the screen back for it would trade something the user
 * cares about for something they will not notice.
 */
export function useLoggedToday(localDate: string): LoggedToday {
  const meals = useMealsForDay(localDate);
  const symptoms = useSymptomLogsForDay(localDate);
  const bowel = useBowelLogsForDay(localDate);
  const wellbeing = useWellbeingLogsForDay(localDate);
  const context = useContextLogsForDay(localDate);

  return {
    meal: (meals.data?.length ?? 0) > 0,
    symptom: (symptoms.data?.length ?? 0) > 0,
    bowel: (bowel.data?.length ?? 0) > 0,
    wellbeing: (wellbeing.data?.length ?? 0) > 0,
    context: (context.data?.length ?? 0) > 0,
  };
}
