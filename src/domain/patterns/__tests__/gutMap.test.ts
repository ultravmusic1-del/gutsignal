import type { Factor, Finding } from '@/domain/pattern-engine/types';
import { PATTERN_STATUS_COPY } from '@/domain/patterns/status';
import type { PatternStatus } from '@/domain/patterns/status';

import { buildGutMap, GUT_MAP_GROUPS } from '../gutMap';

/**
 * The Gut Map is the landscape view (spec §52): every factor the engine examined, grouped by how
 * much it can say about each.
 *
 * The engine works in comparisons, not factors — dairy against bloating in one window is a
 * different finding from dairy against urgency in another — so the real work here is collapsing
 * many findings per factor down to one honest row. Getting that wrong would let a factor appear
 * twice under contradictory headings, which is exactly what a "map" must not do.
 */

const DAIRY: Factor = { key: 'meal_item:dairy', label: 'Dairy', source: 'meal_item' };
const COFFEE: Factor = { key: 'meal_item:coffee', label: 'Coffee', source: 'meal_item' };
const SLEEP: Factor = { key: 'poor_sleep', label: 'Poorer sleep', source: 'context' };

function aFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    engineVersion: '1.0.0',
    factor: DAIRY,
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
    status: 'moderate',
    confidence: 0.6,
    limitations: [],
    generatedAt: '2026-08-31T09:00:00.000Z',
    ...overrides,
  };
}

const withStatus = (factor: Factor, status: PatternStatus, extra: Partial<Finding> = {}) =>
  aFinding({ factor, status, ...extra });

const groupKeys = (findings: Finding[]) => buildGutMap(findings).map((group) => group.key);

const labelsIn = (findings: Finding[], key: string) =>
  buildGutMap(findings)
    .find((group) => group.key === key)
    ?.entries.map((entry) => entry.factor.label) ?? [];

describe('grouping', () => {
  it('puts each factor under the group its status belongs to', () => {
    const findings = [
      withStatus(SLEEP, 'stronger_recurring_signal'),
      withStatus(COFFEE, 'emerging'),
      withStatus(DAIRY, 'no_clear_pattern'),
    ];

    expect(labelsIn(findings, 'stronger')).toEqual(['Poorer sleep']);
    expect(labelsIn(findings, 'investigating')).toEqual(['Coffee']);
    expect(labelsIn(findings, 'no_pattern')).toEqual(['Dairy']);
  });

  it('keeps the groups in the order the spec lists them', () => {
    const findings = [
      withStatus(DAIRY, 'insufficient_data'),
      withStatus(COFFEE, 'no_clear_pattern'),
      withStatus(SLEEP, 'stronger_recurring_signal'),
    ];

    expect(groupKeys(findings)).toEqual(['stronger', 'no_pattern', 'not_enough']);
  });

  // A heading over an empty box is a placeholder, and this product does not ship those.
  it('omits a group with nothing in it', () => {
    expect(groupKeys([withStatus(DAIRY, 'moderate')])).toEqual(['stronger']);
  });

  it('returns nothing at all when the engine found nothing to examine', () => {
    expect(buildGutMap([])).toEqual([]);
  });

  // Moderate and stronger are both substantiated findings and share a heading, so the map does
  // not draw a line the user cannot act on.
  it('groups moderate alongside stronger signals', () => {
    const findings = [
      withStatus(DAIRY, 'moderate'),
      withStatus(SLEEP, 'stronger_recurring_signal'),
    ];

    expect(labelsIn(findings, 'stronger')).toHaveLength(2);
  });
});

describe('collapsing many findings into one row per factor', () => {
  // The engine compares each factor against several outcomes in several windows, so one factor
  // routinely produces a dozen findings. A map that listed them all would not be a map.
  it('lists a factor once however many comparisons it produced', () => {
    const findings = [
      withStatus(DAIRY, 'no_clear_pattern', { window: 'shortly_after' }),
      withStatus(DAIRY, 'no_clear_pattern', { window: 'next_day' }),
      withStatus(DAIRY, 'insufficient_data', { outcome: { kind: 'wellbeing' } }),
    ];

    const entries = buildGutMap(findings).flatMap((group) => group.entries);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.findingCount).toBe(3);
  });

  // The strongest thing the engine can say about a factor is the thing to say. Filing dairy under
  // "not enough data" while a moderate dairy finding exists would hide evidence the user has.
  it('files a factor under the strongest status any of its findings reached', () => {
    const findings = [
      withStatus(DAIRY, 'insufficient_data'),
      withStatus(DAIRY, 'moderate'),
      withStatus(DAIRY, 'no_clear_pattern'),
    ];

    expect(labelsIn(findings, 'stronger')).toEqual(['Dairy']);
    expect(labelsIn(findings, 'not_enough')).toEqual([]);
  });

  // "We looked and found nothing" is a real answer; "we could not look" is not. Ranking the
  // former higher keeps the map from burying a genuine negative result.
  it('prefers a negative result over having nothing to say', () => {
    const findings = [
      withStatus(DAIRY, 'insufficient_data'),
      withStatus(DAIRY, 'no_clear_pattern'),
    ];

    expect(labelsIn(findings, 'no_pattern')).toEqual(['Dairy']);
  });

  it('links each row to the finding that earned it its place', () => {
    const strongest = withStatus(DAIRY, 'moderate', { confidence: 0.66 });
    const findings = [withStatus(DAIRY, 'insufficient_data', { confidence: 0.1 }), strongest];

    const entry = buildGutMap(findings).flatMap((group) => group.entries)[0];

    expect(entry?.finding).toBe(strongest);
    expect(entry?.status).toBe('moderate');
  });

  it('breaks a tie on confidence, so the row is the best evidence and not the first one seen', () => {
    const weaker = withStatus(DAIRY, 'moderate', { confidence: 0.52, window: 'shortly_after' });
    const stronger = withStatus(DAIRY, 'moderate', { confidence: 0.68, window: 'next_day' });

    expect(buildGutMap([weaker, stronger])[0]?.entries[0]?.finding).toBe(stronger);
  });
});

describe('ordering inside a group', () => {
  it('puts the best-supported factor first', () => {
    const findings = [
      withStatus(COFFEE, 'moderate', { confidence: 0.55 }),
      withStatus(SLEEP, 'moderate', { confidence: 0.72 }),
      withStatus(DAIRY, 'moderate', { confidence: 0.63 }),
    ];

    expect(labelsIn(findings, 'stronger')).toEqual(['Poorer sleep', 'Dairy', 'Coffee']);
  });

  // Determinism is a pattern-engine requirement (CLAUDE.md §18) and it does not stop at the
  // engine's edge: the same diary must produce the same screen.
  it('is stable when confidence is identical', () => {
    const findings = [
      withStatus(SLEEP, 'moderate', { confidence: 0.6 }),
      withStatus(DAIRY, 'moderate', { confidence: 0.6 }),
      withStatus(COFFEE, 'moderate', { confidence: 0.6 }),
    ];

    const forwards = labelsIn(findings, 'stronger');
    const backwards = labelsIn([...findings].reverse(), 'stronger');

    expect(forwards).toEqual(backwards);
  });
});

describe('the group copy', () => {
  it('describes every group with the same words the rest of the app uses for that status', () => {
    for (const group of GUT_MAP_GROUPS) {
      expect(group.description).toBe(PATTERN_STATUS_COPY[group.representativeStatus].description);
    }
  });

  it('covers all five statuses across the four groups', () => {
    const covered = GUT_MAP_GROUPS.flatMap((group) => group.statuses);

    expect(new Set(covered).size).toBe(5);
  });

  it('never says anything diagnostic', () => {
    const copy = GUT_MAP_GROUPS.map((group) => `${group.title} ${group.description}`).join(' ');

    expect(copy).not.toMatch(/caus|trigger|diagnos|intoleran|allerg|condition|risk/i);
  });
});
