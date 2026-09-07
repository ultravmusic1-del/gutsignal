import type { LogSet } from '@/domain/pattern-engine/observations';

import { MINIMUM_USEFUL_DAYS, trackingCounts, type InsightsReadiness } from '../insights';
import { firstInsightProgress } from '../progress';

/**
 * What Today tells someone whose diary is still filling up.
 *
 * The rule this file mostly exists to hold: **nothing here may promise a finding.** A diary with a
 * hundred well-tracked days may contain nothing related to anything else, and a progress card
 * ending in "insight unlocked" would be a promise the engine cannot keep (spec §32).
 */

const EMPTY: LogSet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };

let counter = 0;

const on = (localDate: string) => {
  counter += 1;
  return { id: `log-${counter}`, occurredLocalDate: localDate } as unknown as never;
};

const days = (count: number, from = 1) =>
  Array.from({ length: count }, (_, i) => `2026-09-${String(from + i).padStart(2, '0')}`);

const logs = (over: Partial<Record<keyof LogSet, string[]>>): LogSet => ({
  meals: (over.meals ?? []).map(on),
  symptoms: (over.symptoms ?? []).map(on),
  bowel: (over.bowel ?? []).map(on),
  wellbeing: (over.wellbeing ?? []).map(on),
  context: (over.context ?? []).map(on),
});

// Counts are derived through the same function the engine uses, so a test cannot pass by
// disagreeing with production about what a day is.
const progress = (logSet: LogSet, readiness: InsightsReadiness) =>
  firstInsightProgress({ tracking: trackingCounts(logSet), readiness });

beforeEach(() => {
  counter = 0;
});

describe('what the card says', () => {
  it('welcomes an empty diary without asking for anything specific', () => {
    const result = progress(EMPTY, { kind: 'no_logs' });

    expect(result.ready).toBe(false);
    expect(result.action).toBe('log');
    expect(result.title).toBe('Your diary starts here');
  });

  /**
   * The single biggest unlock, and the least guessable: without a day recorded as fine there is no
   * control group, so nothing can be compared however much else is logged.
   */
  it('asks for a good day when symptoms have been logged and nothing else has', () => {
    const result = progress(logs({ symptoms: days(5) }), {
      kind: 'needs_good_days',
      daysWithSymptom: 5,
    });

    expect(result.action).toBe('log_good_day');
    expect(result.title).toBe('One tap would unlock comparing');
  });

  // A missing good day outranks a short diary: it is one tap and it unblocks comparing outright.
  it('asks for a good day even when the day count is also short', () => {
    const result = progress(logs({ symptoms: days(2) }), {
      kind: 'needs_more_days',
      daysLogged: 2,
      daysNeeded: MINIMUM_USEFUL_DAYS,
    });

    expect(result.action).toBe('log_good_day');
  });

  it('does not ask for a good day when one is already recorded', () => {
    const result = progress(logs({ symptoms: days(3), wellbeing: ['2026-09-09'] }), {
      kind: 'needs_more_days',
      daysLogged: 4,
      daysNeeded: MINIMUM_USEFUL_DAYS,
    });

    expect(result.action).toBe('log');
  });

  it('points at Insights once there is something to show', () => {
    const result = progress(logs({ symptoms: days(9) }), { kind: 'ready' });

    expect(result.ready).toBe(true);
    expect(result.action).toBe('view_insights');
  });

  /**
   * "We looked and found nothing" is a result, not a failure, and must not read as one.
   */
  it('treats finding nothing as an answer rather than a gap', () => {
    const result = progress(logs({ symptoms: days(20) }), {
      kind: 'looked_and_found_nothing',
      comparisons: 12,
    });

    expect(result.body).toMatch(/real result/);
    expect(result.body).not.toMatch(/keep trying|not enough|failed/i);
  });
});

describe('the steps', () => {
  it('counts distinct days, not entries', () => {
    const result = progress(
      // Three entries, one day.
      logs({ meals: ['2026-09-01', '2026-09-01'], symptoms: ['2026-09-01'] }),
      { kind: 'needs_more_days', daysLogged: 1, daysNeeded: MINIMUM_USEFUL_DAYS }
    );

    expect(result.steps.find((step) => step.key === 'days')?.detail).toBe(
      `1 of about ${MINIMUM_USEFUL_DAYS}`
    );
  });

  it('counts a day across different kinds of entry only once', () => {
    const result = progress(logs({ meals: days(3), bowel: days(3), context: days(3) }), {
      kind: 'needs_more_days',
      daysLogged: 3,
      daysNeeded: MINIMUM_USEFUL_DAYS,
    });

    expect(result.steps.find((step) => step.key === 'days')?.detail).toBe(
      `3 of about ${MINIMUM_USEFUL_DAYS}`
    );
  });

  /**
   * Both sides of the threshold.
   *
   * Asserting only the "done" side lets the comparison be anything at all — an earlier version of
   * this test passed with `daysLogged >= 1`, which would have marked the step complete on a
   * one-day diary and made the card meaningless.
   */
  it('marks the day step done at the threshold and not below it', () => {
    const dayStep = (count: number) =>
      progress(logs({ meals: days(count) }), { kind: 'needs_more_variety' }).steps.find(
        (step) => step.key === 'days'
      );

    expect(dayStep(MINIMUM_USEFUL_DAYS)?.done).toBe(true);
    expect(dayStep(MINIMUM_USEFUL_DAYS - 1)?.done).toBe(false);
    expect(dayStep(1)?.done).toBe(false);
  });

  it('marks the good-day and hard-day steps from what is recorded', () => {
    const result = progress(logs({ wellbeing: ['2026-09-01'], symptoms: ['2026-09-02'] }), {
      kind: 'needs_more_days',
      daysLogged: 2,
      daysNeeded: MINIMUM_USEFUL_DAYS,
    });

    expect(result.steps.find((step) => step.key === 'good_day')?.done).toBe(true);
    expect(result.steps.find((step) => step.key === 'hard_day')?.done).toBe(true);
  });
});

/**
 * §32, as an assertion rather than a comment.
 *
 * No state of this card may say that a finding is coming. The target is being able to *compare*,
 * which the engine can guarantee; having something to *show*, which it cannot.
 */
describe('what it must never promise', () => {
  const everyState: InsightsReadiness[] = [
    { kind: 'no_logs' },
    { kind: 'needs_good_days', daysWithSymptom: 3 },
    { kind: 'needs_more_days', daysLogged: 4, daysNeeded: MINIMUM_USEFUL_DAYS },
    { kind: 'needs_more_variety' },
    { kind: 'looked_and_found_nothing', comparisons: 9 },
    { kind: 'ready' },
  ];

  it.each(everyState.map((readiness) => [readiness.kind, readiness] as const))(
    '%s never promises a finding, a diagnosis or a cause',
    (_kind, readiness) => {
      const result = progress(logs({ symptoms: days(3), wellbeing: ['2026-09-20'] }), readiness);
      const text = `${result.title} ${result.body}`;

      expect(text).not.toMatch(/unlock your insight|you will (see|find|get)|guarantee|diagnos/i);
      expect(text).not.toMatch(/\bcause[sd]?\b|\btrigger(s|ed)?\b/i);
    }
  );

  it('never states a percentage of the way there', () => {
    const result = progress(logs({ meals: days(7) }), {
      kind: 'needs_more_days',
      daysLogged: 7,
      daysNeeded: MINIMUM_USEFUL_DAYS,
    });

    for (const step of result.steps) {
      expect(step.detail).not.toMatch(/%/);
    }
  });
});
