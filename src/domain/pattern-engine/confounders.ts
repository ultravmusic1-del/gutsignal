/**
 * Factors that travelled together (spec §60, CLAUDE.md §20).
 *
 * Coffee and short sleep tend to arrive on the same days. When they do, a comparison that
 * credits the difference to coffee alone is overstating what the logs can show, and the product
 * must say so rather than pick a winner.
 *
 * **The measure is imbalance, not similarity.** What ruins a comparison is the other factor
 * being distributed *unevenly* between the exposed and control groups — not how often the two
 * things merely co-occur. A factor that appears on half the coffee days and half the other days
 * explains nothing about the difference between them, however much it overlaps. One that appears
 * on every coffee day and no others explains all of it.
 *
 * So overlap is `|P(other | target) − P(other | not target)|`: how differently the other factor
 * showed up on each side. Zero means it cannot account for any of the difference; one means it
 * accounts for all of it and the two cannot be told apart from this diary.
 */

import { measurementOf } from './factors';
import { exposureOn, type DayLogs } from './observations';
import type { Confounder, Factor } from './types';

/**
 * Overlap at or above this is reported to the user and drags confidence down.
 *
 * A judgement, not a measurement. Set where a difference in prevalence is large enough that
 * attributing the effect to one factor alone would be misleading.
 */
export const CONFOUNDER_THRESHOLD = 0.6;

const presentOn = (day: DayLogs, factor: Factor) => exposureOn(day, factor).exposed;

/**
 * How unevenly `other` was distributed across the days `target` was and was not present.
 *
 * Returns 0 when the target never appears or appears every day: with only one group there is no
 * split for anything to be uneven across, and reporting confounding would be meaningless.
 */
export function imbalanceBetween(days: DayLogs[], target: Factor, other: Factor): number {
  const exposedDays = days.filter((day) => presentOn(day, target));
  const controlDays = days.filter((day) => !presentOn(day, target));

  if (exposedDays.length === 0 || controlDays.length === 0) return 0;

  const rateAmong = (group: DayLogs[]) =>
    group.filter((day) => presentOn(day, other)).length / group.length;

  return Math.abs(rateAmong(exposedDays) - rateAmong(controlDays));
}

/**
 * Every candidate factor entangled enough with the target to muddy its comparison.
 *
 * Ordered most entangled first, and deterministically — the same logs must always produce the
 * same finding, including the same explanation of its limits (§62).
 */
export function findConfounders(
  days: DayLogs[],
  target: Factor,
  candidates: Factor[],
  threshold: number = CONFOUNDER_THRESHOLD
): Confounder[] {
  const targetMeasurement = measurementOf(target);

  return (
    candidates
      .filter((candidate) => candidate.key !== target.key)
      // A factor is never confounded by another view of the same measurement. "Poorer sleep" is
      // always perfectly anti-correlated with "better sleep" — they are one question, answered
      // once — and reporting that would be true, useless, and would zero the confidence of every
      // context finding the engine could make.
      .filter((candidate) => measurementOf(candidate) !== targetMeasurement)
      .map((factor) => ({ factor, overlap: imbalanceBetween(days, target, factor) }))
      .filter((confounder) => confounder.overlap >= threshold)
      .sort(
        (left, right) =>
          right.overlap - left.overlap || left.factor.key.localeCompare(right.factor.key)
      )
  );
}

/** The strongest entanglement found, for `assessConfidence`. Zero when nothing was entangled. */
export function maxOverlap(confounders: Confounder[]): number {
  return confounders.reduce((highest, confounder) => Math.max(highest, confounder.overlap), 0);
}
