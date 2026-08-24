import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { severityLabel, symptomLabel } from '@/domain/logs/symptom';
import { formatLocalTime } from '@/domain/time/occurrence';
import { useSymptomLogsForDay, todayLocalDate } from '@/features/logs/useSymptomLogs';
import { useTheme } from '@/theme';

/**
 * What the user has logged today (spec §33).
 *
 * Reads from SQLite, so it is correct with no connection and shows entries the server has
 * never seen. Anything still queued carries a quiet "Saved on this device" line rather than a
 * warning icon — a log waiting to sync is working exactly as designed, not an error state.
 */
export function TodaySymptomList() {
  const theme = useTheme();
  const localDate = todayLocalDate();
  const { data, isPending, isError } = useSymptomLogsForDay(localDate);

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

  const entries = data ?? [];

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
        <Card key={entry.id} elevation="flat">
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: theme.spacing.md,
            }}
          >
            <Text variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              {formatLocalTime(entry.occurredAt, entry.occurredTz)}
            </Text>

            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="cardTitle">{symptomLabel(entry.symptomType)}</Text>

              {/* Intensity is named, never conveyed by a colour or a bar alone (§36). */}
              <Text variant="caption" color="secondary">
                {severityLabel(entry.severity)} · {entry.severity}/10
              </Text>

              {entry.note ? (
                <Text variant="caption" color="secondary">
                  {entry.note}
                </Text>
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
