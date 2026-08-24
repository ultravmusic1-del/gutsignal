import { View } from 'react-native';

import { Card, Chip, Text } from '@/components/ui';
import { bowelSummary, urgencyLabel } from '@/domain/logs/bowel';
import { contextSummary } from '@/domain/logs/context';
import { mealSummary, mealTagLabel } from '@/domain/logs/meal';
import { severityLabel, symptomLabel } from '@/domain/logs/symptom';
import { formatLocalTime } from '@/domain/time/occurrence';
import { useMealsForDay } from '@/features/logs/useMealLogs';
import {
  useBowelLogsForDay,
  useContextLogsForDay,
  useWellbeingLogsForDay,
} from '@/features/logs/useSimpleLogs';
import { todayLocalDate, useSymptomLogsForDay } from '@/features/logs/useSymptomLogs';
import { useTheme } from '@/theme';

/**
 * What the user has logged today (spec §33).
 *
 * Every entry type in one list, ordered by when it happened, because that is how the day was
 * actually lived — and because seeing meals, symptoms and context interleaved is the first hint
 * of the relationships the pattern engine will later examine properly.
 *
 * Reads from SQLite, so it is correct with no connection and shows entries the server has never
 * seen. Anything still queued carries a quiet line rather than a warning: a log waiting to sync
 * is working exactly as designed.
 */

type Entry = {
  key: string;
  /** Named in text, never carried by colour alone (CLAUDE.md §36). */
  kindLabel: string;
  occurredAt: string;
  occurredTz: string;
  syncPending: boolean;
  title: string;
  detail: string | null;
  note: string | null;
  tags: string[];
};

export function TodayEntries() {
  const theme = useTheme();
  const localDate = todayLocalDate();

  const meals = useMealsForDay(localDate);
  const symptoms = useSymptomLogsForDay(localDate);
  const bowel = useBowelLogsForDay(localDate);
  const wellbeing = useWellbeingLogsForDay(localDate);
  const context = useContextLogsForDay(localDate);

  const sources = [meals, symptoms, bowel, wellbeing, context];
  const isPending = sources.some((source) => source.isPending);
  const isError = sources.some((source) => source.isError);

  if (isPending) {
    return (
      <Card>
        <Text variant="body" color="secondary">
          Loading today&apos;s entries…
        </Text>
      </Card>
    );
  }

  if (isError) {
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

  const entries: Entry[] = [
    ...(meals.data ?? []).map<Entry>((meal) => ({
      key: `meal-${meal.id}`,
      kindLabel: 'Meal',
      occurredAt: meal.occurredAt,
      occurredTz: meal.occurredTz,
      syncPending: meal.syncPending,
      title: meal.title,
      detail: mealSummary(meal),
      note: meal.note,
      tags: meal.tags.map(mealTagLabel),
    })),

    ...(symptoms.data ?? []).map<Entry>((symptom) => ({
      key: `symptom-${symptom.id}`,
      kindLabel: 'Symptom',
      occurredAt: symptom.occurredAt,
      occurredTz: symptom.occurredTz,
      syncPending: symptom.syncPending,
      title: symptomLabel(symptom.symptomType),
      detail: `${severityLabel(symptom.severity)} · ${symptom.severity}/10`,
      note: symptom.note,
      tags: [],
    })),

    ...(bowel.data ?? []).map<Entry>((log) => ({
      key: `bowel-${log.id}`,
      kindLabel: 'Bowel movement',
      occurredAt: log.occurredAt,
      occurredTz: log.occurredTz,
      syncPending: log.syncPending,
      title: bowelSummary(log),
      detail: `Urgency: ${urgencyLabel(log.urgency)}`,
      note: log.note,
      tags: log.incomplete ? ['Felt unfinished'] : [],
    })),

    ...(wellbeing.data ?? []).map<Entry>((log) => ({
      key: `wellbeing-${log.id}`,
      kindLabel: 'Feeling good',
      occurredAt: log.occurredAt,
      occurredTz: log.occurredTz,
      syncPending: log.syncPending,
      title: 'A good moment',
      // No metric, and deliberately none: this is an observation that the day was fine, and
      // it earns its place by being a comparison point, not by being detailed.
      detail: null,
      note: log.note,
      tags: [],
    })),

    ...(context.data ?? []).map<Entry>((log) => ({
      key: `context-${log.id}`,
      kindLabel: 'Context',
      occurredAt: log.occurredAt,
      occurredTz: log.occurredTz,
      syncPending: log.syncPending,
      title: contextSummary(log),
      detail: null,
      note: log.note,
      tags: [],
    })),
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
        <Card key={entry.key} elevation="flat">
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
            <Text variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              {formatLocalTime(entry.occurredAt, entry.occurredTz)}
            </Text>

            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="caption" color="tertiary">
                {entry.kindLabel}
              </Text>

              <Text variant="cardTitle">{entry.title}</Text>

              {entry.detail ? (
                <Text variant="caption" color="secondary">
                  {entry.detail}
                </Text>
              ) : null}

              {entry.note ? (
                <Text variant="caption" color="secondary">
                  {entry.note}
                </Text>
              ) : null}

              {entry.tags.length > 0 ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: theme.spacing.xxs,
                    paddingTop: theme.spacing.xxs,
                  }}
                >
                  {entry.tags.map((tag) => (
                    <Chip key={tag} label={tag} />
                  ))}
                </View>
              ) : null}

              {entry.syncPending ? (
                <Text variant="caption" color="tertiary">
                  Saved on this device — will sync when you&apos;re online
                </Text>
              ) : null}
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}
