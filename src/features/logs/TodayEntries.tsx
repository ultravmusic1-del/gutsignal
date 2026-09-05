import { useRouter } from 'expo-router';
import { useCallback } from 'react';
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

  const sources = [meals, symptoms, bowel, wellbeing, context];

  if (sources.some((source) => source.isPending)) {
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

  const entries: LogEntry[] = [
    ...(meals.data ?? []).map((meal) => mealEntry(meal, meal.syncPending)),
    ...(symptoms.data ?? []).map((log) => symptomEntry(log, log.syncPending)),
    ...(bowel.data ?? []).map((log) => bowelEntry(log, log.syncPending)),
    ...(wellbeing.data ?? []).map((log) => wellbeingEntry(log, log.syncPending)),
    ...(context.data ?? []).map((log) => contextEntry(log, log.syncPending)),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  if (entries.length === 0) {
    return (
      <Card>
        <Text variant="cardTitle">Nothing logged today</Text>
        <View style={{ height: theme.spacing.xxs }} />
        <Text variant="body" color="secondary">
          Your day starts empty. Anything you record — a meal, a symptom, a bowel movement, or
          simply that you feel good — becomes part of what GutSignal can compare later.
        </Text>
        <View style={{ height: theme.spacing.sm }} />
        <Text variant="caption" color="tertiary">
          Use the + button to add an entry.
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
