import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Divider, Icon, Text } from '@/components/ui';
import type { Finding } from '@/domain/pattern-engine/types';
import type { GutMapEntry, GutMapGroup } from '@/domain/patterns/gutMap';
import { useTheme } from '@/theme';

/**
 * The Gut Map (spec §52): every factor examined, grouped by what can be said about it.
 *
 * **This must not look like diagnosis output** — the spec says so outright. So there are no
 * traffic lights, no scores, no severity badges and no risk language; just headings a user can
 * read and rows they can open. `CLAUDE.md` §36 forbids colour as the only signal anyway, and the
 * moment four coloured columns appear on a health screen they read as a verdict.
 *
 * The negative groups matter as much as the positive ones. "We looked at dairy and found nothing
 * consistent" is a result the user earned by logging, and a screen that only ever surfaces
 * problems teaches people that logging produces bad news.
 */

type Props = {
  groups: GutMapGroup[];
  onSelect: (finding: Finding) => void;
};

function GutMapComponent({ groups, onSelect }: Props) {
  const theme = useTheme();

  if (groups.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {groups.map((group) => (
        <View key={group.key} style={{ gap: theme.spacing.xs }}>
          <View style={{ gap: 2 }}>
            {/* The heading carries the meaning, in words. Nothing here depends on colour. */}
            <Text variant="cardTitle">{group.title}</Text>
            <Text variant="caption" color="secondary">
              {group.description}
            </Text>
          </View>

          <Card elevation="flat" padding="md">
            {group.entries.map((entry, index) => (
              <View key={entry.factor.key}>
                {index > 0 ? <Divider /> : null}
                <GutMapRow entry={entry} onSelect={onSelect} />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

function GutMapRow({ entry, onSelect }: { entry: GutMapEntry; onSelect: Props['onSelect'] }) {
  const theme = useTheme();

  // Spoken as one phrase, so VoiceOver does not read a bare factor name with no indication of
  // what opening it would show.
  const accessibilityLabel = `${entry.factor.label}, ${entry.findingCount} ${
    entry.findingCount === 1 ? 'comparison' : 'comparisons'
  }`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens what was observed"
      onPress={() => onSelect(entry.finding)}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        minHeight: theme.spacing.minTouchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
      })}
    >
      <Text variant="body" style={{ flex: 1 }}>
        {entry.factor.label}
      </Text>

      {/* How much was looked at, quietly. A user comparing two rows deserves to know one rests on
          nine comparisons and the other on one. */}
      <Text variant="caption" color="tertiary">
        {entry.findingCount}
      </Text>

      <Icon name="chevronRight" size={16} color={theme.colors.text.tertiary} />
    </Pressable>
  );
}

export const GutMap = memo(GutMapComponent);
