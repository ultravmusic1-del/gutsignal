import { View } from 'react-native';

import { Card, Chip, Text } from '@/components/ui';
import { mealSummary, mealTagLabel } from '@/domain/logs/meal';
import { severityLabel, symptomLabel } from '@/domain/logs/symptom';
import { formatLocalTime } from '@/domain/time/occurrence';
import { useMealsForDay } from '@/features/logs/useMealLogs';
import { todayLocalDate, useSymptomLogsForDay } from '@/features/logs/useSymptomLogs';
import { useTheme } from '@/theme';

/**
 * What the user has logged today (spec §33).
 *
 * Meals and symptoms in one list, ordered by when they happened, because that is how the day
 * was actually lived — and because seeing them interleaved is the first hint of the
 * relationships the pattern engine will later examine properly.
 *
 * Reads from SQLite, so it is correct with no connection and shows entries the server has never
 * seen. Anything still queued carries a quiet line rather than a warning: a log waiting to sync
 * is working exactly as designed.
 */

type Entry =
  | {
      kind: 'meal';
      id: string;
      occurredAt: string;
      occurredTz: string;
      syncPending: boolean;
      title: string;
      detail: string;
      tags: string[];
    }
  | {
      kind: 'symptom';
      id: string;
      occurredAt: string;
      occurredTz: string;
      syncPending: boolean;
      title: string;
      detail: string;
      note: string | null;
    };

export function TodayEntries() {
  const theme = useTheme();
  const localDate = todayLocalDate();

  const symptoms = useSymptomLogsForDay(localDate);
  const meals = useMealsForDay(localDate);

  const isPending = symptoms.isPending || meals.isPending;
  const isError = symptoms.isError || meals.isError;

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
      kind: 'meal',
      id: meal.id,
      occurredAt: meal.occurredAt,
      occurredTz: meal.occurredTz,
      syncPending: meal.syncPending,
      title: meal.title,
      detail: mealSummary(meal),
      tags: meal.tags.map(mealTagLabel),
    })),
    ...(symptoms.data ?? []).map<Entry>((symptom) => ({
      kind: 'symptom',
      id: symptom.id,
      occurredAt: symptom.occurredAt,
      occurredTz: symptom.occurredTz,
      syncPending: symptom.syncPending,
      title: symptomLabel(symptom.symptomType),
      detail: `${severityLabel(symptom.severity)} · ${symptom.severity}/10`,
      note: symptom.note,
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
        <Card key={`${entry.kind}-${entry.id}`} elevation="flat">
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
            <Text variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              {formatLocalTime(entry.occurredAt, entry.occurredTz)}
            </Text>

            <View style={{ flex: 1, gap: 2 }}>
              {/* The kind is named in text, never carried by colour alone (CLAUDE.md §36). */}
              <Text variant="caption" color="tertiary">
                {entry.kind === 'meal' ? 'Meal' : 'Symptom'}
              </Text>

              <Text variant="cardTitle">{entry.title}</Text>

              {entry.detail.length > 0 ? (
                <Text variant="caption" color="secondary">
                  {entry.detail}
                </Text>
              ) : null}

              {entry.kind === 'symptom' && entry.note ? (
                <Text variant="caption" color="secondary">
                  {entry.note}
                </Text>
              ) : null}

              {entry.kind === 'meal' && entry.tags.length > 0 ? (
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
