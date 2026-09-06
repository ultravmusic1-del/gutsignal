import { assessConfidence, FULL_SAMPLE } from '../confidence';
import {
  MIN_GROUP_FOR_ANY_CLAIM,
  MIN_GROUP_FOR_MODERATE,
  MIN_GROUP_FOR_STRONG,
  MIN_MEANINGFUL_DIFFERENCE,
  scoreStatus,
} from '../scoring';
import type {
  ComparisonMetrics,
  ConsistencyMetrics,
  Outcome,
  TrackingCompleteness,
} from '../types';

/**
 * Turning arithmetic into something a person is told (spec §58).
 *
 * This is the last gate before a number becomes a claim, and the place where the product's
 * promise is kept or broken. Nothing here may present a coincidence as a signal.
 */

function metrics(over: Partial<ComparisonMetrics> = {}): ComparisonMetrics {
  return {
    exposedCount: 20,
    controlCount: 20,
    unknownCount: 0,
    exposedOutcomeRate: 0.7,
    controlOutcomeRate: 0.2,
    absoluteDifference: 0.5,
    relativeRisk: 3.5,
    exposedMeanSeverity: null,
    controlMeanSeverity: null,
    meanSeverityDifference: null,
    confidenceInterval: { low: 0.25, high: 0.7 },
    ...over,
  };
}

function consistency(over: Partial<ConsistencyMetrics> = {}): ConsistencyMetrics {
  return { comparableWeeks: 5, agreeingWeeks: 5, agreementRate: 1, ...over };
}

function completeness(over: Partial<TrackingCompleteness> = {}): TrackingCompleteness {
  return {
    totalDays: 60,
    daysWithAnyLog: 54,
    daysWithGoodState: 20,
    daysWithSymptom: 30,
    coverage: 0.9,
    ...over,
  };
}

/** These fixtures are all occurrence-shaped; severity has its own describe block below. */
const OCCURRENCE: Outcome = { kind: 'symptom_occurrence', symptomType: 'bloating' };

const strong = () => ({
  outcome: OCCURRENCE,
  metrics: metrics(),
  consistency: consistency(),
  trackingCompleteness: completeness(),
  maxConfounderOverlap: 0,
});

describe('assessConfidence', () => {
  it('is limited by its weakest component', () => {
    // A chain is as strong as its weakest link, and in a health app the weakest evidence should
    // govern rather than being averaged away by whatever happens to look good.
    const assessment = assessConfidence({
      ...strong(),
      trackingCompleteness: completeness({ coverage: 0.2 }),
    });

    expect(assessment.confidence).toBeCloseTo(0.2);
    expect(assessment.components.coverage).toBeCloseTo(0.2);
  });

  it('is high when every component is strong', () => {
    expect(assessConfidence(strong()).confidence).toBeGreaterThan(0.7);
  });

  it('scales with the smaller of the two groups', () => {
    // A hundred exposed days against three controls is a sample of three.
    const lopsided = assessConfidence({
      ...strong(),
      metrics: metrics({ exposedCount: 100, controlCount: 3 }),
    });

    expect(lopsided.components.sample).toBeCloseTo(3 / FULL_SAMPLE);
  });

  it('is dragged down by heavy confounding', () => {
    const confounded = assessConfidence({ ...strong(), maxConfounderOverlap: 0.9 });

    expect(confounded.components.confounding).toBeCloseTo(0.1);
    expect(confounded.confidence).toBeCloseTo(0.1);
  });

  it('is dragged down by a wide uncertainty band', () => {
    const imprecise = assessConfidence({
      ...strong(),
      metrics: metrics({ confidenceInterval: { low: -0.4, high: 0.6 } }),
    });

    expect(imprecise.components.precision).toBeCloseTo(0);
  });

  it('caps confidence when consistency could not be measured at all', () => {
    // Too few comparable weeks is not evidence of consistency, so it cannot count as full marks.
    const unmeasured = assessConfidence({
      ...strong(),
      consistency: consistency({ comparableWeeks: 1, agreeingWeeks: 1, agreementRate: null }),
    });

    expect(unmeasured.components.consistency).toBeLessThan(1);
    expect(unmeasured.confidence).toBeLessThan(assessConfidence(strong()).confidence);
  });

  it('never reports a confidence outside 0 and 1', () => {
    const extreme = assessConfidence({
      ...strong(),
      metrics: metrics({ exposedCount: 0, controlCount: 0, confidenceInterval: null }),
      trackingCompleteness: completeness({ coverage: 0 }),
      maxConfounderOverlap: 1,
    });

    expect(extreme.confidence).toBeGreaterThanOrEqual(0);
    expect(extreme.confidence).toBeLessThanOrEqual(1);
  });
});

describe('assessConfidence — limitations', () => {
  it('says nothing when there is nothing to say', () => {
    expect(assessConfidence(strong()).limitations).toEqual([]);
  });

  it('names a thin sample', () => {
    const assessment = assessConfidence({
      ...strong(),
      metrics: metrics({ exposedCount: 6, controlCount: 6 }),
    });

    expect(assessment.limitations.join(' ')).toMatch(/observations|comparable days/i);
  });

  it('names poor tracking coverage', () => {
    const assessment = assessConfidence({
      ...strong(),
      trackingCompleteness: completeness({ coverage: 0.3 }),
    });

    expect(assessment.limitations.join(' ')).toMatch(/logged|days/i);
  });

  it('names confounding in the language the spec requires', () => {
    // Spec §60: the user is told the two things travelled together and that this makes them
    // harder to separate — not that one caused the other.
    const assessment = assessConfidence({ ...strong(), maxConfounderOverlap: 0.85 });

    expect(assessment.limitations.join(' ')).toMatch(/together|separate/i);
  });

  it('never explains a limitation in causal or diagnostic language', () => {
    const assessment = assessConfidence({
      outcome: OCCURRENCE,
      metrics: metrics({
        exposedCount: 5,
        controlCount: 5,
        confidenceInterval: { low: -0.5, high: 0.9 },
      }),
      consistency: consistency({ comparableWeeks: 0, agreeingWeeks: 0, agreementRate: null }),
      trackingCompleteness: completeness({ coverage: 0.2 }),
      maxConfounderOverlap: 0.9,
    });

    const text = assessment.limitations.join(' ').toLowerCase();

    for (const word of ['cause', 'caused', 'trigger', 'intolerance', 'allergy', 'diagnos']) {
      expect(text).not.toContain(word);
    }
  });
});

describe('scoreStatus', () => {
  it('refuses to say anything from too few observations', () => {
    // The rule spec §58 exists for: never "strong signal" because something happened twice.
    const status = scoreStatus({
      outcome: OCCURRENCE,
      metrics: metrics({
        exposedCount: MIN_GROUP_FOR_ANY_CLAIM - 1,
        controlCount: 20,
        absoluteDifference: 0.9,
      }),
      consistency: consistency(),
      confidence: 0.9,
    });

    expect(status).toBe('insufficient_data');
  });

  it('refuses even when a tiny sample separates perfectly', () => {
    // The exact case the comparison interval does NOT protect against: 2 of 2 against 0 of 2
    // excludes zero and looks conclusive. Counts are gated here instead.
    const status = scoreStatus({
      outcome: OCCURRENCE,
      metrics: metrics({
        exposedCount: 2,
        controlCount: 2,
        exposedOutcomeRate: 1,
        controlOutcomeRate: 0,
        absoluteDifference: 1,
        confidenceInterval: { low: 0.07, high: 1 },
      }),
      consistency: consistency({ comparableWeeks: 1, agreeingWeeks: 1, agreementRate: 1 }),
      confidence: 0.9,
    });

    expect(status).toBe('insufficient_data');
  });

  it('reports no clear pattern when there is plenty of data and no real difference', () => {
    const status = scoreStatus({
      outcome: OCCURRENCE,
      metrics: metrics({
        exposedCount: 30,
        controlCount: 30,
        absoluteDifference: MIN_MEANINGFUL_DIFFERENCE / 2,
      }),
      consistency: consistency(),
      confidence: 0.9,
    });

    expect(status).toBe('no_clear_pattern');
  });

  it('reports a stronger recurring signal only with size, confidence and repetition', () => {
    const status = scoreStatus({
      outcome: OCCURRENCE,
      metrics: metrics({ exposedCount: MIN_GROUP_FOR_STRONG, controlCount: MIN_GROUP_FOR_STRONG }),
      consistency: consistency({ comparableWeeks: 5, agreeingWeeks: 5, agreementRate: 1 }),
      confidence: 0.85,
    });

    expect(status).toBe('stronger_recurring_signal');
  });

  it('will not call it stronger when the weeks disagree with each other', () => {
    // A difference driven by one unusual week is a much weaker claim than a repeated one.
    const status = scoreStatus({
      outcome: OCCURRENCE,
      metrics: metrics({ exposedCount: 30, controlCount: 30 }),
      consistency: consistency({ comparableWeeks: 5, agreeingWeeks: 2, agreementRate: 0.4 }),
      confidence: 0.85,
    });

    expect(status).not.toBe('stronger_recurring_signal');
  });

  it('will not call it stronger when consistency was never measurable', () => {
    const status = scoreStatus({
      outcome: OCCURRENCE,
      metrics: metrics({ exposedCount: 30, controlCount: 30 }),
      consistency: consistency({ comparableWeeks: 1, agreeingWeeks: 1, agreementRate: null }),
      confidence: 0.85,
    });

    expect(status).not.toBe('stronger_recurring_signal');
  });

  it('reports moderate for a decent sample without full confidence', () => {
    const status = scoreStatus({
      outcome: OCCURRENCE,
      metrics: metrics({
        exposedCount: MIN_GROUP_FOR_MODERATE,
        controlCount: MIN_GROUP_FOR_MODERATE,
      }),
      consistency: consistency({ comparableWeeks: 2, agreeingWeeks: 2, agreementRate: 1 }),
      confidence: 0.6,
    });

    expect(status).toBe('moderate');
  });

  it('reports emerging for a real difference on a small but usable sample', () => {
    const status = scoreStatus({
      outcome: OCCURRENCE,
      metrics: metrics({
        exposedCount: MIN_GROUP_FOR_ANY_CLAIM,
        controlCount: MIN_GROUP_FOR_ANY_CLAIM,
      }),
      consistency: consistency({ comparableWeeks: 1, agreeingWeeks: 1, agreementRate: null }),
      confidence: 0.35,
    });

    expect(status).toBe('emerging');
  });

  it('treats a protective association the same way as a harmful one', () => {
    // The engine reports what the logs show in both directions, not only bad news.
    const status = scoreStatus({
      outcome: OCCURRENCE,
      metrics: metrics({
        exposedCount: MIN_GROUP_FOR_STRONG,
        controlCount: MIN_GROUP_FOR_STRONG,
        absoluteDifference: -0.5,
      }),
      consistency: consistency(),
      confidence: 0.85,
    });

    expect(status).toBe('stronger_recurring_signal');
  });

  it('is gated by the smaller group, not the larger', () => {
    const status = scoreStatus({
      outcome: OCCURRENCE,
      metrics: metrics({ exposedCount: 200, controlCount: 3 }),
      consistency: consistency(),
      confidence: 0.9,
    });

    expect(status).toBe('insufficient_data');
  });

  it('uses thresholds that are ordered and reviewable', () => {
    expect(MIN_GROUP_FOR_ANY_CLAIM).toBeLessThan(MIN_GROUP_FOR_MODERATE);
    expect(MIN_GROUP_FOR_MODERATE).toBeLessThan(MIN_GROUP_FOR_STRONG);
    expect(MIN_MEANINGFUL_DIFFERENCE).toBeGreaterThan(0);
  });
});
