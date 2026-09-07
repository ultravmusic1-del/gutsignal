/**
 * The weekly review (spec §9, Milestone 9).
 *
 * This exists because Milestone 14 shipped a reminder that says "Your weekly review is ready", and
 * a notification promising something the app does not have is worse than no notification at all.
 *
 * ## What a week can honestly say
 *
 * Seven days is a small sample, and the temptation in a weekly summary is to narrate it: better,
 * worse, improving. Three rules keep this one truthful.
 *
 * **Rates come out of days reported on, never out of seven.** A day with nothing recorded is not a
 * day without symptoms (`CLAUDE.md` §19), and dividing by seven quietly converts silence into good
 * news.
 *
 * **A comparison with last week is offered only when both weeks were tracked comparably.** Someone
 * who logged six days this week and one last week has not improved or worsened; they have changed
 * how much they log. Comparing those two numbers produces a sentence that sounds like a finding
 * and contains no information, so `comparable` is false and the screen says why.
 *
 * **Two weeks is never a direction.** The review reports a difference in what was recorded. It
 * does not say "improving", does not extrapolate, and never attributes a change to anything — the
 * trend gate the Insights screen uses exists precisely because two points make a line that reads
 * as a direction while carrying none (§17, §21).
 *
 * Findings come from the deterministic engine and are passed through untouched. Nothing here
 * computes an association.
 */

import { formatLocalDate } from '@/domain/patterns/findingDetail';
import { whatStandsOut, worthInvestigating } from '@/domain/patterns/insights';
import type { Finding } from '@/domain/pattern-engine/types';
import {
  buildDays,
  trackingCompleteness,
  type DateRange,
  type DayLogs,
  type LogSet,
} from '@/domain/pattern-engine/observations';
import { previousLocalDate } from '@/domain/time/occurrence';

export const WEEK_DAYS = 7;

/**
 * How many of the seven days each week needs before the two can be compared.
 *
 * Four is a majority of the week rather than a statistically derived number, and it is written
 * here rather than inlined so it can be argued with. The purpose is not precision — it is to stop
 * a week with one entry being weighed against a week with six.
 */
export const MIN_DAYS_FOR_COMPARISON = 4;

/** A number this week, beside the same number last week — when that means anything. */
export type WeekComparison = {
  thisWeek: number;
  lastWeek: number;
  /** `thisWeek - lastWeek`. Only meaningful when `comparable` is true. */
  change: number;
  /**
   * Whether the two weeks were tracked closely enough for the difference to be about the diary
   * rather than about how much of it was filled in.
   */
  comparable: boolean;
};

export type WeeklyReviewTracking = {
  daysLogged: number;
  totalDays: number;
  /** Days carrying a symptom entry or an explicit good-state entry — days that can be read. */
  daysReportedOn: number;
  daysWithNothingRecorded: number;
  entries: number;
};

/**
 * How much the week can be asked to support.
 *
 * `quiet` is not a failure state and is not written as one. A week with nothing in it is a real
 * answer about the week, and the screen says so plainly instead of showing zeroes that look like
 * good news.
 */
export type WeeklyReviewDepth = 'enough' | 'thin' | 'quiet';

export type WeeklyReview = {
  week: { start: string; end: string; label: string };
  previousWeek: DateRange;
  generatedAt: string;
  depth: WeeklyReviewDepth;
  tracking: WeeklyReviewTracking;
  /** Days with any symptom recorded, out of days reported on. */
  symptomDays: WeekComparison;
  /** Days with an explicit good-state entry. */
  goodDays: number;
  /** Mean of each symptom day's worst reading, 1–10. Null when nothing was recorded. */
  meanWorstSeverity: number | null;
  /** Bowel entries in the week. */
  bowelEntries: number;
  standsOut: Finding[];
  emerging: Finding[];
};

/** The seven complete local days ending the day before `today`. */
export function weekEnding(today: string): DateRange {
  const end = previousLocalDate(today);

  let start = end;
  for (let i = 1; i < WEEK_DAYS; i += 1) start = previousLocalDate(start);

  return { start, end };
}

/** The seven days immediately before `range`. */
export function weekBefore(range: DateRange): DateRange {
  const end = previousLocalDate(range.start);

  let start = end;
  for (let i = 1; i < WEEK_DAYS; i += 1) start = previousLocalDate(start);

  return { start, end };
}

/** A day that can be read: something was said about how the person was, either way. */
const reportedOn = (day: DayLogs) => day.symptoms.length > 0 || day.wellbeing.length > 0;

const entriesOn = (day: DayLogs) =>
  day.meals.length +
  day.symptoms.length +
  day.bowel.length +
  day.wellbeing.length +
  day.context.length;

function worstSeverity(day: DayLogs): number | null {
  if (day.symptoms.length === 0) return null;
  return day.symptoms.reduce((worst, log) => Math.max(worst, log.severity), 0);
}

export function buildWeeklyReview({
  logs,
  previousLogs,
  findings,
  range,
  generatedAt,
}: {
  logs: LogSet;
  /** The previous week's logs. Separate rather than sliced, so the caller queries only what it needs. */
  previousLogs: LogSet;
  findings: Finding[];
  range: DateRange;
  generatedAt: Date;
}): WeeklyReview {
  const previous = weekBefore(range);

  const days = buildDays(logs, range);
  const previousDays = buildDays(previousLogs, previous);

  const completeness = trackingCompleteness(days);

  const daysReportedOn = days.filter(reportedOn).length;
  const previousReportedOn = previousDays.filter(reportedOn).length;

  const symptomDays = days.filter((day) => day.symptoms.length > 0).length;
  const previousSymptomDays = previousDays.filter((day) => day.symptoms.length > 0).length;

  const severities = days.map(worstSeverity).filter((value): value is number => value !== null);

  return {
    week: {
      start: range.start,
      end: range.end,
      label: `${formatLocalDate(range.start)} to ${formatLocalDate(range.end)}`,
    },
    previousWeek: previous,
    generatedAt: generatedAt.toISOString(),

    depth: depthOf(completeness.daysWithAnyLog, daysReportedOn),

    tracking: {
      daysLogged: completeness.daysWithAnyLog,
      totalDays: completeness.totalDays,
      daysReportedOn,
      daysWithNothingRecorded: completeness.totalDays - completeness.daysWithAnyLog,
      entries: days.reduce((total, day) => total + entriesOn(day), 0),
    },

    symptomDays: {
      thisWeek: symptomDays,
      lastWeek: previousSymptomDays,
      change: symptomDays - previousSymptomDays,
      comparable:
        daysReportedOn >= MIN_DAYS_FOR_COMPARISON && previousReportedOn >= MIN_DAYS_FOR_COMPARISON,
    },

    goodDays: completeness.daysWithGoodState,

    meanWorstSeverity:
      severities.length === 0
        ? null
        : Math.round((severities.reduce((sum, value) => sum + value, 0) / severities.length) * 10) /
          10,

    bowelEntries: days.reduce((total, day) => total + day.bowel.length, 0),

    // Passed through from the engine untouched. The review reports findings, it does not make them.
    standsOut: whatStandsOut(findings),
    emerging: worthInvestigating(findings),
  };
}

/**
 * How much the week supports.
 *
 * Deliberately based on days *reported on* rather than days logged: a week of meals with nothing
 * said about how the person felt is a well-filled diary that cannot answer the question the review
 * is asking.
 */
function depthOf(daysLogged: number, daysReportedOn: number): WeeklyReviewDepth {
  if (daysLogged === 0) return 'quiet';
  if (daysReportedOn < MIN_DAYS_FOR_COMPARISON) return 'thin';
  return 'enough';
}
