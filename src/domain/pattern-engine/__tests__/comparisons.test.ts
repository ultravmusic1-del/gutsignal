import { compare, weeklyConsistency, wilsonInterval } from '../comparisons';
import type { Observation, TrackingState } from '../types';

/**
 * The arithmetic behind every finding (spec §57).
 *
 * Two things are being defended here. Groups must be built only from days that were actually
 * observed, so an unlogged day can never quietly become a control. And every division has a
 * denominator that could be zero, which in a health app must produce an honest null rather than
 * a NaN rendered on screen.
 */

let dayCounter = 0;

/** One observation. `outcome` is null for a day that was never observed. */
function observation(
  exposed: boolean,
  outcome: boolean | null,
  { value = null, localDate }: { value?: number | null; localDate?: string } = {}
): Observation {
  dayCounter += 1;
  const date =
    localDate ??
    new Date(Date.parse('2026-01-01') + dayCounter * 86_400_000).toISOString().slice(0, 10);

  const outcomeState: TrackingState =
    outcome === null ? 'no_data' : outcome ? 'symptom_logged' : 'explicit_good_state';

  return {
    localDate: date,
    exposedAt: exposed ? `${date}T08:00:00.000Z` : null,
    exposed,
    outcomeState,
    outcomeValue: outcome === null ? null : value,
    outcomeOccurred: outcome === true,
  };
}

beforeEach(() => {
  dayCounter = 0;
});

/** `n` observations with the given exposure and outcome. */
function many(n: number, exposed: boolean, outcome: boolean | null, value: number | null = null) {
  return Array.from({ length: n }, () => observation(exposed, outcome, { value }));
}

describe('compare — counting', () => {
  it('counts each group from observed days only', () => {
    const metrics = compare([
      ...many(3, true, true),
      ...many(2, true, false),
      ...many(4, false, false),
      ...many(5, true, null), // never observed
      ...many(2, false, null),
    ]);

    expect(metrics.exposedCount).toBe(5);
    expect(metrics.controlCount).toBe(4);
    expect(metrics.unknownCount).toBe(7);
  });

  it('never lets an unobserved day become a control', () => {
    // The whole missing-data defence collapses if these leak into the denominator.
    const metrics = compare([...many(4, true, true), ...many(10, false, null)]);

    expect(metrics.controlCount).toBe(0);
    expect(metrics.unknownCount).toBe(10);
  });

  it('reports all-zero counts for no observations at all', () => {
    const metrics = compare([]);

    expect(metrics.exposedCount).toBe(0);
    expect(metrics.controlCount).toBe(0);
    expect(metrics.unknownCount).toBe(0);
  });
});

describe('compare — rates', () => {
  it('computes the outcome rate in each group', () => {
    const metrics = compare([
      ...many(3, true, true),
      ...many(1, true, false),
      ...many(1, false, true),
      ...many(3, false, false),
    ]);

    expect(metrics.exposedOutcomeRate).toBeCloseTo(0.75);
    expect(metrics.controlOutcomeRate).toBeCloseTo(0.25);
    expect(metrics.absoluteDifference).toBeCloseTo(0.5);
  });

  it('reports a negative difference when the factor looks protective', () => {
    const metrics = compare([
      ...many(1, true, true),
      ...many(3, true, false),
      ...many(3, false, true),
      ...many(1, false, false),
    ]);

    expect(metrics.absoluteDifference).toBeLessThan(0);
  });

  it('gives a zero rate rather than NaN for an empty group', () => {
    const metrics = compare(many(4, true, true));

    expect(metrics.controlOutcomeRate).toBe(0);
    expect(Number.isNaN(metrics.absoluteDifference)).toBe(false);
  });

  it('returns no relative risk when the control rate is zero', () => {
    // Dividing by a zero control rate is undefined, and "infinitely more likely" is not a
    // statement this product may make.
    const metrics = compare([...many(4, true, true), ...many(4, false, false)]);

    expect(metrics.relativeRisk).toBeNull();
  });

  it('computes relative risk when both groups have outcomes', () => {
    const metrics = compare([
      ...many(3, true, true),
      ...many(1, true, false),
      ...many(1, false, true),
      ...many(3, false, false),
    ]);

    expect(metrics.relativeRisk).toBeCloseTo(3);
  });
});

describe('compare — severity', () => {
  it('averages severity within each group', () => {
    const metrics = compare([
      observation(true, true, { value: 8 }),
      observation(true, true, { value: 6 }),
      observation(false, true, { value: 4 }),
      observation(false, true, { value: 2 }),
    ]);

    expect(metrics.exposedMeanSeverity).toBeCloseTo(7);
    expect(metrics.controlMeanSeverity).toBeCloseTo(3);
    expect(metrics.meanSeverityDifference).toBeCloseTo(4);
  });

  it('ignores days that carried no severity value', () => {
    const metrics = compare([
      observation(true, true, { value: 8 }),
      observation(true, false),
      observation(false, true, { value: 4 }),
    ]);

    expect(metrics.exposedMeanSeverity).toBeCloseTo(8);
    expect(metrics.controlMeanSeverity).toBeCloseTo(4);
  });

  it('returns null severity for an outcome that has no severity', () => {
    const metrics = compare([...many(4, true, true), ...many(4, false, false)]);

    expect(metrics.exposedMeanSeverity).toBeNull();
    expect(metrics.controlMeanSeverity).toBeNull();
    expect(metrics.meanSeverityDifference).toBeNull();
  });

  it('returns no severity difference when only one group has values', () => {
    const metrics = compare([observation(true, true, { value: 7 }), observation(false, false)]);

    expect(metrics.exposedMeanSeverity).toBeCloseTo(7);
    expect(metrics.controlMeanSeverity).toBeNull();
    expect(metrics.meanSeverityDifference).toBeNull();
  });
});

describe('wilsonInterval', () => {
  it('brackets the observed proportion', () => {
    const interval = wilsonInterval(5, 10);

    expect(interval.low).toBeLessThan(0.5);
    expect(interval.high).toBeGreaterThan(0.5);
  });

  it('stays inside 0 and 1 even at the extremes', () => {
    // A normal-approximation interval would run below zero here. Wilson does not, which is why
    // it is used: a rate of "-8%" on a health screen is indefensible.
    const none = wilsonInterval(0, 8);
    const all = wilsonInterval(8, 8);

    expect(none.low).toBeGreaterThanOrEqual(0);
    expect(all.high).toBeLessThanOrEqual(1);
  });

  it('narrows as the sample grows', () => {
    const small = wilsonInterval(5, 10);
    const large = wilsonInterval(50, 100);

    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it('returns the whole range for an empty sample rather than dividing by zero', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
  });
});

describe('compare — uncertainty', () => {
  it('brackets the observed difference', () => {
    const metrics = compare([
      ...many(8, true, true),
      ...many(2, true, false),
      ...many(2, false, true),
      ...many(8, false, false),
    ]);

    expect(metrics.confidenceInterval).not.toBeNull();
    expect(metrics.confidenceInterval!.low).toBeLessThan(metrics.absoluteDifference);
    expect(metrics.confidenceInterval!.high).toBeGreaterThan(metrics.absoluteDifference);
  });

  it('is very wide on a thin sample', () => {
    const metrics = compare([...many(3, true, true), ...many(3, false, false)]);
    const width = metrics.confidenceInterval!.high - metrics.confidenceInterval!.low;

    expect(width).toBeGreaterThan(0.6);
  });

  it('DOES NOT protect against a tiny perfectly-separated sample', () => {
    // Documented deliberately, because it is a trap. With 2-of-2 against 0-of-2 the interval
    // excludes zero and looks conclusive — while Fisher's exact test on the same table gives
    // p of about 0.17, which is not.
    //
    // Newcombe's method is liberal at the extremes on very small samples. That is a known
    // property of the method, not a defect in it, and the interval is still the right thing to
    // report. What follows from it is that sample-size safety CANNOT live here: the status
    // decision in scoring.ts must gate on counts directly and must never treat "the interval
    // excludes zero" as sufficient evidence (spec §58).
    const metrics = compare([...many(2, true, true), ...many(2, false, false)]);

    expect(metrics.confidenceInterval!.low).toBeGreaterThan(0);
    expect(metrics.exposedCount).toBe(2);
    expect(metrics.controlCount).toBe(2);
  });

  it('narrows on a large consistent sample', () => {
    const thin = compare([...many(3, true, true), ...many(3, false, false)]);
    const thick = compare([...many(60, true, true), ...many(60, false, false)]);

    const width = (m: typeof thin) => m.confidenceInterval!.high - m.confidenceInterval!.low;

    expect(width(thick)).toBeLessThan(width(thin));
  });

  it('gives no interval when a group is empty', () => {
    expect(compare(many(4, true, true)).confidenceInterval).toBeNull();
  });

  it('stays within the range a difference of rates can occupy', () => {
    const metrics = compare([...many(20, true, true), ...many(20, false, false)]);

    expect(metrics.confidenceInterval!.low).toBeGreaterThanOrEqual(-1);
    expect(metrics.confidenceInterval!.high).toBeLessThanOrEqual(1);
  });
});

describe('weeklyConsistency', () => {
  /** An observation on a specific date, so weeks can be controlled exactly. */
  const on = (localDate: string, exposed: boolean, outcome: boolean | null) =>
    observation(exposed, outcome, { localDate });

  it('counts a week as comparable only when both groups appear in it', () => {
    const observations = [
      on('2026-01-05', true, true),
      on('2026-01-06', false, false),
      // Second week has only exposed days, so nothing can be compared within it.
      on('2026-01-12', true, true),
      on('2026-01-13', true, true),
    ];

    expect(weeklyConsistency(observations, 0.5).comparableWeeks).toBe(1);
  });

  it('counts a week as agreeing when it points the same way as the overall difference', () => {
    const observations = [
      on('2026-01-05', true, true),
      on('2026-01-06', false, false),
      on('2026-01-12', true, true),
      on('2026-01-13', false, false),
    ];

    const consistency = weeklyConsistency(observations, 0.5);

    expect(consistency.comparableWeeks).toBe(2);
    expect(consistency.agreeingWeeks).toBe(2);
    expect(consistency.agreementRate).toBeCloseTo(1);
  });

  it('does not count a week that points the other way', () => {
    const observations = [
      on('2026-01-05', true, true),
      on('2026-01-06', false, false),
      // This week contradicts the overall direction.
      on('2026-01-12', true, false),
      on('2026-01-13', false, true),
    ];

    const consistency = weeklyConsistency(observations, 0.5);

    expect(consistency.comparableWeeks).toBe(2);
    expect(consistency.agreeingWeeks).toBe(1);
    expect(consistency.agreementRate).toBeCloseTo(0.5);
  });

  it('reports no agreement rate when nothing was comparable', () => {
    const consistency = weeklyConsistency([on('2026-01-05', true, true)], 0.5);

    expect(consistency.comparableWeeks).toBe(0);
    expect(consistency.agreementRate).toBeNull();
  });

  it('reports no agreement rate when the overall difference is flat', () => {
    // With no direction to agree with, "100% consistent" would be meaningless.
    const observations = [on('2026-01-05', true, true), on('2026-01-06', false, true)];

    expect(weeklyConsistency(observations, 0).agreementRate).toBeNull();
  });

  it('ignores unobserved days when deciding whether a week is comparable', () => {
    const observations = [
      on('2026-01-05', true, true),
      on('2026-01-06', false, null),
      on('2026-01-07', false, null),
    ];

    expect(weeklyConsistency(observations, 0.5).comparableWeeks).toBe(0);
  });
});
