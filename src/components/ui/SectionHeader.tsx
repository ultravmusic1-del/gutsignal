import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type SectionHeaderProps = {
  /** Small label above the title — "YOUR WEEK", "WHAT STANDS OUT". */
  overline?: string;
  title: string;
  /** One sentence under the title. Where a section needs qualifying, it is qualified here. */
  description?: string;
  /** A control on the right of the title row — usually a small button. */
  action?: React.ReactNode;
  /** Hairline beneath. Off for the first section on a screen, where it reads as a stray line. */
  rule?: boolean;
  style?: ViewStyle;
};

/**
 * The heading above a group of cards.
 *
 * ## Why a component rather than two `Text`s
 *
 * Every screen was writing its own: an `overline` here, a `cardTitle` there, sometimes a caption
 * under it, sometimes not, with the gap chosen fresh each time. The result reads as several
 * different products stacked vertically — and it is the cheapest kind of inconsistency to fix,
 * because nothing about it was a decision.
 *
 * The hairline is the borrowed idea. A rule under a heading does more for perceived structure than
 * any amount of extra whitespace: it tells the eye where one thing ends, which is exactly what a
 * long scrolling screen of similar-looking cards fails to do.
 *
 * The overline is set in the accent colour and the title in primary. That pairing is the one place
 * GutSignal's accent appears as text at small size, and it is what makes a section heading look
 * *placed* rather than merely bold.
 */
export function SectionHeader({
  overline,
  title,
  description,
  action,
  rule = true,
  style,
}: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[{ gap: theme.spacing.xs }, style]}>
      <View style={{ gap: 2 }}>
        {overline === undefined ? null : (
          <Text variant="overline" color="accent">
            {overline.toUpperCase()}
          </Text>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
          }}
        >
          {/* The header is one accessibility element, so the label and title are announced
              together rather than as two unrelated lines. The action stays separately focusable. */}
          <Text
            variant="section"
            accessibilityRole="header"
            style={{ flex: 1 }}
            accessibilityLabel={overline === undefined ? title : `${overline}. ${title}`}
          >
            {title}
          </Text>

          {action}
        </View>

        {description === undefined ? null : (
          <Text variant="caption" color="secondary">
            {description}
          </Text>
        )}
      </View>

      {rule ? <View style={{ height: 1, backgroundColor: theme.colors.border.subtle }} /> : null}
    </View>
  );
}
