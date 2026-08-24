import { View } from 'react-native';

import { Card, EmptyState, Screen, Text } from '@/components/ui';
import { PATTERN_STATUS_COPY, PATTERN_STATUSES } from '@/domain/patterns/status';
import { useTheme } from '@/theme';

/**
 * Insights — patterns, trends, experiments, reviews (spec §49).
 *
 * Milestone 2 delivers the shell and an honest empty state. Findings arrive only once the
 * deterministic engine exists (M8) and there is enough data for it to say something — and
 * the empty state deliberately does not promise that an insight will appear after N days.
 *
 * The status explainer is real product content: it sets the expectation, before a user ever
 * sees a finding, that GutSignal reports strength of evidence rather than verdicts.
 */
export default function InsightsScreen() {
  const theme = useTheme();

  return (
    <Screen scroll floatingNav>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xl }}>
        <Text variant="title">Insights</Text>

        <EmptyState
          title="Not enough information yet"
          body="GutSignal compares what you log over time. Once there are enough comparable entries, anything that recurs will show up here."
          hint="Keep logging normally — including the days you feel fine."
        />

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="secondary">
            WHAT YOU&apos;LL SEE
          </Text>

          <Card>
            <View style={{ gap: theme.spacing.md }}>
              {PATTERN_STATUSES.map((status) => (
                <View key={status} style={{ gap: 2 }}>
                  <Text variant="cardTitle">{PATTERN_STATUS_COPY[status].label}</Text>
                  <Text variant="body" color="secondary">
                    {PATTERN_STATUS_COPY[status].description}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <Card elevation="flat">
            <Text variant="caption" color="secondary">
              These describe how consistently something appeared alongside your symptoms in your own
              logs. They are not diagnoses, and they do not establish that one factor caused
              another.
            </Text>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
