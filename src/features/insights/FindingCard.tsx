import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { comparisonNumbers, observationSentence } from '@/domain/patterns/findingDetail';
import { PATTERN_STATUS_COPY } from '@/domain/patterns/status';
import type { Finding } from '@/domain/pattern-engine/types';
import { useTheme } from '@/theme';

/**
 * One finding, as a person reads it (spec §50, §51).
 *
 * Every word here is constrained by `CLAUDE.md` §17. The card describes **how often two things
 * appeared together in this user's own records** — never that one did anything to the other, and
 * never anything about a condition.
 *
 * The status label is shown as text and never encoded in colour alone (§36), and the counts
 * behind the claim are on the card rather than buried in a detail screen: a difference stated
 * without its sample size invites more confidence than it has earned.
 */

type Props = {
  finding: Finding;
  onPress?: (finding: Finding) => void;
};

function FindingCardComponent({ finding, onPress }: Props) {
  const theme = useTheme();

  const status = PATTERN_STATUS_COPY[finding.status];

  // Association language, and only association language — and phrased by the same function the
  // detail screen and the report use. This card built its own sentence, which meant it carried
  // its own copy of the frequency wording and described an intensity finding as something
  // "recorded more often", a thing an intensity cannot be.
  const headline = observationSentence(finding);
  const numbers = comparisonNumbers(finding);

  const body = (
    <Card>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ gap: 2 }}>
          <Text variant="overline" color="secondary">
            {status.label.toUpperCase()}
          </Text>
          <Text variant="cardTitle">{headline}</Text>
        </View>

        {/* The arithmetic, in the open. A rate without its denominator is a claim without its
            evidence, and this product's whole promise is that the evidence is visible. */}
        <View style={{ gap: 2 }}>
          <Text variant="caption" color="secondary">
            {numbers.exposed.summary}, versus {numbers.control.summary}.
          </Text>

          {finding.metrics.unknownCount > 0 ? (
            <Text variant="caption" color="tertiary">
              {finding.metrics.unknownCount} more{' '}
              {finding.metrics.unknownCount === 1 ? 'day' : 'days'} had nothing recorded either way.
            </Text>
          ) : null}
        </View>

        {/* Never hidden behind a tap. If confidence was held back, the reason travels with the
            claim rather than waiting on a detail screen the user may never open. */}
        {finding.limitations.length > 0 ? (
          <View style={{ gap: 2 }}>
            {finding.limitations.map((limitation) => (
              <Text key={limitation} variant="caption" color="tertiary">
                {limitation}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );

  if (onPress === undefined) return body;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${status.label}. ${headline}`}
      accessibilityHint="Opens the evidence behind this"
      onPress={() => onPress(finding)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}

export const FindingCard = memo(FindingCardComponent);
