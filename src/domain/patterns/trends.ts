/**
 * Trends over time (spec §49).
 *
 * The arithmetic is trivial. Everything difficult here is about refusing to draw things the diary
 * does not support, because a chart is the most persuasive thing in the app and the easiest to
 * lie with.
 *
 * Three rules govern the whole module:
 *
 * 1. **A week with nothing observed has no value.** Not zero — `null`. Zero symptoms is a claim
 *    about health; nothing recorded is a claim about logging, and `CLAUDE.md` §59 exists because
 *    conflating the two corrupts everything downstream. A gap must reach the chart as a gap.
 * 2. **Symptom frequency divides by days the user reported on**, not by days in the week.
 *    Dividing by calendar days turns a week off from logging into a week of good health, which is
 *    the single most flattering and most dishonest thing this screen could do.
 * 3. **Two points are not a trend.** `MIN_BUCKETS_FOR_TREND` gates whether a series is worth
 *    drawing at all.
 *
 * There is deliberately **no direction, no percentage change and no "better/worse than last
 * week"**. Comparing two adjacent buckets of a noisy diary is exactly the false-signal machine
 * §21 warns about, and unlike the pattern engine there is no confidence machinery here to hold it
 * back. The chart shows what was recorded; the reader draws the line.
 */

import type { SymptomLog } from '@/domain/logs/symptom';
import {
  buildDays,
  enumerateLocalDates,
  type DateRange,
  type DayLogs,
  type LogSet,
} from '@/domain/pattern-engine/observations';

/** A week. Long enough to smooth a diary's day-to-day noise, short enough to see movement. */
export const TREND_BUCKET_DAYS = 7;

/**
 * Buckets carrying a value before a series is drawn.
 *
 * Three, not two. Two points make a line between two points, which reads as a direction while
 * carrying none — and a reader shown a downward line will believe it. This is a display
 * threshold, not a statistical one, and it makes no claim about significance.
 */
export const MIN_BUCKETS_FOR_TREND = 3;

export type TrendKey = 'symptom_days' | 'symptom_severity' | 'logging_days';

/** How a value should be read. Drives axis and formatting, never interpretation. */
export type TrendUnit = 'rate' | 'severity';

export type TrendBucket = {
  start: string;
  end: string;
  dates: string[];
};

export type TrendPoint = {
  start: string;
  end: string;
  /** Calendar days in the bucket. Seven, except the oldest, which may be short. */
  totalDays: number;
  /** Days that could say anything about this measure. Zero means the point is a gap. */
  observedDays: number;
  /** `null` where nothing was observed. Never coerce this to zero. */
  value: number | null;
};

export type TrendSeries = {
  key: TrendKey;
  label: string;
  /** What the value means, in a sentence, for the chart's own caption. */
  description: string;
  unit: TrendUnit;
  points: TrendPoint[];
  /** How many points carry a value. */
  observedBuckets: number;
  /** Whether there is enough to draw. */
  hasTrend: boolean;
};

/**
 * Weekly buckets, counted back from the end of the range.
 *
 * Anchored on the end rather than the start so the newest bucket always finishes on the last day
 * of the range — "this week" has to mean this week, or the most recent point is a stale mixture.
 * The cost is a short bucket at the far end, which is reported honestly through `totalDays`
 * rather than padded out with days that are not in the range.
 */
export function trendBuckets(range: DateRange, bucketDays = TREND_BUCKET_DAYS): TrendBucket[] {
  const dates = enumerateLocalDates(range);
  if (dates.length === 0) return [];

  const buckets: TrendBucket[] = [];

  for (let end = dates.length; end > 0; end -= bucketDays) {
    const slice = dates.slice(Math.max(0, end - bucketDays), end);
    const first = slice[0];
    const last = slice[slice.length - 1];
    if (first === undefined || last === undefined) continue;

    buckets.push({ start: first, end: last, dates: slice });
  }

  return buckets.reverse();
}

/**
 * The worst symptom recorded on a day, or null.
 *
 * The worst reading rather than the mean, matching `observations.ts` exactly. Two surfaces
 * disagreeing about how bad the same day was is worse than either choice would be on its own,
 * and the engine's reasoning applies here too: a day with one severe episode and three mild ones
 * was not a mild day.
 */
export function worstSeverityOn(symptoms: SymptomLog[]): number | null {
  let worst: number | null = null;

  for (const symptom of symptoms) {
    if (worst === null || symptom.severity > worst) worst = symptom.severity;
  }

  return worst;
}

/**
 * Whether a day says anything about how the user felt.
 *
 * A symptom entry or an explicit good day, and nothing else. A day of meals alone says what was
 * eaten and nothing about how it went (§59) — counting it as a reported day would quietly inflate
 * every denominator on this screen.
 */
const reportedOn = (day: DayLogs) => day.symptoms.length > 0 || day.wellbeing.length > 0;

const hasAnyLog = (day: DayLogs) =>
  day.meals.length > 0 ||
  day.symptoms.length > 0 ||
  day.bowel.length > 0 ||
  day.wellbeing.length > 0 ||
  day.context.length > 0;

type SeriesDefinition = {
  key: TrendKey;
  label: string;
  description: string;
  unit: TrendUnit;
  /** Days in a bucket that can contribute. An empty result makes the point a gap. */
  observable: (days: DayLogs[]) => DayLogs[];
  /** The value from those days. `null` when they cannot produce one. */
  measure: (observable: DayLogs[]) => number | null;
};

const SERIES: SeriesDefinition[] = [
  {
    key: 'symptom_days',
    label: 'Days with symptoms',
    description: 'Out of the days you reported on that week.',
    unit: 'rate',
    observable: (days) => days.filter(reportedOn),
    measure: (days) =>
      days.length === 0 ? null : days.filter((day) => day.symptoms.length > 0).length / days.length,
  },
  {
    key: 'symptom_severity',
    label: 'How strong they felt',
    description: 'The worst reading of each symptom day, averaged. 1 to 10.',
    unit: 'severity',
    // Only symptom days can contribute an intensity. A carefully logged week of good days has no
    // severity to average, and plotting zero there would read as "no discomfort at all" — a
    // stronger claim than the diary makes.
    observable: (days) => days.filter((day) => day.symptoms.length > 0),
    measure: (days) => {
      const worst = days.flatMap((day) => {
        const value = worstSeverityOn(day.symptoms);
        return value === null ? [] : [value];
      });

      if (worst.length === 0) return null;
      return worst.reduce((total, value) => total + value, 0) / worst.length;
    },
  },
  {
    key: 'logging_days',
    label: 'Days you logged',
    description: 'Out of the days in that week.',
    unit: 'rate',
    // The one series whose denominator really is calendar days, because that is precisely what it
    // measures — and the reason it belongs on the screen at all. It is the context that lets a
    // reader tell a good week from an unrecorded one.
    observable: (days) => days,
    measure: (days) => (days.length === 0 ? null : days.filter(hasAnyLog).length / days.length),
  },
];

/**
 * Every series, for one diary over one range.
 *
 * Pure and deterministic, like everything else in `domain/patterns`: the same logs always give
 * the same chart.
 */
export function buildTrends({ logs, range }: { logs: LogSet; range: DateRange }): TrendSeries[] {
  const days = buildDays(logs, range);
  const byDate = new Map(days.map((day) => [day.localDate, day]));
  const buckets = trendBuckets(range);

  return SERIES.map((definition) => {
    const points: TrendPoint[] = buckets.map((bucket) => {
      const bucketDays = bucket.dates.flatMap((date) => {
        const day = byDate.get(date);
        return day === undefined ? [] : [day];
      });

      const observable = definition.observable(bucketDays);

      return {
        start: bucket.start,
        end: bucket.end,
        totalDays: bucket.dates.length,
        observedDays: observable.length,
        value: definition.measure(observable),
      };
    });

    const observedBuckets = points.filter((point) => point.value !== null).length;

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      unit: definition.unit,
      points,
      observedBuckets,
      hasTrend: observedBuckets >= MIN_BUCKETS_FOR_TREND,
    };
  });
}
