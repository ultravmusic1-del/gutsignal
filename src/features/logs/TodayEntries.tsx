import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import {
  bowelEntry,
  contextEntry,
  editRouteFor,
  mealEntry,
  symptomEntry,
  wellbeingEntry,
  type LogEntry,
} from '@/domain/logs/entry';
import { useMealsForDay } from '@/features/logs/useMealLogs';
import {
  useBowelLogsForDay,
  useContextLogsForDay,
  useWellbeingLogsForDay,
} from '@/features/logs/useSimpleLogs';
import { todayLocalDate, useSymptomLogsForDay } from '@/features/logs/useSymptomLogs';
import { TimelineEntryRow } from '@/features/timeline/TimelineEntryRow';
import { useDeleteEntry } from '@/features/timeline/useTimeline';
import { useTheme } from '@/theme';

/**
 * What the user has logged today (spec §33).
 *
 * Every entry type in one list, ordered by when it happened, because that is how the day was
 * lived — and because seeing meals, symptoms and context interleaved is the first hint of the
 * relationships the pattern engine will later examine properly.
 *
 * The mapping to a display entry and the row itself are shared with the Timeline. Two screens
 * showing the same entry differently would be a small bug that is very hard to notice.
 *
 * Reads from SQLite, so it is correct with no connection and shows entries the server has never
 * seen. Anything still queued says so quietly rather than as a warning: a log waiting to sync is
 * working exactly as designed.
 */
export function TodayEntries() {
  const theme = useTheme();
  const router = useRouter();
  const localDate = todayLocalDate();

  const meals = useMealsForDay(localDate);
  const symptoms = useSymptomLogsForDay(localDate);
  const bowel = useBowelLogsForDay(localDate);
  const wellbeing = useWellbeingLogsForDay(localDate);
  const context = useContextLogsForDay(localDate);
  const deleteEntry = useDeleteEntry();

  const onEdit = useCallback(
    (entry: LogEntry) => router.push(editRouteFor(entry) as '/log/symptom'),
    [router]
  );

  const onDelete = useCallback(
    (entry: LogEntry) => deleteEntry.mutate({ kind: entry.kind, id: entry.id }),
    [deleteEntry]
  );

  // Memoized because `TimelineEntryRow` is `memo`'d and compares props by identity. Built inline,
  // every entry object was new on every render, so the memo never held and the whole day
  // re-rendered whenever anything else on Today changed — which is now more often, since Today
  // gained the quick-log tiles and the progress card. The Timeline does the same thing for the
  // same reason; this was the copy that did not.
  const entries: LogEntry[] = useMemo(
    () =>
      [
        ...(meals.data ?? []).map((meal) => mealEntry(meal, meal.syncPending)),
        ...(symptoms.data ?? []).map((log) => symptomEntry(log, log.syncPending)),
        ...(bowel.data ?? []).map((log) => bowelEntry(log, log.syncPending)),
        ...(wellbeing.data ?? []).map((log) => wellbeingEntry(log, log.syncPending)),
        ...(context.data ?? []).map((log) => contextEntry(log, log.syncPending)),
      ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    [meals.data, symptoms.data, bowel.data, wellbeing.data, context.data]
  );

  const sources = [meals, symptoms, bowel, wellbeing, context];

  if (sources.some((source) => source.isLoading)) {
    return (
      <Card>
        <Text variant="body" color="secondary">
          Loading today&apos;s entries…
        </Text>
      </Card>
    );
  }

  if (sources.some((source) => source.isError)) {
    return (
      <Card>
        <Text variant="cardTitle">Today&apos;s entries could not be read</Text>
        <View style={{ height: theme.spacing.xxs }} />
        <Text variant="body" color="secondary">
          Nothing has been lost — this is a problem reading from this device, not with your saved
          entries. Reopening the app usually clears it.
        </Text>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      /* Shorter than it was, and pointing at the right control.

         It used to end with "Use the + button to add an entry", which stopped being true the day
         the quick-log tiles arrived directly above it — the hint was sending people past the
         faster route to the slower one. And four lines of body copy explaining what a diary is for
         is a lot to put between someone and their day, every day, until they log something.

         What survives is the part that is actually useful to a new user: that an ordinary day is
         worth recording, which is the least obvious thing about this app and the one the pattern
         engine most depends on. */
      <Card>
        <Text variant="cardTitle">Nothing logged today</Text>
        <View style={{ height: theme.spacing.xxs }} />
        <Text variant="body" color="secondary">
          A meal, a symptom, or simply that you feel fine — the ordinary days count as much as the
          difficult ones.
        </Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="overline" color="secondary">
        TODAY
      </Text>

      {entries.map((entry) => (
        <TimelineEntryRow
          key={`${entry.kind}:${entry.id}`}
          entry={entry}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
}
