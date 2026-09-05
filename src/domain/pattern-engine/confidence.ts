/**
 * How much a comparison deserves to be believed (spec §57–§61).
 *
 * Confidence here is **not a probability**. It is a deliberately conservative composite of the
 * things that can each independently make a difference untrustworthy, and it is reported
 * alongside the counts rather than instead of them.
 *
 * It is the **minimum** of its components, not their average. A chain is as strong as its
 * weakest link, and averaging lets a well-tracked month paper over a sample of four, or a large
 * sample paper over the fact that two factors were never apart. Taking the minimum also makes
 * the explanation fall out for free: whichever component is lowest is the honest answer to "why
 * isn't this more certain?", and every weak component contributes a line the user can read.
 *
 * Every threshold is a judgement rather than a measurement, and is documented in
 * `docs/PATTERN_ENGINE.md`.
 */

import type { ComparisonMetrics, ConsistencyMetrics, TrackingCompleteness } from './types';

/** Group size at which sample size stops limiting confidence. */
export const FULL_SAMPLE = 20;

/** A component at or below this earns a plain-language line in `limitations`. */
export const WEAK_COMPONENT = 0.6;

/**
 * The most confidence available when week-to-week consistency could not be measured.
 *
 * Too few comparable weeks is not evidence of consistency — it is the absence of evidence about
 * it, and must not score as full marks.
 */
export const UNMEASURED_CONSISTENCY = 0.5;

/**
 * How the width of the uncertainty band maps onto precision.
 *
 * The band is on a *difference* of two rates, so it can span anything from 0 to 2 — normalising
 * against 1 would score a genuinely informative result as vague. These anchor instead on what
 * the width means: a band no wider than twice the smallest difference worth mentioning pins the
 * answer down usefully, while one spanning a full 100 percentage points says almost nothing.
 */
export const PRECISE_WIDTH = 0.3;
export const USELESS_WIDTH = 1;

export type ConfidenceInput = {
  metrics: ComparisonMetrics;
  consistency: ConsistencyMetrics;
  trackingCompleteness: TrackingCompleteness;
  /** Strongest overlap with any co-occurring factor, 0–1. See `confounders.ts`. */
  maxConfounderOverlap: number;
};

export type ConfidenceComponents = {
  /** How many comparable observations there were, gated by the smaller group. */
  sample: number;
  /** How much of the analysed range the user logged anything at all. */
  coverage: number;
  /** How consistently the association held week to week. */
  consistency: number;
  /** How narrow the uncertainty band is. */
  precision: number;
  /** How separable this factor was from the ones that travelled with it. */
  confounding: number;
};

export type ConfidenceAssessment = {
  confidence: number;
  components: ConfidenceComponents;
  /** Every reason confidence was held back, in language a user can read. */
  limitations: string[];
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function assessConfidence({
  metrics,
  consistency,
  trackingCompleteness,
  maxConfounderOverlap,
}: ConfidenceInput): ConfidenceAssessment {
  // A hundred exposed days against three controls is a sample of three.
  const smallerGroup = Math.min(metrics.exposedCount, metrics.controlCount);

  const components: ConfidenceComponents = {
    sample: clamp(smallerGroup / FULL_SAMPLE),
    coverage: clamp(trackingCompleteness.coverage),
    consistency:
      consistency.agreementRate === null
        ? UNMEASURED_CONSISTENCY
        : clamp(consistency.agreementRate),
    // A band spanning the whole range says nothing; a narrow one pins the answer down.
    precision:
      metrics.confidenceInterval === null
        ? 0
        : clamp(
            (USELESS_WIDTH - (metrics.confidenceInterval.high - metrics.confidenceInterval.low)) /
              (USELESS_WIDTH - PRECISE_WIDTH)
          ),
    confounding: clamp(1 - maxConfounderOverlap),
  };

  const confidence = Math.min(...Object.values(components));

  const limitations: string[] = [];

  if (components.sample <= WEAK_COMPONENT) {
    limitations.push(
      `This is based on ${smallerGroup} comparable ${smallerGroup === 1 ? 'day' : 'days'} in the smaller group, which is not many.`
    );
  }

  if (components.coverage <= WEAK_COMPONENT) {
    limitations.push(
      'You logged on less than two thirds of the days in this period, so a lot of it is unknown.'
    );
  }

  if (consistency.agreementRate === null) {
    limitations.push(
      'There were not enough weeks with both kinds of day to check whether this repeats.'
    );
  } else if (components.consistency <= WEAK_COMPONENT) {
    limitations.push(
      `This showed up in ${consistency.agreeingWeeks} of ${consistency.comparableWeeks} comparable weeks, so it is not consistent.`
    );
  }

  if (components.precision <= WEAK_COMPONENT) {
    limitations.push('The range of possible differences is still wide.');
  }

  if (components.confounding <= WEAK_COMPONENT) {
    // Spec §60's exact framing: they travelled together, which makes them hard to separate.
    // Never that one caused the other.
    limitations.push(
      'This often happened at the same time as something else in your logs, which makes their individual relationships harder to separate.'
    );
  }

  return { confidence, components, limitations };
}
