import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Divider, EmptyState, Screen, Text } from '@/components/ui';
import {
  calculationSteps,
  confidenceWord,
  exposurePhrases,
  findByFindingId,
  formatLocalDate,
  nextStep,
  observationSentence,
  thingsToConsider,
} from '@/domain/patterns/findingDetail';
import { outcomeLabel } from '@/domain/patterns/outcomeLabels';
import { PATTERN_STATUS_COPY } from '@/domain/patterns/status';
import { useScreenView } from '@/features/analytics/useScreenView';
import { track } from '@/services/analytics/analytics';
import { useInsights } from '@/features/insights/useInsights';
import { useTheme } from '@/theme';

/**
 * Pattern detail — where GutSignal shows its working (spec §51).
 *
 * "Transparency is a feature." Everything on this page comes from the `Finding` the engine
 * produced, and the "How this was calculated" section exists so a sceptical user can check the
 * arithmetic rather than take the headline on trust. Nothing is computed here.
 *
 * **The finding is looked up, not passed.** Findings are recomputed from local logs rather than
 * stored, so the route carries an id and this screen reads the same cached `useInsights` query the
 * list rendered from. That means a deep link works, a reload works, and — importantly — a finding
 * that no longer holds after an edit simply is not found, which this screen says out loud.
 */
export default function PatternDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insights = useInsights();
  const [showCalculation, setShowCalculation] = useState(false);

  const finding = insights.isSuccess ? findByFindingId(insights.data.findings, id ?? '') : null;

  // Above every early return, because hooks cannot be conditional. Null until the finding actually
  // resolves: a detail page that could not find its finding was opened, but it was not a pattern
  // the user got to look at.
  useScreenView('pattern_detail_opened', finding === null ? null : {});

  if (insights.isPending) {
    return (
      <Screen scroll topInset={false}>
        <View style={{ paddingTop: theme.spacing.xl }}>
          <Text variant="body" color="secondary">
            Looking through your logs…
          </Text>
        </View>
      </Screen>
    );
  }

  if (finding === null) {
    return (
      <Screen scroll topInset={false}>
        <EmptyState
          title={
            insights.isError ? 'This could not be worked out' : 'This pattern is no longer here'
          }
          body={
            insights.isError
              ? 'Nothing has been lost — this is a problem reading from this device, not with your saved entries.'
              : 'Findings are worked out from your logs each time you open Insights, so one can disappear when an entry is edited or removed. Nothing has gone wrong.'
          }
          hint={insights.isError ? undefined : 'Go back to Insights to see what stands out now.'}
        />
      </Screen>
    );
  }

  const status = PATTERN_STATUS_COPY[finding.status];
  const considerations = thingsToConsider(finding);
  const { present, absent } = exposurePhrases(finding.factor);
  const steps = calculationSteps(finding);

  return (
    <Screen scroll topInset={false} floatingNav>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.lg }}>
        {/* Header: what this is about, how strong it is, and how much it rests on. */}
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="title">{finding.factor.label}</Text>
          <Text variant="body" color="secondary">
            {status.label} · {finding.metrics.exposedCount}{' '}
            {finding.metrics.exposedCount === 1 ? 'day' : 'days'} recorded with it
          </Text>
          <Text variant="caption" color="tertiary">
            {formatLocalDate(finding.analysisStart)} to {formatLocalDate(finding.analysisEnd)}
          </Text>
        </View>

        <Section title="WHAT WE OBSERVED">
          <Card>
            <View style={{ gap: theme.spacing.md }}>
              <Text variant="body">{observationSentence(finding)}</Text>

              <Divider />

              {/* The two rates side by side, each labelled with the group it came from and the
                  number of days behind it. A percentage without its denominator is a claim
                  without its evidence. */}
              <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                <RateColumn
                  label={`On ${present}`}
                  rate={finding.metrics.exposedOutcomeRate}
                  days={finding.metrics.exposedCount}
                />
                <RateColumn
                  label={`On ${absent}`}
                  rate={finding.metrics.controlOutcomeRate}
                  days={finding.metrics.controlCount}
                />
              </View>

              <Text variant="caption" color="tertiary">
                Measured as: {outcomeLabel(finding.outcome.kind, finding.outcome.symptomType)}.
              </Text>
            </View>
          </Card>
        </Section>

        {considerations.length > 0 ? (
          <Section title="THINGS TO CONSIDER">
            <Card>
              <View style={{ gap: theme.spacing.sm }}>
                {considerations.map((consideration) => (
                  <Text key={consideration} variant="body" color="secondary">
                    {consideration}
                  </Text>
                ))}
              </View>
            </Card>
          </Section>
        ) : null}

        <Section title="CONFIDENCE">
          <Card>
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="cardTitle">{confidenceWord(finding.confidence)}</Text>
              <Text variant="body" color="secondary">
                {status.description}
              </Text>

              {/* Every reason confidence was held back, in full. These are the honest part of
                  the page and they are never collapsed behind a tap. */}
              {finding.limitations.length > 0 ? (
                <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.xxs }}>
                  {finding.limitations.map((limitation) => (
                    <Text key={limitation} variant="caption" color="tertiary">
                      {limitation}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          </Card>
        </Section>

        <Section title="NEXT STEP">
          <Card>
            <Text variant="body" color="secondary">
              {nextStep(finding)}
            </Text>
          </Card>
        </Section>

        {/* Spec §51: "Provide How this was calculated. Transparency is a feature."
            Collapsed by default because most readers will not want it, and never hidden. */}
        <View style={{ gap: theme.spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showCalculation }}
            accessibilityLabel="How this was calculated"
            accessibilityHint={
              showCalculation ? 'Hides the working' : 'Shows the numbers behind this'
            }
            onPress={() => {
              // Outside the updater, which React may run twice — and only on the way open. Counting
              // the collapse as well would double every reader who tidies up after themselves.
              if (!showCalculation) track('pattern_calculation_expanded');
              setShowCalculation((shown) => !shown);
            }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              minHeight: theme.spacing.minTouchTarget,
              justifyContent: 'center',
            })}
          >
            <Text variant="overline" color="accent">
              {showCalculation ? 'HIDE THE WORKING' : 'HOW THIS WAS CALCULATED'}
            </Text>
          </Pressable>

          {showCalculation ? (
            <Card elevation="flat">
              <View style={{ gap: theme.spacing.md }}>
                {steps.map((step) => (
                  <View key={step.label} style={{ gap: 2 }}>
                    <Text variant="cardTitle">{step.label}</Text>
                    <Text variant="body" color="secondary">
                      {step.detail}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}
        </View>

        <Text variant="caption" color="tertiary">
          This describes how often two things appeared together in your own logs. It is not a
          diagnosis, and it does not establish that one thing caused the other.
        </Text>
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="overline" color="secondary">
        {title}
      </Text>
      {children}
    </View>
  );
}

function RateColumn({ label, rate, days }: { label: string; rate: number; days: number }) {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="metric">{Math.round(rate * 100)}%</Text>
      <Text variant="caption" color="secondary" style={{ marginTop: theme.spacing.xxs }}>
        {label}
      </Text>
      <Text variant="caption" color="tertiary">
        {days} {days === 1 ? 'day' : 'days'}
      </Text>
    </View>
  );
}
