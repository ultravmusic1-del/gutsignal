import {
  applyMultipleTestingControl,
  breadthPenalty,
  countRealComparisons,
  FREE_COMPARISONS,
  MIN_BREADTH_PENALTY,
} from '../multiple-testing';
import type { ComparisonMetrics, Finding } from '../types';

/**
 * Guarding against the scan itself (spec §61).
 *
 * A finding that would be interesting alone is much less interesting as the most extreme of
 * seventy attempts, and the engine makes seventy attempts routinely.
 */

function metrics(over: Partial<ComparisonMetrics> = {}): ComparisonMetrics {
  return {
    exposedCount: 20,
    controlCount: 20,
    unknownCount: 0,
    exposedOutcomeRate: 0.8,
    controlOutcomeRate: 0.2,
    absoluteDifference: 0.6,
    relativeRisk: 4,
    exposedMeanSeverity: null,
    controlMeanSeverity: null,
    meanSeverityDifference: null,
    confidenceInterval: { low: 0.35, high: 0.8 },
    ...over,
  };
}

function finding(over: Partial<Finding> = {}): Finding {
  return {
    engineVersion: '1.0.0',
    factor: { key: 'caffeinated', label: 'Caffeinated', source: 'meal_tag' },
    outcome: { kind: 'symptom_occurrence', symptomType: 'bloating' },
    analysisStart: '2026-01-01',
    analysisEnd: '2026-02-25',
    window: 'later_same_day',
    metrics: metrics(),
    consistency: { comparableWeeks: 6, agreeingWeeks: 6, agreementRate: 1 },
    confounders: [],
    trackingCompleteness: {
      totalDays: 56,
      daysWithAnyLog: 54,
      daysWithGoodState: 20,
      daysWithSymptom: 30,
      coverage: 0.96,
    },
    status: 'stronger_recurring_signal',
    confidence: 0.9,
    limitations: [],
    generatedAt: '2026-03-01T09:00:00.000Z',
    ...over,
  };
}

/** `n` findings that were all real comparisons. */
const scan = (n: number, over: Partial<Finding> = {}) =>
  Array.from({ length: n }, (_, i) =>
    finding({ ...over, factor: { key: `f${i}`, label: `F${i}`, source: 'meal_tag' } })
  );

describe('breadthPenalty', () => {
  it('does not punish a narrow scan', () => {
    expect(breadthPenalty(1)).toBe(1);
    expect(breadthPenalty(FREE_COMPARISONS)).toBe(1);
  });

  it('shrinks once the scan goes wide', () => {
    expect(breadthPenalty(FREE_COMPARISONS + 1)).toBeLessThan(1);
  });

  it('shrinks further the wider the scan gets', () => {
    expect(breadthPenalty(80)).toBeLessThan(breadthPenalty(40));
    expect(breadthPenalty(40)).toBeLessThan(breadthPenalty(20));
  });

  it('never falls below its floor, so a broad scan cannot silence a diary', () => {
    expect(breadthPenalty(100_000)).toBe(MIN_BREADTH_PENALTY);
  });

  it('never exceeds one, so a scan can only ever cost confidence', () => {
    for (const size of [0, 1, 5, 10, 11, 50, 500]) {
      expect(breadthPenalty(size)).toBeLessThanOrEqual(1);
    }
  });
});

describe('countRealComparisons', () => {
  it('counts pairs that were actually compared', () => {
    expect(countRealComparisons(scan(4))).toBe(4);
  });

  it('ignores pairs where a group was empty', () => {
    // These were never a chance for a coincidence, so counting them would inflate the penalty
    // and punish the user for factors the engine could not examine.
    const findings = [
      ...scan(3),
      finding({ metrics: metrics({ controlCount: 0 }) }),
      finding({ metrics: metrics({ exposedCount: 0 }) }),
    ];

    expect(countRealComparisons(findings)).toBe(3);
  });
});

describe('applyMultipleTestingControl', () => {
  it('leaves a narrow scan untouched', () => {
    const findings = scan(FREE_COMPARISONS);

    expect(applyMultipleTestingControl(findings)).toEqual(findings);
  });

  it('reduces confidence across a wide scan', () => {
    const controlled = applyMultipleTestingControl(scan(60));

    for (const result of controlled) {
      expect(result.confidence).toBeLessThan(0.9);
    }
  });

  it('can demote a finding but never promote one', () => {
    const controlled = applyMultipleTestingControl(scan(60));
    const demoted = controlled.filter((f) => f.status !== 'stronger_recurring_signal');

    expect(demoted.length).toBeGreaterThan(0);
    expect(
      controlled.every((f) => f.status !== 'stronger_recurring_signal' || f.confidence >= 0.7)
    ).toBe(true);
  });

  it('tells the user how many comparisons were made', () => {
    const controlled = applyMultipleTestingControl(scan(60));

    expect(controlled[0]?.limitations.join(' ')).toMatch(/60 combinations/);
  });

  it('explains the breadth without causal or diagnostic language', () => {
    const text = applyMultipleTestingControl(scan(60))
      .flatMap((f) => f.limitations)
      .join(' ')
      .toLowerCase();

    for (const word of ['cause', 'trigger', 'intolerance', 'allergy', 'diagnos']) {
      expect(text).not.toContain(word);
    }
  });

  it('keeps existing limitations rather than replacing them', () => {
    const controlled = applyMultipleTestingControl(
      scan(60, { limitations: ['Something was already limiting this.'] })
    );

    expect(controlled[0]?.limitations[0]).toBe('Something was already limiting this.');
    expect(controlled[0]?.limitations).toHaveLength(2);
  });

  it('cannot rescue a finding that had too little data to begin with', () => {
    const thin = scan(60, {
      metrics: metrics({ exposedCount: 2, controlCount: 2 }),
      status: 'insufficient_data',
    });

    expect(applyMultipleTestingControl(thin).every((f) => f.status === 'insufficient_data')).toBe(
      true
    );
  });

  it('leaves a genuine non-finding a non-finding', () => {
    const flat = scan(60, {
      metrics: metrics({ absoluteDifference: 0.01 }),
      status: 'no_clear_pattern',
    });

    expect(applyMultipleTestingControl(flat).every((f) => f.status === 'no_clear_pattern')).toBe(
      true
    );
  });

  it('is deterministic', () => {
    const findings = scan(60);

    expect(applyMultipleTestingControl(findings)).toEqual(applyMultipleTestingControl(findings));
  });
});
