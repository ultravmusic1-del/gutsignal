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

import type { ComparisonMetrics, ConsistencyMetrics, Outcome } from './types';

/**
 * The width of the severity scale, which users enter as 1–10.
 *
 * A difference of means is measured in points on that scale, while every threshold here is
 * expressed as a fraction. Dividing by the span converts one into the other, so
 * `MIN_MEANINGFUL_DIFFERENCE` of 0.15 means "15 percentage points of occurrence" for one kind of
 * outcome and "1.35 points of intensity" for the other.
 *
 * That correspondence is a judgement, not a measurement, and is written down in
 * `docs/PATTERN_ENGINE.md` §6 so it can be argued with rather than discovered.
 */
export const SEVERITY_SCALE_SPAN = 9;

/** How large a comparison's difference is, and which way it points. */
export type ComparisonEffect = {
  /** 0–1, comparable across outcome kinds. */
  magnitude: number;
  /** `1`, `-1` or `0`. */
  direction: number;
};

/**
 * The difference a finding is actually about.
 *
 * Every outcome except one is a thing that either happened or did not, so the difference in
 * *rates* is the whole story. `symptom_severity` is not: its rate metrics are the occurrence
 * metrics — `outcomeOccurredOn` returns the same boolean for both kinds — so scoring it from
 * `absoluteDifference` measured how *often* a symptom appeared and called the answer intensity.
 *
 * Two groups reporting a symptom equally often at wildly different strengths therefore scored
 * `no_clear_pattern`: the engine read the one number that was identical between them. That is not
 * conservatism, it is confidence about the wrong quantity.
 */
export function comparisonEffect(outcome: Outcome, metrics: ComparisonMetrics): ComparisonEffect {
  if (outcome.kind === 'symptom_severity') {
    // The engine does not emit a severity finding without both means (see `engine.ts`), so a null
    // here means the caller built metrics by hand. Nothing is the honest answer either way.
    const difference = metrics.meanSeverityDifference ?? 0;

    return {
      magnitude: Math.abs(difference) / SEVERITY_SCALE_SPAN,
      direction: Math.sign(difference),
    };
  }

  return {
    magnitude: Math.abs(metrics.absoluteDifference),
    direction: Math.sign(metrics.absoluteDifference),
  };
}

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
  /** Which question was asked. Decides *which* difference the threshold below applies to. */
  outcome: Outcome;
  metrics: ComparisonMetrics;
  consistency: ConsistencyMetrics;
  /** From `assessConfidence`. */
  confidence: number;
};

export function scoreStatus({
  outcome,
  metrics,
  consistency,
  confidence,
}: ScoringInput): PatternStatus {
  // Gated on the smaller group: a hundred exposed days against three controls is a comparison
  // of three, whatever the other number says.
  const smallerGroup = Math.min(metrics.exposedCount, metrics.controlCount);

  if (smallerGroup < MIN_GROUP_FOR_ANY_CLAIM) return 'insufficient_data';

  // Direction is irrelevant to strength. Something that appears to go with *fewer* symptoms is
  // as real a finding as the reverse, and the user deserves both.
  //
  // Which difference this is depends on the outcome: a rate difference for the five occurrence
  // kinds, a mean-intensity difference on its own scale for `symptom_severity`.
  const effect = comparisonEffect(outcome, metrics).magnitude;

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
