import type { LogSet } from '@/domain/pattern-engine/observations';
import type { Finding } from '@/domain/pattern-engine/types';

import {
  assessReadiness,
  buildInsights,
  MINIMUM_USEFUL_DAYS,
  readinessCopy,
  STANDS_OUT_LIMIT,
  summarise,
  whatStandsOut,
  worthInvestigating,
} from '../insights';
import { PATTERN_STATUSES, type PatternStatus } from '../status';

/**
 * What a person is shown, and what they are told when there is nothing to show (spec §49).
 *
 * The empty state carries more weight than the populated one here: a new user sees it for weeks,
 * and "nothing yet" reads as either a broken app or pointless logging.
 */

const emptyLogs: LogSet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };

function finding(status: PatternStatus, over: Partial<Finding> = {}): Finding {
  return {
    engineVersion: '1.0.0',
    factor: { key: `f-${status}`, label: 'A factor', source: 'meal_tag' },
    outcome: { kind: 'symptom_occurrence', symptomType: 'bloating' },
    analysisStart: '2026-01-01',
    analysisEnd: '2026-03-01',
    window: 'later_same_day',
    metrics: {
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
    },
    consistency: { comparableWeeks: 6, agreeingWeeks: 6, agreementRate: 1 },
    confounders: [],
    trackingCompleteness: {
      totalDays: 60,
      daysWithAnyLog: 55,
      daysWithGoodState: 20,
      daysWithSymptom: 25,
      coverage: 0.92,
    },
    status,
    confidence: 0.8,
    limitations: [],
    generatedAt: '2026-03-01T09:00:00.000Z',
    ...over,
  };
}

/** A log on `localDate`, minimal but shaped like the real thing. */
const day = (localDate: string) => ({
  id: `x-${localDate}`,
  userId: 'u1',
  note: null,
  source: 'manual' as const,
  occurredAt: `${localDate}T12:00:00.000Z`,
  occurredLocalDate: localDate,
  occurredTz: 'UTC',
  occurredUtcOffsetMinutes: 0,
  deletedAt: null,
  createdAt: `${localDate}T12:00:00.000Z`,
  updatedAt: `${localDate}T12:00:00.000Z`,
});

const dates = (count: number, from = 1) =>
  Array.from({ length: count }, (_, i) => `2026-01-${String(from + i).padStart(2, '0')}`);

const symptomsOn = (localDates: string[]) =>
  localDates.map((date) => ({ ...day(date), symptomType: 'bloating' as const, severity: 5 }));

const wellbeingOn = (localDates: string[]) => localDates.map(day);

describe('whatStandsOut', () => {
  it('leads with the substantiated findings only', () => {
    const findings = [
      finding('stronger_recurring_signal'),
      finding('moderate'),
      finding('emerging'),
      finding('no_clear_pattern'),
      finding('insufficient_data'),
    ];

    expect(whatStandsOut(findings).map((f) => f.status)).toEqual([
      'stronger_recurring_signal',
      'moderate',
    ]);
  });

  it('caps how many it shows', () => {
    // A screen of twenty findings is a screen nobody reads.
    const findings = Array.from({ length: 10 }, (_, i) =>
      finding('moderate', { factor: { key: `f${i}`, label: `F${i}`, source: 'meal_tag' } })
    );

    expect(whatStandsOut(findings)).toHaveLength(STANDS_OUT_LIMIT);
  });

  it('shows nothing when nothing qualifies', () => {
    expect(whatStandsOut([finding('emerging'), finding('insufficient_data')])).toEqual([]);
  });
});

describe('worthInvestigating', () => {
  it('holds emerging signals apart from the headline findings', () => {
    // Separation is a safety decision: an emerging signal shown beside a moderate one reads as
    // a weaker version of the same claim, when it is a different kind of statement.
    const findings = [finding('moderate'), finding('emerging'), finding('no_clear_pattern')];

    expect(worthInvestigating(findings).map((f) => f.status)).toEqual(['emerging']);
  });

  it('never includes something already shown as a headline', () => {
    const findings = [finding('stronger_recurring_signal'), finding('moderate')];

    expect(worthInvestigating(findings)).toEqual([]);
  });
});

describe('summarise', () => {
  it('counts only pairs that were actually compared', () => {
    const findings = [
      finding('moderate'),
      finding('emerging'),
      finding('no_clear_pattern'),
      finding('insufficient_data', {
        metrics: { ...finding('moderate').metrics, controlCount: 0 },
      }),
    ];

    const summary = summarise(findings);

    expect(summary.comparisons).toBe(3);
    expect(summary.standsOut).toBe(1);
    expect(summary.emerging).toBe(1);
    expect(summary.noPattern).toBe(1);
  });

  it('counts distinct factors, not findings', () => {
    const shared = { key: 'coffee', label: 'Coffee', source: 'meal_tag' as const };
    const findings = [
      finding('moderate', { factor: shared }),
      finding('emerging', { factor: shared }),
    ];

    expect(summarise(findings).factors).toBe(1);
  });

  it('handles an empty scan', () => {
    expect(summarise([])).toEqual({
      comparisons: 0,
      factors: 0,
      standsOut: 0,
      emerging: 0,
      noPattern: 0,
    });
  });
});

describe('assessReadiness', () => {
  const realDiary: LogSet = {
    ...emptyLogs,
    symptoms: symptomsOn(dates(10)),
    wellbeing: wellbeingOn(dates(10, 11)),
  };

  it('is ready when there is something worth showing', () => {
    expect(assessReadiness(realDiary, [finding('moderate')])).toEqual({ kind: 'ready' });
    expect(assessReadiness(realDiary, [finding('emerging')])).toEqual({ kind: 'ready' });
  });

  it('shows what it has even if the diary looks empty to it', () => {
    // Defensive ordering. A finding can only exist if logs did, so if the two ever disagree —
    // a range mismatch, say — showing the finding beats explaining why there is nothing.
    expect(assessReadiness(emptyLogs, [finding('moderate')])).toEqual({ kind: 'ready' });
  });

  it('reports an empty diary', () => {
    expect(assessReadiness(emptyLogs, [])).toEqual({ kind: 'no_logs' });
  });

  it('puts the missing good days first, above everything else', () => {
    // The most common and least guessable blocker: without an explicit good day there is no
    // control group, however diligently everything else was recorded. It is also the smallest
    // ask, so it outranks "log for longer" even when both are true.
    const logs: LogSet = { ...emptyLogs, symptoms: symptomsOn(dates(3)) };

    expect(assessReadiness(logs, [])).toEqual({ kind: 'needs_good_days', daysWithSymptom: 3 });
  });

  it('does not ask for good days once some exist', () => {
    const logs: LogSet = {
      ...emptyLogs,
      symptoms: symptomsOn(dates(2)),
      wellbeing: wellbeingOn(dates(2, 10)),
    };

    expect(assessReadiness(logs, []).kind).not.toBe('needs_good_days');
  });

  it('reports too little history, counting days rather than entries', () => {
    // Ten logs on one day is one day of history.
    const logs: LogSet = {
      ...emptyLogs,
      symptoms: symptomsOn(['2026-01-01', '2026-01-01', '2026-01-01']),
      wellbeing: wellbeingOn(['2026-01-02']),
    };

    const readiness = assessReadiness(logs, []);

    expect(readiness).toEqual({
      kind: 'needs_more_days',
      daysLogged: 2,
      daysNeeded: MINIMUM_USEFUL_DAYS,
    });
  });

  it('reports a lack of variety when there is history but nothing to compare', () => {
    const logs: LogSet = {
      ...emptyLogs,
      symptoms: symptomsOn(dates(10)),
      wellbeing: wellbeingOn(dates(10, 11)),
    };

    expect(assessReadiness(logs, [])).toEqual({ kind: 'needs_more_variety' });
  });

  it('says plainly when it looked and found nothing', () => {
    const logs: LogSet = {
      ...emptyLogs,
      symptoms: symptomsOn(dates(10)),
      wellbeing: wellbeingOn(dates(10, 11)),
    };

    const findings = [finding('no_clear_pattern'), finding('no_clear_pattern')];

    expect(assessReadiness(logs, findings)).toEqual({
      kind: 'looked_and_found_nothing',
      comparisons: 2,
    });
  });
});

describe('readinessCopy', () => {
  const everyState: ReturnType<typeof assessReadiness>[] = [
    { kind: 'ready' },
    { kind: 'no_logs' },
    { kind: 'needs_good_days', daysWithSymptom: 3 },
    { kind: 'needs_more_days', daysLogged: 2, daysNeeded: 8 },
    { kind: 'needs_more_variety' },
    { kind: 'looked_and_found_nothing', comparisons: 12 },
  ];

  it('has words for every state except ready', () => {
    for (const state of everyState) {
      const copy = readinessCopy(state);
      if (state.kind === 'ready') continue;

      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  });

  it('never blames the user for gaps in their logging', () => {
    const text = everyState
      .map(
        (state) =>
          `${readinessCopy(state).title} ${readinessCopy(state).body} ${readinessCopy(state).hint ?? ''}`
      )
      .join(' ')
      .toLowerCase();

    for (const word of ['should', 'must', 'fail', 'forgot', 'lazy', 'not enough effort']) {
      expect(text).not.toContain(word);
    }
  });

  it('never uses causal or diagnostic language', () => {
    const text = everyState
      .map((state) => `${readinessCopy(state).body} ${readinessCopy(state).hint ?? ''}`)
      .join(' ')
      .toLowerCase();

    for (const word of ['cause', 'trigger', 'intolerance', 'allergy', 'diagnos']) {
      expect(text).not.toContain(word);
    }
  });

  it('never promises a finding will appear', () => {
    // It may genuinely be that nothing in this diary relates to anything else, and the product
    // has to be able to sit with that.
    const text = everyState
      .map((state) => `${readinessCopy(state).body} ${readinessCopy(state).hint ?? ''}`)
      .join(' ')
      .toLowerCase();

    for (const phrase of ['you will see', 'we will find', 'guaranteed', 'will show you what']) {
      expect(text).not.toContain(phrase);
    }
  });

  it('gives the good-days state a concrete, single action', () => {
    const copy = readinessCopy({ kind: 'needs_good_days', daysWithSymptom: 5 });

    expect(copy.hint).toMatch(/feeling good/i);
    expect(copy.body).toContain('5');
  });

  it('treats finding nothing as a result rather than a gap', () => {
    const copy = readinessCopy({ kind: 'looked_and_found_nothing', comparisons: 12 });

    expect(copy.body).toMatch(/real result|not a gap/i);
  });

  it('reads naturally for a single day', () => {
    const copy = readinessCopy({ kind: 'needs_more_days', daysLogged: 1, daysNeeded: 8 });

    expect(copy.body).toContain('1 day');
    expect(copy.body).not.toContain('1 days');
  });
});

describe('the status vocabulary is shared, not redefined', () => {
  it('uses only statuses the product safety vocabulary defines', () => {
    const findings = PATTERN_STATUSES.map((status) => finding(status));

    for (const shown of [...whatStandsOut(findings), ...worthInvestigating(findings)]) {
      expect(PATTERN_STATUSES).toContain(shown.status);
    }
  });
});

describe('buildInsights', () => {
  const dayLog = (localDate: string, hour: number, id: string) => ({
    id,
    userId: 'u1',
    note: null,
    source: 'manual' as const,
    occurredAt: `${localDate}T${String(hour).padStart(2, '0')}:00:00.000Z`,
    occurredLocalDate: localDate,
    occurredTz: 'UTC',
    occurredUtcOffsetMinutes: 0,
    deletedAt: null,
    createdAt: `${localDate}T00:00:00.000Z`,
    updatedAt: `${localDate}T00:00:00.000Z`,
  });

  const spread = Array.from({ length: 56 }, (_, i) =>
    new Date(Date.parse('2026-01-05T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10)
  );
  const range = { start: spread[0]!, end: spread[spread.length - 1]! };
  const NOW = new Date('2026-03-05T09:00:00.000Z');

  /** A diary where a tag and a symptom go together on most exposed days. */
  function diaryWithAssociation(): LogSet {
    const exposed = spread.filter((_, i) => i % 2 === 0);
    const control = spread.filter((_, i) => i % 2 === 1);

    const split = (group: string[], rate: number) => {
      const count = Math.round(group.length * rate);
      return {
        symptoms: group.slice(0, count).map((d, i) => ({
          ...dayLog(d, 14, `s-${d}-${i}`),
          symptomType: 'bloating' as const,
          severity: 6,
        })),
        wellbeing: group.slice(count).map((d, i) => dayLog(d, 20, `w-${d}-${i}`)),
      };
    };

    const hot = split(exposed, 0.9);
    const cold = split(control, 0.1);

    return {
      ...emptyLogs,
      meals: exposed.map((d) => ({
        ...dayLog(d, 8, `m-${d}`),
        title: 'A meal',
        mealSize: 'medium' as const,
        photoAssetId: null,
        items: [],
        tags: ['caffeinated' as const],
      })),
      symptoms: [...hot.symptoms, ...cold.symptoms],
      wellbeing: [...hot.wellbeing, ...cold.wellbeing],
    };
  }

  it('runs the engine and arranges the result', () => {
    const insights = buildInsights({ logs: diaryWithAssociation(), range, now: NOW });

    expect(insights.findings.length).toBeGreaterThan(0);
    expect(insights.readiness).toEqual({ kind: 'ready' });
    expect(insights.standsOut.length).toBeGreaterThan(0);
    expect(insights.summary.comparisons).toBeGreaterThan(0);
    expect(insights.range).toEqual(range);
  });

  it('keeps the sections disjoint', () => {
    // Nothing may appear as both a headline and something to watch.
    const insights = buildInsights({ logs: diaryWithAssociation(), range, now: NOW });
    const headline = new Set(insights.standsOut.map((f) => `${f.factor.key}:${f.outcome.kind}`));

    for (const emerging of insights.emerging) {
      expect(headline.has(`${emerging.factor.key}:${emerging.outcome.kind}`)).toBe(false);
    }
  });

  it('explains an empty diary rather than returning a bare nothing', () => {
    const insights = buildInsights({ logs: emptyLogs, range, now: NOW });

    expect(insights.findings).toEqual([]);
    expect(insights.standsOut).toEqual([]);
    expect(insights.readiness).toEqual({ kind: 'no_logs' });
    expect(readinessCopy(insights.readiness).title.length).toBeGreaterThan(0);
  });

  it('names the missing good days for a diary of symptoms only', () => {
    const logs: LogSet = {
      ...emptyLogs,
      symptoms: spread.slice(0, 10).map((d, i) => ({
        ...dayLog(d, 14, `s-${i}`),
        symptomType: 'bloating' as const,
        severity: 6,
      })),
    };

    expect(buildInsights({ logs, range, now: NOW }).readiness.kind).toBe('needs_good_days');
  });

  // Every factor the engine examined reaches the screen through the map, including the ones that
  // came to nothing — the highlight sections structurally cannot show those.
  it('carries a gut map covering every factor examined', () => {
    const insights = buildInsights({ logs: diaryWithAssociation(), range, now: NOW });

    const mapped = insights.gutMap.flatMap((group) => group.entries).map((e) => e.factor.key);
    const examined = new Set(insights.findings.map((finding) => finding.factor.key));

    expect(new Set(mapped)).toEqual(examined);
    expect(mapped).toHaveLength(new Set(mapped).size);
  });

  it('returns an empty gut map for an empty diary rather than empty headings', () => {
    expect(buildInsights({ logs: emptyLogs, range, now: NOW }).gutMap).toEqual([]);
  });

  it('is deterministic', () => {
    const logs = diaryWithAssociation();

    expect(buildInsights({ logs, range, now: NOW })).toEqual(
      buildInsights({ logs, range, now: NOW })
    );
  });
});
