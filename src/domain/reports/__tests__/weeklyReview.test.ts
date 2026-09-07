import type { LogSet } from '@/domain/pattern-engine/observations';
import type { Finding } from '@/domain/pattern-engine/types';

import {
  buildWeeklyReview,
  MIN_DAYS_FOR_COMPARISON,
  weekBefore,
  weekEnding,
  type WeeklyReview,
} from '../weeklyReview';

/**
 * The weekly review, and the three ways a seven-day summary lies.
 *
 * It can divide by seven and turn silence into good news. It can compare a well-tracked week with
 * an untracked one and call the difference a change in health. And it can narrate two points as a
 * direction. Each has a test here.
 */

const GENERATED = new Date('2026-09-07T09:00:00.000Z');

const EMPTY: LogSet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };

let counter = 0;

function symptomOn(localDate: string, severity = 5) {
  counter += 1;
  return {
    id: `symptom-${counter}`,
    userId: 'u1',
    symptomType: 'bloating',
    severity,
    occurredAt: `${localDate}T12:00:00.000Z`,
    occurredLocalDate: localDate,
    occurredTz: 'UTC',
    occurredUtcOffsetMinutes: 0,
    note: undefined,
    source: 'manual',
    deletedAt: null,
    createdAt: `${localDate}T12:00:00.000Z`,
    updatedAt: `${localDate}T12:00:00.000Z`,
  } as unknown as LogSet['symptoms'][number];
}

function wellbeingOn(localDate: string) {
  counter += 1;
  return {
    id: `wellbeing-${counter}`,
    userId: 'u1',
    occurredAt: `${localDate}T12:00:00.000Z`,
    occurredLocalDate: localDate,
    occurredTz: 'UTC',
    occurredUtcOffsetMinutes: 0,
    note: undefined,
    source: 'manual',
    deletedAt: null,
    createdAt: `${localDate}T12:00:00.000Z`,
    updatedAt: `${localDate}T12:00:00.000Z`,
  } as unknown as LogSet['wellbeing'][number];
}

/** A bowel entry: it makes a day *logged* without making it *reported on*. */
function bowelOn(localDate: string) {
  counter += 1;
  return {
    id: `bowel-${counter}`,
    userId: 'u1',
    bristolType: 4,
    urgency: 'low',
    difficulty: 'easy',
    incomplete: false,
    occurredAt: `${localDate}T12:00:00.000Z`,
    occurredLocalDate: localDate,
    occurredTz: 'UTC',
    occurredUtcOffsetMinutes: 0,
    note: undefined,
    source: 'manual',
    deletedAt: null,
    createdAt: `${localDate}T12:00:00.000Z`,
    updatedAt: `${localDate}T12:00:00.000Z`,
  } as unknown as LogSet['bowel'][number];
}

const logs = (overrides: Partial<LogSet>): LogSet => ({ ...EMPTY, ...overrides });

const WEEK = { start: '2026-08-31', end: '2026-09-06' };

const review = (over: {
  logs?: LogSet;
  previousLogs?: LogSet;
  findings?: Finding[];
}): WeeklyReview =>
  buildWeeklyReview({
    logs: over.logs ?? EMPTY,
    previousLogs: over.previousLogs ?? EMPTY,
    findings: over.findings ?? [],
    range: WEEK,
    generatedAt: GENERATED,
  });

beforeEach(() => {
  counter = 0;
});

describe('the week under review', () => {
  it('covers the seven complete days before today', () => {
    expect(weekEnding('2026-09-07')).toEqual({ start: '2026-08-31', end: '2026-09-06' });
  });

  // Today is deliberately excluded: a review of a day still in progress would report a partial
  // day as a quiet one.
  it('never includes today', () => {
    expect(weekEnding('2026-09-07').end).not.toBe('2026-09-07');
  });

  it('puts the previous week immediately before it, without a gap or an overlap', () => {
    expect(weekBefore(WEEK)).toEqual({ start: '2026-08-24', end: '2026-08-30' });
  });

  it('crosses a month boundary correctly', () => {
    expect(weekEnding('2026-03-03')).toEqual({ start: '2026-02-24', end: '2026-03-02' });
  });
});

describe('what the week records', () => {
  it('counts days logged out of seven', () => {
    const result = review({
      logs: logs({ symptoms: [symptomOn('2026-09-01'), symptomOn('2026-09-02')] }),
    });

    expect(result.tracking.daysLogged).toBe(2);
    expect(result.tracking.totalDays).toBe(7);
    expect(result.tracking.daysWithNothingRecorded).toBe(5);
  });

  /**
   * §19: a day with nothing recorded is not a day without symptoms.
   *
   * The rate that matters is out of days the person said something about, and the days they said
   * nothing about are named rather than folded in.
   */
  it('reports symptom days against days reported on, not against seven', () => {
    const result = review({
      logs: logs({
        symptoms: [symptomOn('2026-09-01')],
        wellbeing: [wellbeingOn('2026-09-02')],
      }),
    });

    expect(result.symptomDays.thisWeek).toBe(1);
    expect(result.tracking.daysReportedOn).toBe(2);
    expect(result.tracking.daysWithNothingRecorded).toBe(5);
  });

  it('averages each symptom day worst reading', () => {
    const result = review({
      logs: logs({
        // Two on one day: the worst of the day counts once, not twice.
        symptoms: [
          symptomOn('2026-09-01', 4),
          symptomOn('2026-09-01', 8),
          symptomOn('2026-09-02', 6),
        ],
      }),
    });

    expect(result.meanWorstSeverity).toBe(7);
  });

  it('has no severity to report when nothing was recorded', () => {
    expect(review({}).meanWorstSeverity).toBeNull();
  });
});

describe('comparing with last week', () => {
  const wellTracked = (dates: string[]) => logs({ wellbeing: dates.map(wellbeingOn) });

  const thisWeekDates = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'];
  const lastWeekDates = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27'];

  it('compares two comparably tracked weeks', () => {
    const result = review({
      logs: logs({
        wellbeing: thisWeekDates.map(wellbeingOn),
        symptoms: [symptomOn('2026-08-31')],
      }),
      previousLogs: logs({
        wellbeing: lastWeekDates.map(wellbeingOn),
        symptoms: [symptomOn('2026-08-24'), symptomOn('2026-08-25'), symptomOn('2026-08-26')],
      }),
    });

    expect(result.symptomDays.comparable).toBe(true);
    expect(result.symptomDays.thisWeek).toBe(1);
    expect(result.symptomDays.lastWeek).toBe(3);
    expect(result.symptomDays.change).toBe(-2);
  });

  /**
   * The comparison this refuses to make.
   *
   * Six tracked days against one is not an improvement or a decline — it is a change in how much
   * of the diary got filled in. Presenting that difference would read as a finding and carry no
   * information at all.
   */
  it('refuses to compare when last week was barely tracked', () => {
    const result = review({
      logs: wellTracked(thisWeekDates),
      previousLogs: logs({ wellbeing: [wellbeingOn('2026-08-24')] }),
    });

    expect(result.symptomDays.comparable).toBe(false);
  });

  it('refuses to compare when this week was barely tracked', () => {
    const result = review({
      logs: logs({ wellbeing: [wellbeingOn('2026-08-31')] }),
      previousLogs: wellTracked(lastWeekDates),
    });

    expect(result.symptomDays.comparable).toBe(false);
  });

  it('needs the threshold in both weeks, not on average across them', () => {
    const justUnder = thisWeekDates.slice(0, MIN_DAYS_FOR_COMPARISON - 1);

    const result = review({
      logs: wellTracked(justUnder),
      previousLogs: wellTracked(lastWeekDates),
    });

    expect(result.symptomDays.comparable).toBe(false);
  });
});

describe('how much the week supports', () => {
  it('is quiet when nothing at all was recorded', () => {
    expect(review({}).depth).toBe('quiet');
  });

  it('is thin when only a day or two was reported on', () => {
    expect(review({ logs: logs({ symptoms: [symptomOn('2026-09-01')] }) }).depth).toBe('thin');
  });

  /**
   * The case that separates "logged" from "reported on", and the reason `depthOf` reads the
   * second rather than the first.
   *
   * A week of bowel entries every day is a diligently filled diary in which the person never once
   * said how they felt — so it cannot answer the question the review asks, however full it looks.
   * An earlier version of this file described that behaviour in a comment and never exercised it:
   * both weeks it tested happened to have `daysLogged === daysReportedOn`, so swapping one for the
   * other changed nothing and a mutation of `depthOf` survived the suite.
   */
  it('is thin when the week is full of entries that say nothing about how the person was', () => {
    const everyDay = [
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ];

    const result = review({ logs: logs({ bowel: everyDay.map(bowelOn) }) });

    expect(result.tracking.daysLogged).toBe(7);
    expect(result.tracking.daysReportedOn).toBe(0);
    expect(result.depth).toBe('thin');
  });

  it('is enough once the week was reported on for most of it', () => {
    const result = review({
      logs: logs({
        wellbeing: ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'].map(wellbeingOn),
      }),
    });

    expect(result.depth).toBe('enough');
  });
});

describe('findings', () => {
  /**
   * The review reports findings; it does not make them. Nothing here computes an association, and
   * nothing may present one as a cause (§17, §18).
   */
  it('passes the engine findings through without inventing any', () => {
    const result = review({ findings: [] });

    expect(result.standsOut).toEqual([]);
    expect(result.emerging).toEqual([]);
  });
});
