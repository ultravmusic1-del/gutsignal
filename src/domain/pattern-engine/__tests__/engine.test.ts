import type { Meal } from '@/domain/logs/meal';
import type { SymptomLog } from '@/domain/logs/symptom';
import type { WellbeingLog } from '@/domain/logs/wellbeing';

import { analyse, outcomesFor } from '../engine';
import { FREE_COMPARISONS } from '../multiple-testing';
import type { LogSet } from '../observations';
import { ENGINE_VERSION } from '../types';

/**
 * The whole engine, end to end (spec §53, §62).
 *
 * These are the first tests that exercise a diary rather than a function, and the first that can
 * catch a piece being wired up wrongly rather than computed wrongly.
 */

const NOW = new Date('2026-03-01T09:00:00.000Z');

const base = {
  userId: 'u1',
  note: null,
  source: 'manual' as const,
  occurredTz: 'UTC',
  occurredUtcOffsetMinutes: 0,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** `count` consecutive dates from 2026-01-01. */
function dates(count: number): string[] {
  const start = Date.parse('2026-01-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10)
  );
}

const DAYS = 56; // eight whole weeks
const ALL = dates(DAYS);
const RANGE = { start: ALL[0]!, end: ALL[DAYS - 1]! };

function meal(localDate: string, tags: Meal['tags']): Meal {
  return {
    ...base,
    id: `m-${localDate}-${tags.join('-')}`,
    title: 'A meal',
    mealSize: 'medium',
    photoAssetId: null,
    occurredAt: `${localDate}T08:00:00.000Z`,
    occurredLocalDate: localDate,
    items: [],
    tags,
  };
}

function symptom(localDate: string, severity = 6): SymptomLog {
  return {
    ...base,
    id: `s-${localDate}`,
    symptomType: 'bloating',
    severity,
    occurredAt: `${localDate}T14:00:00.000Z`,
    occurredLocalDate: localDate,
  };
}

function wellbeing(localDate: string): WellbeingLog {
  return {
    ...base,
    id: `w-${localDate}`,
    occurredAt: `${localDate}T20:00:00.000Z`,
    occurredLocalDate: localDate,
  };
}

const empty: LogSet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };

/**
 * A diary where a tag and a symptom go together on `strength` of exposed days, and the symptom
 * appears on `background` of the rest. Every day is observed, one way or the other.
 */
function diary({ strength, background }: { strength: number; background: number }): LogSet {
  const exposedDates = ALL.filter((_, i) => i % 2 === 0);
  const controlDates = ALL.filter((_, i) => i % 2 === 1);

  const symptoms: SymptomLog[] = [];
  const wellbeings: WellbeingLog[] = [];

  exposedDates.forEach((date, i) => {
    if (i < Math.round(exposedDates.length * strength)) symptoms.push(symptom(date));
    else wellbeings.push(wellbeing(date));
  });

  controlDates.forEach((date, i) => {
    if (i < Math.round(controlDates.length * background)) symptoms.push(symptom(date));
    else wellbeings.push(wellbeing(date));
  });

  return {
    ...empty,
    meals: exposedDates.map((date) => meal(date, ['caffeinated'])),
    symptoms,
    wellbeing: wellbeings,
  };
}

const run = (logs: LogSet) => analyse({ logs, range: RANGE, now: NOW });

describe('outcomesFor', () => {
  it('asks only about what the diary contains', () => {
    const outcomes = outcomesFor({ ...empty, symptoms: [symptom('2026-01-01')] });

    expect(outcomes.map((o) => o.kind)).toContain('any_symptom');
    expect(outcomes.map((o) => o.kind)).not.toContain('bowel_urgency');
    expect(outcomes.map((o) => o.kind)).not.toContain('wellbeing');
  });

  it('generates one pair of outcomes per symptom the user has recorded', () => {
    const outcomes = outcomesFor({
      ...empty,
      symptoms: [symptom('2026-01-01'), { ...symptom('2026-01-02'), symptomType: 'nausea' }],
    });

    const specific = outcomes.filter((o) => o.kind === 'symptom_occurrence');
    expect(specific.map((o) => o.symptomType).sort()).toEqual(['bloating', 'nausea']);
  });

  it('asks nothing of an empty diary', () => {
    expect(outcomesFor(empty)).toEqual([]);
  });
});

describe('analyse — the whole pass', () => {
  it('finds an obvious association and calls it something meaningful', () => {
    const findings = run(diary({ strength: 0.9, background: 0.1 }));
    const finding = findings.find(
      (f) => f.factor.key === 'caffeinated' && f.outcome.kind === 'symptom_occurrence'
    );

    expect(finding).toBeDefined();
    expect(['moderate', 'stronger_recurring_signal']).toContain(finding!.status);
    expect(finding!.metrics.absoluteDifference).toBeGreaterThan(0.5);
  });

  it('reports no clear pattern when a factor makes no difference', () => {
    const findings = run(diary({ strength: 0.5, background: 0.5 }));
    const finding = findings.find(
      (f) => f.factor.key === 'caffeinated' && f.outcome.kind === 'symptom_occurrence'
    );

    expect(finding?.status).toBe('no_clear_pattern');
  });

  it('returns negatives rather than discarding them', () => {
    // "We looked and found nothing" is a much stronger statement than "we never looked", and
    // the user cannot tell them apart if the scan drops its negatives.
    const findings = run(diary({ strength: 0.5, background: 0.5 }));

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.status === 'no_clear_pattern')).toBe(true);
  });

  it('says nothing at all about an empty diary', () => {
    expect(run(empty)).toEqual([]);
  });

  it('says nothing when the range contains no days', () => {
    expect(
      analyse({
        logs: diary({ strength: 0.9, background: 0.1 }),
        range: { start: '2026-02-01', end: '2026-01-01' },
        now: NOW,
      })
    ).toEqual([]);
  });

  it('says nothing when no factor has enough days to compare', () => {
    const sparse: LogSet = {
      ...empty,
      meals: [meal(ALL[0]!, ['caffeinated'])],
      symptoms: [symptom(ALL[0]!)],
    };

    expect(run(sparse)).toEqual([]);
  });
});

describe('analyse — reproducibility', () => {
  const logs = diary({ strength: 0.9, background: 0.1 });

  it('produces identical findings for identical input', () => {
    expect(run(logs)).toEqual(run(logs));
  });

  it('does not depend on the order logs arrive in', () => {
    const shuffled: LogSet = {
      ...logs,
      meals: [...logs.meals].reverse(),
      symptoms: [...logs.symptoms].reverse(),
      wellbeing: [...logs.wellbeing].reverse(),
    };

    expect(run(shuffled)).toEqual(run(logs));
  });

  it('stamps every finding with everything needed to recompute it', () => {
    // Spec §62. A finding a user cannot interrogate is a claim rather than evidence.
    const finding = run(logs)[0]!;

    expect(finding.engineVersion).toBe(ENGINE_VERSION);
    expect(finding.analysisStart).toBe(RANGE.start);
    expect(finding.analysisEnd).toBe(RANGE.end);
    expect(finding.generatedAt).toBe(NOW.toISOString());
    expect(finding.window).toBeDefined();
    expect(finding.trackingCompleteness.totalDays).toBe(DAYS);
    expect(finding.metrics.exposedCount).toBeGreaterThan(0);
    expect(finding.confounders).toBeDefined();
  });

  it('orders the strongest findings first', () => {
    const rank = {
      stronger_recurring_signal: 4,
      moderate: 3,
      emerging: 2,
      no_clear_pattern: 1,
      insufficient_data: 0,
    };
    const ranks = run(logs).map((f) => rank[f.status]);

    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });
});

describe('analyse — safety', () => {
  const logs = diary({ strength: 0.9, background: 0.1 });

  it('never describes a finding in causal or diagnostic language', () => {
    // The product reports associations. Every string that could reach a screen is checked.
    const text = run(logs)
      .flatMap((f) => [f.factor.label, ...f.limitations])
      .join(' ')
      .toLowerCase();

    for (const word of [
      'cause',
      'caused',
      'trigger',
      'intolerance',
      'allergy',
      'diagnos',
      'because of',
    ]) {
      expect(text).not.toContain(word);
    }
  });

  it('never claims more than the data supports on a thin diary', () => {
    // Only six exposed days, and a perfect split. Nothing here may be called strong.
    const thin: LogSet = {
      ...empty,
      meals: ALL.slice(0, 6).map((date) => meal(date, ['caffeinated'])),
      symptoms: ALL.slice(0, 6).map((date) => symptom(date)),
      wellbeing: ALL.slice(6, 14).map((date) => wellbeing(date)),
    };

    for (const finding of run(thin)) {
      expect(finding.status).not.toBe('stronger_recurring_signal');
    }
  });

  it('carries a limitation whenever confidence is held back', () => {
    const thin: LogSet = {
      ...empty,
      meals: ALL.slice(0, 6).map((date) => meal(date, ['caffeinated'])),
      symptoms: ALL.slice(0, 6).map((date) => symptom(date)),
      wellbeing: ALL.slice(6, 14).map((date) => wellbeing(date)),
    };

    for (const finding of run(thin)) {
      if (finding.confidence < 0.6) expect(finding.limitations.length).toBeGreaterThan(0);
    }
  });
});

describe('analyse — the scan accounts for its own breadth', () => {
  /**
   * The association from `diary`, plus five unrelated tags rotating through the same days.
   *
   * Each extra tag lands on roughly a sixth of the range, which is enough days to qualify as a
   * candidate and enough absent days to compare against — so the engine really does make dozens
   * of comparisons, which is the situation §61 exists for.
   */
  function wideDiary(): LogSet {
    const core = diary({ strength: 0.9, background: 0.1 });
    const noise: Meal['tags'][number][] = [
      'alcoholic',
      'spicy',
      'rich_high_fat',
      'restaurant',
      'homemade',
    ];

    const extras = ALL.map((date, i) => ({
      ...meal(date, [noise[i % noise.length]!]),
      id: `noise-${i}`,
    }));

    return { ...core, meals: [...core.meals, ...extras] };
  }

  it('does not penalise a narrow scan', () => {
    // The plain diary has one factor and a handful of outcomes: ordinary analysis, not a
    // fishing expedition, and nothing to apologise for.
    const findings = run(diary({ strength: 0.9, background: 0.1 }));

    expect(findings.length).toBeLessThanOrEqual(FREE_COMPARISONS);
    expect(findings.every((f) => f.limitations.every((line) => !/combinations/.test(line)))).toBe(
      true
    );
  });

  it('tells the user how many comparisons a wide scan made', () => {
    const findings = run(wideDiary());

    expect(findings.length).toBeGreaterThan(FREE_COMPARISONS);
    expect(findings.every((f) => f.limitations.some((line) => /combinations/.test(line)))).toBe(
      true
    );
  });

  it('holds a comparison in a wide scan to a higher bar than the same one alone', () => {
    const logs = wideDiary();

    const alone = analyse({
      logs,
      range: RANGE,
      now: NOW,
      outcomes: [{ kind: 'symptom_occurrence', symptomType: 'bloating' }],
      limits: { minExposedDays: 4, minControlDays: 4, minItemMentions: 3 },
    }).find((f) => f.factor.key === 'caffeinated');

    const amongMany = run(logs).find(
      (f) => f.factor.key === 'caffeinated' && f.outcome.kind === 'symptom_occurrence'
    );

    expect(alone).toBeDefined();
    expect(amongMany).toBeDefined();
    expect(amongMany!.confidence).toBeLessThan(alone!.confidence);
  });
});
