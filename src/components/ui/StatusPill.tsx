import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type StatusTone = 'neutral' | 'positive' | 'caution' | 'danger' | 'accent';

export type StatusPillProps = {
  label: string;
  tone?: StatusTone;
  style?: ViewStyle;
};

/**
 * A small state marker: a dot and a word.
 *
 * ## Why the dot is not the state
 *
 * A coloured dot is the fastest thing on a screen to read, and it is also the least reliable: it
 * is invisible to a screen reader, ambiguous to anyone who cannot separate the hues, and
 * meaningless to a first-time user who has not learned the key. `CLAUDE.md` §36 rules it out as a
 * sole carrier, and this component is built so that rule cannot be broken by a call site — the
 * label is required, the dot is not configurable, and the two always travel together.
 *
 * So the dot is doing what it is actually good for: making a set of pills scannable *after* the
 * words have been read once.
 *
 * ## Why so quiet
 *
 * The fill is a low-opacity wash of the tone rather than the tone itself, and the text is the full
 * tone. A saturated pill is louder than almost anything it will sit beside — and in a health
 * diary, "this state is coloured red" is a sentence with more weight than it has earned (§34: no
 * neon, and calm before emphatic).
 */
export function StatusPill({ label, tone = 'neutral', style }: StatusPillProps) {
  const theme = useTheme();

  const colour = {
    neutral: theme.colors.text.secondary,
    positive: theme.colors.status.positive,
    caution: theme.colors.status.caution,
    danger: theme.colors.status.danger,
    accent: theme.colors.accent.text,
  }[tone];

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.surface.sunken,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
        },
        style,
      ]}
    >
      <View
        // Decorative, and marked as such: the label beside it already carries the meaning, so a
        // screen reader announcing a second thing here would only add noise.
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colour }}
      />
      <Text variant="caption" style={{ color: colour }}>
        {label}
      </Text>
    </View>
  );
}
