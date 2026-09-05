/**
 * Choosing what to examine (spec §57, §58, §61).
 *
 * Before any statistics, the engine has to decide which factors are worth testing at all. This
 * is not an optimisation — it is part of the multiple-comparison defence. Every factor admitted
 * here becomes another comparison, and every comparison is another chance for a coincidence to
 * look like a signal (§61).
 *
 * Two rejections matter most, and both are cases where saying nothing is the honest answer:
 *
 *  - **Too few exposed days.** A factor seen twice cannot support a comparison, whatever the
 *    numbers appear to show.
 *  - **Too few unexposed days.** Someone who drinks coffee every single morning cannot learn
 *    anything about coffee from their own diary, because there is nothing to compare against.
 *    Inventing a control group would be worse than admitting the limit.
 *
 * Every threshold here is a judgement rather than a measurement, so all of them are named,
 * overridable, and documented in `docs/PATTERN_ENGINE.md`.
 */

import { fixedFactors, mealItemFactor } from './factors';
import { exposureOn, type DayLogs } from './observations';
import type { Factor } from './types';

export type CandidateLimits = {
  /** Fewest days a factor must appear on to be tested. */
  minExposedDays: number;
  /** Fewest days it must be absent on, so there is something to compare against. */
  minControlDays: number;
  /** Fewest separate days a free-text meal item must appear on to become a factor. */
  minItemMentions: number;
};

/**
 * Deliberately conservative starting points.
 *
 * Four days in each group is not enough for a confident finding — it is the point below which
 * the engine will not even look. Confidence and status are decided later, on top of this floor.
 */
export const DEFAULT_CANDIDATE_LIMITS: CandidateLimits = {
  minExposedDays: 4,
  minControlDays: 4,
  minItemMentions: 3,
};

export type Candidate = {
  factor: Factor;
  /** Days in the range where the factor was present. */
  exposedDays: number;
  /** Days where it was absent. Not the same as days where the outcome was observed. */
  unexposedDays: number;
};

/**
 * Meal items the user has written down often enough to be worth testing.
 *
 * Grouped case-insensitively so `Coffee` and `coffee` are one factor, while the label keeps the
 * user's own words — the raw value is never destroyed (spec §54). Where spellings disagree, the
 * most frequent wins, and ties break alphabetically so the result never depends on the order
 * rows happened to arrive in.
 *
 * Counts **days**, not mentions: three coffees on one day is one observation of coffee.
 */
export function discoverMealItemFactors(days: DayLogs[], minItemMentions: number): Factor[] {
  /** key → the distinct dates it appeared on, and how often each raw spelling was used. */
  const seen = new Map<string, { dates: Set<string>; spellings: Map<string, number> }>();

  for (const day of days) {
    for (const meal of day.meals) {
      for (const item of meal.items) {
        const key = item.rawName.toLocaleLowerCase();
        const entry = seen.get(key) ?? { dates: new Set<string>(), spellings: new Map() };

        entry.dates.add(day.localDate);
        entry.spellings.set(item.rawName, (entry.spellings.get(item.rawName) ?? 0) + 1);
        seen.set(key, entry);
      }
    }
  }

  const factors: Factor[] = [];

  for (const [key, entry] of seen) {
    if (entry.dates.size < minItemMentions) continue;

    const label = [...entry.spellings.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )[0]?.[0];

    factors.push({ ...mealItemFactor(key), label: label ?? key });
  }

  return factors.sort((left, right) => left.key.localeCompare(right.key));
}

/**
 * Every factor worth scanning for this diary, with the counts behind that decision.
 *
 * Ordered most-observed first so the strongest evidence is examined before the thinnest, and
 * deterministically — the same logs must always produce the same scan, or a finding could not be
 * reproduced (§62).
 */
export function candidateFactors(
  days: DayLogs[],
  limits: Partial<CandidateLimits> = {}
): Candidate[] {
  const { minExposedDays, minControlDays, minItemMentions } = {
    ...DEFAULT_CANDIDATE_LIMITS,
    ...limits,
  };

  const factors = [...fixedFactors(), ...discoverMealItemFactors(days, minItemMentions)];

  return factors
    .map((factor) => {
      const exposedDays = days.filter((day) => exposureOn(day, factor).exposed).length;
      return { factor, exposedDays, unexposedDays: days.length - exposedDays };
    })
    .filter(
      (candidate) =>
        candidate.exposedDays >= minExposedDays && candidate.unexposedDays >= minControlDays
    )
    .sort(
      (left, right) =>
        right.exposedDays - left.exposedDays || left.factor.key.localeCompare(right.factor.key)
    );
}
