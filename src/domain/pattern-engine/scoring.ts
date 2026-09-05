/**
 * Turning a comparison into one of the five things the product is allowed to say (spec §58).
 *
 * This is the last gate before a number becomes a claim a person reads about their own health,
 * and the single place where the product's central promise is kept or broken.
 *
 * **Sample size is gated here, on counts, directly.** Not on the confidence composite, and
 * emphatically not on whether the uncertainty band excludes zero — `comparisons.ts` documents
 * that Newcombe's interval is liberal at the extremes and calls a 2-of-2 against 0-of-2 table
 * conclusive when Fisher's exact test would not. A statistical band cannot be the thing that
 * stops the app announcing a signal because something happened twice; an explicit count can.
 *
 * The five statuses come from `domain/patterns/status.ts`, which is the product-safety
 * vocabulary shared by every surface. There is deliberately no "confirmed trigger".
 */

import type { PatternStatus } from '@/domain/patterns/status';

import type { ComparisonMetrics, ConsistencyMetrics } from './types';

/** Below this in *either* group, the engine says nothing at all. */
export const MIN_GROUP_FOR_ANY_CLAIM = 5;

/** Below this, a difference can only ever be described as emerging. */
export const MIN_GROUP_FOR_MODERATE = 10;

/** Below this, a difference can never be described as a stronger recurring signal. */
export const MIN_GROUP_FOR_STRONG = 15;

/**
 * The smallest difference in outcome rate worth mentioning: 15 percentage points.
 *
 * Below this, a difference is not interesting even when the sample is large — and reporting
 * every measurable wobble is precisely how a scan across dozens of factors turns noise into
 * findings (§61).
 */
export const MIN_MEANINGFUL_DIFFERENCE = 0.15;

/** Weeks that must be comparable before repetition can be claimed. */
export const MIN_WEEKS_FOR_STRONG = 3;

/** How many of those weeks must point the same way. */
export const MIN_AGREEMENT_FOR_STRONG = 0.7;

export const MIN_CONFIDENCE_FOR_MODERATE = 0.5;
export const MIN_CONFIDENCE_FOR_STRONG = 0.7;

export type ScoringInput = {
  metrics: ComparisonMetrics;
  consistency: ConsistencyMetrics;
  /** From `assessConfidence`. */
  confidence: number;
};

export function scoreStatus({ metrics, consistency, confidence }: ScoringInput): PatternStatus {
  // Gated on the smaller group: a hundred exposed days against three controls is a comparison
  // of three, whatever the other number says.
  const smallerGroup = Math.min(metrics.exposedCount, metrics.controlCount);

  if (smallerGroup < MIN_GROUP_FOR_ANY_CLAIM) return 'insufficient_data';

  // Direction is irrelevant to strength. Something that appears to go with *fewer* symptoms is
  // as real a finding as the reverse, and the user deserves both.
  const effect = Math.abs(metrics.absoluteDifference);

  if (effect < MIN_MEANINGFUL_DIFFERENCE) return 'no_clear_pattern';

  const repeats =
    consistency.agreementRate !== null &&
    consistency.comparableWeeks >= MIN_WEEKS_FOR_STRONG &&
    consistency.agreementRate >= MIN_AGREEMENT_FOR_STRONG;

  if (smallerGroup >= MIN_GROUP_FOR_STRONG && confidence >= MIN_CONFIDENCE_FOR_STRONG && repeats) {
    return 'stronger_recurring_signal';
  }

  if (smallerGroup >= MIN_GROUP_FOR_MODERATE && confidence >= MIN_CONFIDENCE_FOR_MODERATE) {
    return 'moderate';
  }

  return 'emerging';
}
