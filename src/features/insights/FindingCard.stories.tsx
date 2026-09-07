import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import type { Factor, Finding } from '@/domain/pattern-engine/types';
import type { PatternStatus } from '@/domain/patterns/status';

import { FindingCard } from './FindingCard';

/**
 * The most consequential component in the app.
 *
 * A finding card is where the pattern engine speaks to a person, and every word on it is
 * constrained: association language only, never a cause and never a condition (§17); the counts on
 * the front rather than behind a tap, because a rate without its denominator is a claim without
 * its evidence; and the limitations on the front too, so a caveat never waits on a detail screen
 * the user may not open.
 *
 * These stories exist to check that those rules survive contact with layout — that a long factor
 * name does not push the numbers off the card, that three limitations do not turn into a wall, and
 * that a `no_clear_pattern` card is visibly not a finding.
 */

const DAIRY: Factor = { key: 'meal_item:dairy', label: 'Dairy', source: 'meal_item' };
const SLEEP: Factor = { key: 'poor_sleep', label: 'Poorer sleep', source: 'context' };
const LONG: Factor = {
  key: 'meal_item:oat milk in the afternoon',
  label: 'Oat milk in the afternoon',
  source: 'meal_item',
};

function aFinding(factor: Factor, status: PatternStatus, over: Partial<Finding> = {}): Finding {
  return {
    engineVersion: '1.0.0',
    factor,
    outcome: { kind: 'symptom_occurrence', symptomType: 'bloating' },
    analysisStart: '2026-06-01',
    analysisEnd: '2026-08-30',
    window: 'later_same_day',
    metrics: {
      exposedCount: 12,
      controlCount: 14,
      unknownCount: 3,
      exposedOutcomeRate: 0.5,
      controlOutcomeRate: 0.25,
      absoluteDifference: 0.25,
      relativeRisk: 2,
      exposedMeanSeverity: null,
      controlMeanSeverity: null,
      meanSeverityDifference: null,
      confidenceInterval: { low: 0.05, high: 0.45 },
    },
    consistency: { comparableWeeks: 6, agreeingWeeks: 5, agreementRate: 5 / 6 },
    confounders: [],
    trackingCompleteness: {
      totalDays: 90,
      daysWithAnyLog: 65,
      daysWithGoodState: 20,
      daysWithSymptom: 30,
      coverage: 65 / 90,
    },
    status,
    confidence: 0.72,
    limitations: [],
    generatedAt: '2026-08-31T09:00:00.000Z',
    ...over,
  } as Finding;
}

const meta = {
  title: 'Insights/FindingCard',
  component: FindingCard,
} satisfies Meta<typeof FindingCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const StrongerSignal: Story = {
  args: { finding: aFinding(DAIRY, 'stronger_recurring_signal'), onPress: () => {} },
};

export const Moderate: Story = {
  args: { finding: aFinding(DAIRY, 'moderate'), onPress: () => {} },
};

/** Kept visually distinct from a finding: an early signal is a different kind of statement. */
export const Emerging: Story = {
  args: { finding: aFinding(SLEEP, 'emerging'), onPress: () => {} },
};

/** The engine looked and found nothing. This must not read as a weak finding. */
export const NoClearPattern: Story = {
  args: { finding: aFinding(DAIRY, 'no_clear_pattern'), onPress: () => {} },
};

/**
 * Limitations on the front of the card.
 *
 * Three at once is the realistic worst case, and the layout question is whether the caveats
 * overwhelm the claim they qualify — or get lost under it.
 */
export const WithLimitations: Story = {
  args: {
    finding: aFinding(DAIRY, 'moderate', {
      limitations: [
        'Based on a small number of days.',
        'Coffee occurred on most of the same days, so the two are hard to tell apart.',
        'Your logging was uneven across this period.',
      ],
    }),
    onPress: () => {},
  },
};

/** Days with nothing recorded are named, never folded into a rate (§19). */
export const WithUnrecordedDays: Story = {
  args: {
    finding: aFinding(DAIRY, 'moderate', {
      metrics: { ...aFinding(DAIRY, 'moderate').metrics, unknownCount: 21 },
    }),
    onPress: () => {},
  },
};

/** A factor in the user's own words, long enough to wrap. */
export const LongContent: Story = {
  args: {
    finding: aFinding(LONG, 'moderate', {
      limitations: ['Based on a small number of days.'],
    }),
    onPress: () => {},
  },
};

/** Not tappable — how the card renders inside the printed appointment report. */
export const NotTappable: Story = {
  args: { finding: aFinding(DAIRY, 'moderate') },
};

/**
 * The Insights screen's real stack.
 *
 * Cards are read against each other rather than one at a time, so this is where an inconsistent
 * rhythm between a card with limitations and one without becomes obvious.
 */
export const AsAList: Story = {
  // `args` is required by the typed meta even though `render` ignores it entirely.
  args: { finding: aFinding(DAIRY, 'moderate') },
  render: () => (
    <View style={{ gap: 12 }}>
      <FindingCard finding={aFinding(DAIRY, 'stronger_recurring_signal')} onPress={() => {}} />
      <FindingCard
        finding={aFinding(SLEEP, 'moderate', {
          limitations: ['Based on a small number of days.'],
        })}
        onPress={() => {}}
      />
      <FindingCard finding={aFinding(LONG, 'emerging')} onPress={() => {}} />
    </View>
  ),
};
