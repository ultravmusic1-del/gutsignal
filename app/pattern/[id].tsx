import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  Card,
  Divider,
  EmptyState,
  Metric,
  Screen,
  SectionHeader,
  StatusPill,
  Text,
} from '@/components/ui';
import {
  calculationSteps,
  comparisonNumbers,
  confidenceWord,
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
import { STATUS_TONE } from '@/features/insights/statusTone';
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

  // See the note in insights.tsx: a disabled query is neither loading nor loaded.
  if (insights.isLoading || insights.data === undefined) {
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
  const numbers = comparisonNumbers(finding);
  const steps = calculationSteps(finding);

  return (
    <Screen scroll topInset={false} floatingNav>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.lg }}>
        {/* Header: what this is about, how strong it is, and how much it rests on. */}
        <View style={{ gap: theme.spacing.xs, alignItems: 'flex-start' }}>
          <Text variant="title">{finding.factor.label}</Text>

          {/* The status as a pill, matching the card the user tapped to get here. It used to be
              the first half of a body sentence — "Moderate signal · 12 days recorded with it" —
              which asked the reader to parse a status and a sample size out of one line, and made
              the strength of the evidence look like a caption. */}
          <StatusPill label={status.label} tone={STATUS_TONE[finding.status]} />

          <Text variant="caption" color="secondary">
            {finding.metrics.exposedCount} {finding.metrics.exposedCount === 1 ? 'day' : 'days'}{' '}
            recorded with it · {formatLocalDate(finding.analysisStart)} to{' '}
            {formatLocalDate(finding.analysisEnd)}
          </Text>
        </View>

        <Section title="WHAT WE OBSERVED">
          <Card>
            <View style={{ gap: theme.spacing.md }}>
              <Text variant="body">{observationSentence(finding)}</Text>

              <Divider />

              {/* The two figures side by side, each labelled with the group it came from and the
                  number of days behind it. A figure without its denominator is a claim without
                  its evidence — and what the figure is (a rate, or an average intensity) follows
                  the outcome rather than being assumed. */}
              <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                <ValueColumn
                  label={`On ${numbers.exposed.label}`}
                  value={numbers.exposed.value}
                  days={numbers.exposed.days}
                />
                <ValueColumn
                  label={`On ${numbers.control.label}`}
                  value={numbers.control.value}
                  days={numbers.control.days}
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

/**
 * A titled group on this screen.
 *
 * Now the shared `SectionHeader`, so the evidence screen is laid out the same way as Insights and
 * the weekly review. It previously used a bare overline, which is why the three screens a user
 * moves between while following one finding each looked like a different product.
 *
 * Titles arrive in caps from the call sites; the header lowercases them into a sentence-case title
 * with its own small overline above, which is what stops a screen of five all-caps lines reading
 * as five equally shouty things.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader title={sentenceCase(title)} />
      {children}
    </View>
  );
}

/** "WHAT WE OBSERVED" to "What we observed". */
const sentenceCase = (value: string) => value.charAt(0) + value.slice(1).toLocaleLowerCase();

/**
 * One side of the comparison.
 *
 * Takes an already-formatted value rather than a rate: what the figure *is* depends on the
 * outcome, and this column used to assume it was always a percentage — which rendered an
 * intensity finding as one.
 */
function ValueColumn({ label, value, days }: { label: string; value: string; days: number }) {
  return (
    // The two sides of a comparison are the one place in the app where two numbers must be read
    // against each other, so they are the strongest case for a shared metric treatment: tabular
    // figures line the two values up, and the reserved label height keeps them on the same
    // baseline whether or not one group's name wraps.
    //
    // `basis` is the day count. It was already here as a third line of caption — putting it in the
    // slot named for it is what stops a future edit separating a figure from its denominator.
    <Metric
      label={label}
      value={value}
      basis={`${days} ${days === 1 ? 'day' : 'days'}`}
      style={{ flex: 1 }}
    />
  );
}
