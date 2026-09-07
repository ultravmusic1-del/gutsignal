import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

/** Reserved label height, so values line up across a grid whatever the labels do. */
const LABEL_LINES = 2;
const CAPTION_LINE_HEIGHT = 18;

export type MetricTone = 'default' | 'positive' | 'caution' | 'muted';

export type MetricProps = {
  /** What the number is. Sits above it, small — the number is the thing being read. */
  label: string;
  /** Already formatted by the caller. This component never rounds, scales or interprets. */
  value: string;
  /** `%`, `min`, `of 10`. Small, beside the value. */
  unit?: string;
  /**
   * What the number is out of, in words.
   *
   * Not decoration. GutSignal's whole promise is that a claim arrives with its evidence, and a
   * rate without its denominator is the single easiest way to overstate a diary
   * (`CLAUDE.md` §17, §19). "5" means nothing; "5 of the 7 days you reported on" is a fact.
   */
  basis?: string;
  tone?: MetricTone;
  /** Fill the row it sits in, for grids. */
  block?: boolean;
  style?: ViewStyle;
};

/**
 * A single number, presented as the point of its own card.
 *
 * ## Why this exists
 *
 * GutSignal is full of numbers rendered as body text inside a label/value row — "Days with an
 * entry … 5 of 7". That is readable and completely flat: a week's tracking and a footnote get the
 * same visual weight, so nothing on the screen tells you what to look at first.
 *
 * A number set large, light and tight reads as a measurement rather than as a sentence, and it
 * gives a screen the one thing GutSignal's screens have consistently lacked — a place for the eye
 * to land.
 *
 * ## The rules it enforces
 *
 * **Tabular figures.** Digits are the same width, so a value that changes does not shuffle the
 * layout underneath it, and two metrics in a column line up on the decimal.
 *
 * **The unit is not the value.** `%` is small and sits on the value's baseline, so "78.3%" is one
 * measurement rather than a number and a word.
 *
 * **The basis travels with the number.** `basis` is rendered directly beneath, in the same block,
 * so a rate cannot be laid out apart from its denominator by a careless parent.
 *
 * Tone tints the value only, and never carries meaning alone — the label and basis always say what
 * the number is (§36).
 */
export function Metric({
  label,
  value,
  unit,
  basis,
  tone = 'default',
  block = false,
  style,
}: MetricProps) {
  const theme = useTheme();

  const valueColor = {
    default: theme.colors.text.primary,
    positive: theme.colors.status.positive,
    caution: theme.colors.status.caution,
    muted: theme.colors.text.tertiary,
  }[tone];

  return (
    <View
      accessible
      // One phrase, in the order a person would say it. Read as three separate fragments this is
      // "Days with an entry", "5", "of 7" — which is not a sentence anyone would speak.
      accessibilityLabel={[label, value, unit, basis].filter(Boolean).join(' ')}
      style={[{ gap: theme.spacing.xxs, alignSelf: block ? 'stretch' : 'flex-start' }, style]}
    >
      {/* Two lines are reserved whether or not the label needs them.

          Metrics are read in grids, and a label that wraps in one cell and not the next pushes its
          number half a line down — which reads as a mistake rather than as a longer label. Holding
          the space costs one line of air above a short label, which the reference dashboards have
          anyway. */}
      <Text
        variant="caption"
        color="secondary"
        numberOfLines={2}
        style={{ minHeight: LABEL_LINES * CAPTION_LINE_HEIGHT }}
      >
        {label}
      </Text>

      {/* Baseline-aligned rather than centred: a unit centred against a 56pt number floats in the
          middle of it and stops looking attached to anything. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        {/* No `adjustsFontSizeToFit`. It shrinks per-cell, so "6.4" rendered visibly smaller than
            "5" in the same row and the set stopped scanning as one thing. A metric that genuinely
            does not fit is a formatting problem for the caller, not something to hide by
            silently changing the type size. */}
        <Text
          variant="metricDisplay"
          style={{ color: valueColor, fontVariant: ['tabular-nums'] }}
          numberOfLines={1}
        >
          {value}
        </Text>

        {unit === undefined ? null : (
          <Text variant="metricUnit" color="secondary">
            {unit}
          </Text>
        )}
      </View>

      {basis === undefined ? null : (
        <Text variant="caption" color="tertiary">
          {basis}
        </Text>
      )}
    </View>
  );
}
