import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type EmptyStateProps = {
  title: string;
  body: string;
  /** Optional third line for a gentle next step. Never a promise about results. */
  hint?: string;
};

/**
 * Every list and analysis surface in GutSignal has a designed empty state (spec §118).
 *
 * The copy rules matter as much as the layout: an empty Insights screen must say that there
 * is not enough information YET, without promising that an insight will appear after N days
 * (spec §32) and without implying anything diagnostic.
 */
export function EmptyState({ title, body, hint }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="summary"
      style={{
        paddingVertical: theme.spacing.xxl,
        paddingHorizontal: theme.spacing.md,
        gap: theme.spacing.xs,
        alignItems: 'flex-start',
      }}
    >
      <Text variant="section">{title}</Text>
      <Text variant="body" color="secondary">
        {body}
      </Text>
      {hint ? (
        <Text variant="caption" color="tertiary" style={{ marginTop: theme.spacing.xxs }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
