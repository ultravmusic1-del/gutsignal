import { Pressable, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Rendered on a dark surface (floating nav, hero sections). */
  onInverse?: boolean;
  style?: ViewStyle;
};

/**
 * Pill chip used for filters and multi-select answers.
 * Selection is conveyed by `accessibilityState.selected` as well as by fill, so it is never
 * colour-only (CLAUDE.md §36).
 */
export function Chip({ label, selected = false, onPress, onInverse = false, style }: ChipProps) {
  const theme = useTheme();

  const background = selected
    ? theme.colors.accent.solid
    : onInverse
      ? theme.colors.surface.inverse
      : theme.colors.surface.card;

  const labelColor = selected ? 'onAccent' : onInverse ? 'onInverse' : 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 40,
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.pill,
          backgroundColor: background,
          borderWidth: selected ? 0 : 1,
          borderColor: onInverse ? theme.colors.border.onInverse : theme.colors.border.subtle,
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Text variant="caption" color={labelColor}>
        {label}
      </Text>
    </Pressable>
  );
}
