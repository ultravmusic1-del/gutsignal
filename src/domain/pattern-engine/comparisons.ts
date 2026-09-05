/**
 * The arithmetic behind a finding (spec §57).
 *
 * Two rules govern everything in this file.
 *
 * **Only observed days count.** The exposed and control groups are built exclusively from days
 * where the outcome could actually be seen. A day nobody logged is counted separately, as
 * `unknownCount`, and never enters a denominator — the missing-data defence in
 * `observations.ts` would be pointless if the arithmetic quietly undid it.
 *
 * **Every division has a denominator that could be zero.** In a health app that must produce an
 * honest `null`, never a `NaN` rendered on a screen and never an "infinitely more likely".
 *
 * There are deliberately no p-values here. Spec §57 forbids a single p-value as user-facing
 * truth, and an interval that visibly crosses zero communicates uncertainty far better than a
 * threshold the reader has to take on faith.
 *
 * **The interval is not a sample-size guard.** Newcombe's method is liberal at the extremes: on
 * a 2-of-2 against 0-of-2 table it excludes zero, while Fisher's exact test on the same table
 * gives roughly p = 0.17. That is a known property of the method rather than a defect, but it
 * means `scoring.ts` must gate on observation counts directly and must never treat "the
 * interval excludes zero" as sufficient evidence (spec §58). There is a test named for this.
 */

import type { ComparisonMetrics, ConsistencyMetrics, Observation } from './types';

/** 95%. The only confidence level the engine reports. */
const Z = 1.959_963_984_540_054;

/** Observations where the outcome was actually seen. */
function observed(observations: Observation[]): Observation[] {
  return observations.filter((observation) => observation.outcomeState !== 'no_data');
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Wilson score interval for a proportion.
 *
 * Chosen over the normal approximation because the normal interval runs outside 0–1 at the
 * extremes, and a rate of "−8%" on a health screen is indefensible. Wilson also behaves
 * sensibly when a group is all-or-nothing, which is common in a young diary.
 *
 * An empty sample returns the whole range: with no observations, every rate is equally
 * consistent with what was seen.
 */
export function wilsonInterval(successes: number, total: number): { low: number; high: number } {
  if (total <= 0) return { low: 0, high: 1 };

  const proportion = successes / total;
  const denominator = 1 + (Z * Z) / total;
  const centre = (proportion + (Z * Z) / (2 * total)) / denominator;
  const margin =
    (Z / denominator) *
    Math.sqrt((proportion * (1 - proportion)) / total + (Z * Z) / (4 * total * total));

  return {
    low: Math.max(0, centre - margin),
    high: Math.min(1, centre + margin),
  };
}

/**
 * Newcombe's interval for the difference between two proportions.
 *
 * Built from the two Wilson intervals rather than from a pooled normal approximation, so it
 * stays honest on the small, lopsided samples a real diary produces — which is exactly where a
 * naive interval would understate uncertainty and make a coincidence look conclusive.
 */
function differenceInterval(
  exposedSuccesses: number,
  exposedTotal: number,
  controlSuccesses: number,
  controlTotal: number
): { low: number; high: number } | null {
  if (exposedTotal === 0 || controlTotal === 0) return null;

  const exposedRate = exposedSuccesses / exposedTotal;
  const controlRate = controlSuccesses / controlTotal;

  const exposedBand = wilsonInterval(exposedSuccesses, exposedTotal);
  const controlBand = wilsonInterval(controlSuccesses, controlTotal);

  const difference = exposedRate - controlRate;

  const lowSpread = Math.sqrt(
    (exposedRate - exposedBand.low) ** 2 + (controlBand.high - controlRate) ** 2
  );
  const highSpread = Math.sqrt(
    (exposedBand.high - exposedRate) ** 2 + (controlRate - controlBand.low) ** 2
  );

  return {
    low: Math.max(-1, difference - lowSpread),
    high: Math.min(1, difference + highSpread),
  };
}

/** Everything that can be said about one factor and one outcome from a set of observations. */
export function compare(observations: Observation[]): ComparisonMetrics {
  const seen = observed(observations);

  const exposedGroup = seen.filter((observation) => observation.exposed);
  const controlGroup = seen.filter((observation) => !observation.exposed);

  const exposedCount = exposedGroup.length;
  const controlCount = controlGroup.length;
  const unknownCount = observations.length - seen.length;

  const exposedOutcomes = exposedGroup.filter((observation) => observation.outcomeOccurred).length;
  const controlOutcomes = controlGroup.filter((observation) => observation.outcomeOccurred).length;

  const exposedOutcomeRate = exposedCount === 0 ? 0 : exposedOutcomes / exposedCount;
  const controlOutcomeRate = controlCount === 0 ? 0 : controlOutcomes / controlCount;

  const exposedMeanSeverity = mean(
    exposedGroup.flatMap((o) => (o.outcomeValue === null ? [] : [o.outcomeValue]))
  );
  const controlMeanSeverity = mean(
    controlGroup.flatMap((o) => (o.outcomeValue === null ? [] : [o.outcomeValue]))
  );

  return {
    exposedCount,
    controlCount,
    unknownCount,

    exposedOutcomeRate,
    controlOutcomeRate,
    absoluteDifference: exposedOutcomeRate - controlOutcomeRate,
    // "Infinitely more likely" is not a statement this product may make.
    relativeRisk: controlOutcomeRate === 0 ? null : exposedOutcomeRate / controlOutcomeRate,

    exposedMeanSeverity,
    controlMeanSeverity,
    meanSeverityDifference:
      exposedMeanSeverity === null || controlMeanSeverity === null
        ? null
        : exposedMeanSeverity - controlMeanSeverity,

    confidenceInterval: differenceInterval(
      exposedOutcomes,
      exposedCount,
      controlOutcomes,
      controlCount
    ),
  };
}

/** The Monday-based week an ISO date falls in. Deterministic and timezone-free. */
function weekKey(localDate: string): string {
  const at = Date.parse(`${localDate}T00:00:00Z`);
  if (Number.isNaN(at)) return localDate;

  const date = new Date(at);
  // getUTCDay is 0 for Sunday; shift so weeks start on Monday.
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  return new Date(at - dayOfWeek * 86_400_000).toISOString().slice(0, 10);
}

/**
 * How consistently the association held week to week (§57, §61).
 *
 * A difference driven entirely by one unusual week is a much weaker claim than the same
 * difference repeated across several, and repeated-period consistency is one of the few defences
 * against a coincidence that survives every other check.
 *
 * A week counts as comparable only when it contains observed days on **both** sides. Weeks where
 * the user only ate the thing, or only avoided it, cannot speak to a difference at all.
 */
export function weeklyConsistency(
  observations: Observation[],
  overallDifference: number
): ConsistencyMetrics {
  const weeks = new Map<string, Observation[]>();

  for (const observation of observed(observations)) {
    const key = weekKey(observation.localDate);
    weeks.set(key, [...(weeks.get(key) ?? []), observation]);
  }

  let comparableWeeks = 0;
  let agreeingWeeks = 0;

  for (const week of weeks.values()) {
    const exposedGroup = week.filter((observation) => observation.exposed);
    const controlGroup = week.filter((observation) => !observation.exposed);

    if (exposedGroup.length === 0 || controlGroup.length === 0) continue;

    comparableWeeks += 1;

    const exposedRate = exposedGroup.filter((o) => o.outcomeOccurred).length / exposedGroup.length;
    const controlRate = controlGroup.filter((o) => o.outcomeOccurred).length / controlGroup.length;

    const weekDifference = exposedRate - controlRate;

    if (
      (overallDifference > 0 && weekDifference > 0) ||
      (overallDifference < 0 && weekDifference < 0)
    ) {
      agreeingWeeks += 1;
    }
  }

  // With no overall direction there is nothing for a week to agree with, and reporting "100%
  // consistent" would be meaningless.
  const agreementRate =
    comparableWeeks === 0 || overallDifference === 0 ? null : agreeingWeeks / comparableWeeks;

  return { comparableWeeks, agreeingWeeks, agreementRate };
}
