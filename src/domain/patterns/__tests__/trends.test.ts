import {
  makeMeal,
  makeSymptom,
  makeWellbeing,
  tombstone,
} from '@/domain/pattern-engine/fixtures/builders';
import type { DateRange, LogSet } from '@/domain/pattern-engine/observations';

import {
  buildTrends,
  MIN_BUCKETS_FOR_TREND,
  TREND_BUCKET_DAYS,
  trendBuckets,
  worstSeverityOn,
} from '../trends';

/**
 * Trends over time (spec §49).
 *
 * The arithmetic here is simple. What is not simple is refusing to draw things the diary does not
 * support, and every test below is about that refusal:
 *
 * - a week with nothing logged is a **gap**, never a zero (`CLAUDE.md` §59);
 * - symptom frequency is measured against days the user actually reported on, because dividing by
 *   calendar days turns a week off from logging into a week of good health;
 * - two points are not a trend.
 */

const emptyLogs: LogSet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };

const range = (start: string, end: string): DateRange => ({ start, end });

// The engine's own fixture builders, so a trend and a finding are computed from identically
// shaped logs. A second set of hand-rolled fixtures would be a second thing to keep in step.
const symptom = (localDate: string, severity: number) =>
  makeSymptom(localDate, { severity, id: `symptom-${localDate}-${severity}` });

const goodDay = (localDate: string) => makeWellbeing(localDate);

const meal = (localDate: string) => makeMeal(localDate);

const logsWith = (overrides: Partial<LogSet>): LogSet => ({ ...emptyLogs, ...overrides });

const seriesFor = (logs: LogSet, dates: DateRange, key: string) =>
  buildTrends({ logs, range: dates }).find((series) => series.key === key);

describe('bucketing', () => {
  it('splits a range into whole weeks', () => {
    const buckets = trendBuckets(range('2026-06-01', '2026-06-28'));

    expect(buckets).toHaveLength(4);
    expect(buckets.every((bucket) => bucket.dates.length === TREND_BUCKET_DAYS)).toBe(true);
  });

  // Counted back from the end, so the newest bucket always ends today and "this week" means this
  // week. The cost is a short bucket at the far end, which is reported honestly rather than padded.
  it('ends the last bucket on the last day of the range', () => {
    const buckets = trendBuckets(range('2026-06-01', '2026-06-30'));
    const last = buckets[buckets.length - 1];

    expect(last?.end).toBe('2026-06-30');
    expect(buckets[0]?.dates.length).toBe(2);
    expect(buckets[0]?.start).toBe('2026-06-01');
  });

  it('is empty for a backwards range', () => {
    expect(trendBuckets(range('2026-06-30', '2026-06-01'))).toEqual([]);
  });

  it('covers every date in the range exactly once', () => {
    const dates = trendBuckets(range('2026-06-01', '2026-07-15')).flatMap((bucket) => bucket.dates);

    expect(dates).toHaveLength(45);
    expect(new Set(dates).size).toBe(45);
  });
});

describe('worstSeverityOn', () => {
  // The engine takes a day's worst reading rather than its mean, and the chart must agree with it
  // — two surfaces disagreeing about the same day is worse than either choice.
  it('takes the worst reading of the day, not the average', () => {
    expect(worstSeverityOn([symptom('2026-06-01', 3), symptom('2026-06-01', 8)])).toBe(8);
  });

  it('is null on a day with no symptom recorded', () => {
    expect(worstSeverityOn([])).toBeNull();
  });
});

describe('symptom frequency', () => {
  // The single most important rule on this screen. A week with nothing logged has no rate at all;
  // rendering it as 0% would show a week of perfect health the user never reported.
  it('leaves a week with nothing logged as a gap rather than a zero', () => {
    const logs = logsWith({ symptoms: [symptom('2026-06-01', 5)] });
    const series = seriesFor(logs, range('2026-06-01', '2026-06-14'), 'symptom_days');

    expect(series?.points[0]?.value).toBe(1);
    expect(series?.points[1]?.value).toBeNull();
    expect(series?.points[1]?.observedDays).toBe(0);
  });

  // Dividing by calendar days would make a week of not logging look like a week of good health.
  it('measures against the days actually reported on, not the days in the week', () => {
    const logs = logsWith({
      symptoms: [symptom('2026-06-01', 5)],
      wellbeing: [goodDay('2026-06-02'), goodDay('2026-06-03')],
    });

    const series = seriesFor(logs, range('2026-06-01', '2026-06-07'), 'symptom_days');

    expect(series?.points[0]?.observedDays).toBe(3);
    expect(series?.points[0]?.value).toBeCloseTo(1 / 3);
  });

  // A meal says what was eaten; it says nothing about how the day felt (§59).
  it('does not treat a day of meals alone as a day reported on', () => {
    const logs = logsWith({ meals: [meal('2026-06-02'), meal('2026-06-03')] });
    const series = seriesFor(logs, range('2026-06-01', '2026-06-07'), 'symptom_days');

    expect(series?.points[0]?.observedDays).toBe(0);
    expect(series?.points[0]?.value).toBeNull();
  });

  it('counts a day once however many symptoms were recorded on it', () => {
    const logs = logsWith({
      symptoms: [symptom('2026-06-01', 4), symptom('2026-06-01', 7)],
      wellbeing: [goodDay('2026-06-02')],
    });

    expect(
      seriesFor(logs, range('2026-06-01', '2026-06-07'), 'symptom_days')?.points[0]?.value
    ).toBeCloseTo(0.5);
  });
});

describe('symptom severity', () => {
  it('averages the worst reading of each symptom day', () => {
    const logs = logsWith({
      symptoms: [symptom('2026-06-01', 4), symptom('2026-06-01', 8), symptom('2026-06-02', 6)],
    });

    expect(
      seriesFor(logs, range('2026-06-01', '2026-06-07'), 'symptom_severity')?.points[0]?.value
    ).toBe(7);
  });

  // A week of good days has no severity to average. Plotting zero would read as "no pain at all",
  // which is a different and stronger claim than "nothing was recorded".
  it('is a gap in a week with no symptoms, even when that week was logged carefully', () => {
    const logs = logsWith({ wellbeing: [goodDay('2026-06-01'), goodDay('2026-06-02')] });
    const series = seriesFor(logs, range('2026-06-01', '2026-06-07'), 'symptom_severity');

    expect(series?.points[0]?.value).toBeNull();
  });
});

describe('logging consistency', () => {
  // The one series whose denominator really is calendar days, because that is what it measures.
  it('counts any log at all against the days in the week', () => {
    const logs = logsWith({ meals: [meal('2026-06-01')], symptoms: [symptom('2026-06-03', 5)] });
    const series = seriesFor(logs, range('2026-06-01', '2026-06-07'), 'logging_days');

    expect(series?.points[0]?.value).toBeCloseTo(2 / 7);
  });

  it('is zero rather than a gap in a week with nothing logged', () => {
    const series = seriesFor(emptyLogs, range('2026-06-01', '2026-06-07'), 'logging_days');

    expect(series?.points[0]?.value).toBe(0);
  });
});

describe('deciding whether there is a trend to draw at all', () => {
  it('reports how many weeks actually carry a value', () => {
    const logs = logsWith({
      symptoms: [symptom('2026-06-01', 5), symptom('2026-06-08', 5)],
    });

    const series = seriesFor(logs, range('2026-06-01', '2026-06-21'), 'symptom_days');

    expect(series?.observedBuckets).toBe(2);
    expect(series?.hasTrend).toBe(false);
  });

  it('needs more than a pair of points before calling something a trend', () => {
    const logs = logsWith({
      symptoms: [symptom('2026-06-01', 5), symptom('2026-06-08', 5), symptom('2026-06-15', 5)],
    });

    const series = seriesFor(logs, range('2026-06-01', '2026-06-21'), 'symptom_days');

    expect(MIN_BUCKETS_FOR_TREND).toBe(3);
    expect(series?.observedBuckets).toBe(3);
    expect(series?.hasTrend).toBe(true);
  });

  it('gives every series a label and a unit a chart can read', () => {
    for (const series of buildTrends({
      logs: emptyLogs,
      range: range('2026-06-01', '2026-06-28'),
    })) {
      expect(series.label.length).toBeGreaterThan(0);
      expect(['rate', 'severity']).toContain(series.unit);
    }
  });

  it('is deterministic', () => {
    const logs = logsWith({ symptoms: [symptom('2026-06-03', 6)], meals: [meal('2026-06-04')] });
    const dates = range('2026-06-01', '2026-06-28');

    expect(buildTrends({ logs, range: dates })).toEqual(buildTrends({ logs, range: dates }));
  });

  it('ignores deleted entries', () => {
    const deleted = tombstone(symptom('2026-06-01', 9));
    const logs = logsWith({ symptoms: [deleted], wellbeing: [goodDay('2026-06-01')] });

    const series = seriesFor(logs, range('2026-06-01', '2026-06-07'), 'symptom_days');

    expect(series?.points[0]?.value).toBe(0);
  });
});
