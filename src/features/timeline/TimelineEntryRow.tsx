import { memo } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Card, Chip, Text } from '@/components/ui';
import type { LogEntry } from '@/domain/logs/entry';
import { formatLocalTime } from '@/domain/time/occurrence';
import { useTheme } from '@/theme';

/**
 * One entry in the timeline.
 *
 * Memoized because the list re-renders on every page fetch and every filter keystroke, and an
 * entry's appearance depends only on the entry itself.
 *
 * Tap edits. Long-press offers delete behind a confirmation, because a tombstone is easy to
 * create by accident on a scrolling list and the entry is a piece of the user's own history.
 * The same two actions are exposed as accessibility actions, so nothing here depends on being
 * able to long-press precisely (CLAUDE.md §36).
 */

type Props = {
  entry: LogEntry;
  onEdit: (entry: LogEntry) => void;
  onDelete: (entry: LogEntry) => void;
};

function TimelineEntryRowComponent({ entry, onEdit, onDelete }: Props) {
  const theme = useTheme();

  const confirmDelete = () => {
    Alert.alert(
      'Delete this entry?',
      `${entry.kindLabel} · ${entry.title}\n\nThis removes it from your diary and from any pattern GutSignal works out later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(entry) },
      ]
    );
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.kindLabel}, ${entry.title}, ${formatLocalTime(
        entry.occurredAt,
        entry.occurredTz
      )}`}
      accessibilityHint="Opens this entry for editing"
      accessibilityActions={[
        { name: 'activate', label: 'Edit' },
        { name: 'magicTap', label: 'Delete' },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'magicTap') confirmDelete();
        else onEdit(entry);
      }}
      onPress={() => onEdit(entry)}
      onLongPress={confirmDelete}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Card elevation="flat">
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
    </Pressable>
  );
}

export const TimelineEntryRow = memo(TimelineEntryRowComponent);
