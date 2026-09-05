/**
 * Choosing what to show, and explaining silence (spec §49).
 *
 * The engine returns everything it examined, including everything that came to nothing. This
 * decides what a person actually sees.
 *
 * **The hard part is not the populated screen.** A new user will see an empty Insights tab for
 * weeks, and possibly for months if they log irregularly. "Nothing yet" is a useless thing to
 * tell them: it reads as the app being broken, or as their own logging being pointless. So
 * silence has to be *explained* — what the engine is waiting for, and what would change it.
 *
 * That explanation must never be a guilt trip either. The most common blocker is that the user
 * has recorded symptoms but never recorded a good day, which is not a failing on their part —
 * nobody would guess unprompted that "I felt fine today" is the single most valuable entry in a
 * comparison.
 */

import { DEFAULT_CANDIDATE_LIMITS } from '@/domain/pattern-engine/exposures';
import type { LogSet } from '@/domain/pattern-engine/observations';
import type { Finding } from '@/domain/pattern-engine/types';

import type { PatternStatus } from './status';

/** How many findings each section shows. Spec §49: avoid presenting twenty at once. */
export const STANDS_OUT_LIMIT = 4;
export const WORTH_INVESTIGATING_LIMIT = 4;

/** Statuses substantial enough to lead with. */
const HEADLINE_STATUSES: PatternStatus[] = ['stronger_recurring_signal', 'moderate'];

/**
 * Days of logging below which no comparison is possible at all.
 *
 * Both groups need `minExposedDays`, so the arithmetic floor is twice that — and in practice a
 * user needs rather more, because their days are not neatly split.
 */
export const MINIMUM_USEFUL_DAYS =
  DEFAULT_CANDIDATE_LIMITS.minExposedDays + DEFAULT_CANDIDATE_LIMITS.minControlDays;

/**
 * The findings worth leading with.
 *
 * Ordered by the engine already; this takes the strongest few. Deliberately capped: a screen of
 * twenty findings is a screen nobody reads, and the fourth-best association in a diary is rarely
 * worth the attention it would steal from the first.
 */
export function whatStandsOut(findings: Finding[], limit = STANDS_OUT_LIMIT): Finding[] {
  return findings.filter((finding) => HEADLINE_STATUSES.includes(finding.status)).slice(0, limit);
}

/**
 * Early signals, shown separately so they are not mistaken for conclusions.
 *
 * Keeping these in their own section is a safety decision, not a layout one: an emerging signal
 * shown beside a moderate one reads as a weaker version of the same claim, when it is really a
 * different kind of statement.
 */
export function worthInvestigating(
  findings: Finding[],
  limit = WORTH_INVESTIGATING_LIMIT
): Finding[] {
  return findings.filter((finding) => finding.status === 'emerging').slice(0, limit);
}

/** What the engine looked at, for the honest summary line under the heading. */
export type InsightsSummary = {
  /** Factor–outcome pairs actually compared. */
  comparisons: number;
  /** Distinct factors examined. */
  factors: number;
  standsOut: number;
  emerging: number;
  /** Pairs where the engine looked and found no relationship. */
  noPattern: number;
};

export function summarise(findings: Finding[]): InsightsSummary {
  const compared = findings.filter(
    (finding) => finding.metrics.exposedCount > 0 && finding.metrics.controlCount > 0
  );

  return {
    comparisons: compared.length,
    factors: new Set(compared.map((finding) => finding.factor.key)).size,
    standsOut: findings.filter((finding) => HEADLINE_STATUSES.includes(finding.status)).length,
    emerging: findings.filter((finding) => finding.status === 'emerging').length,
    noPattern: findings.filter((finding) => finding.status === 'no_clear_pattern').length,
  };
}

/**
 * Why there is nothing to show, and what would change it.
 *
 * Ordered by what the user can most usefully act on, not by what is most technically accurate.
 * Someone with no good days logged and only nine days of history needs to hear about the good
 * days: it is the smaller ask and the bigger unlock.
 */
export type InsightsReadiness =
  | { kind: 'ready' }
  | { kind: 'no_logs' }
  | { kind: 'needs_good_days'; daysWithSymptom: number }
  | { kind: 'needs_more_days'; daysLogged: number; daysNeeded: number }
  | { kind: 'needs_more_variety' }
  | { kind: 'looked_and_found_nothing'; comparisons: number };

export function assessReadiness(logs: LogSet, findings: Finding[]): InsightsReadiness {
  const loggedDays = new Set(
    [...logs.meals, ...logs.symptoms, ...logs.bowel, ...logs.wellbeing, ...logs.context].map(
      (log) => log.occurredLocalDate
    )
  );

  // Checked before the empty-diary guard on purpose. A finding can only exist if logs did, so
  // if there is something to show, showing it always beats explaining why there is not.
  const hasSomethingToShow = findings.some(
    (finding) => finding.status !== 'insufficient_data' && finding.status !== 'no_clear_pattern'
  );
  if (hasSomethingToShow) return { kind: 'ready' };

  if (loggedDays.size === 0) return { kind: 'no_logs' };

  const daysWithSymptom = new Set(logs.symptoms.map((log) => log.occurredLocalDate)).size;
  const daysWithGoodState = new Set(logs.wellbeing.map((log) => log.occurredLocalDate)).size;

  // The most common and least guessable blocker. Without an explicit good day there is no
  // control group, so the engine has nothing to compare a symptom day against — however
  // diligently everything else has been recorded.
  if (daysWithSymptom > 0 && daysWithGoodState === 0) {
    return { kind: 'needs_good_days', daysWithSymptom };
  }

  if (loggedDays.size < MINIMUM_USEFUL_DAYS) {
    return {
      kind: 'needs_more_days',
      daysLogged: loggedDays.size,
      daysNeeded: MINIMUM_USEFUL_DAYS,
    };
  }

  const { comparisons } = summarise(findings);

  // Enough history, but nothing varied enough to compare — someone who eats the same breakfast
  // every day, or has logged only meals and never how they felt.
  if (comparisons === 0) return { kind: 'needs_more_variety' };

  return { kind: 'looked_and_found_nothing', comparisons };
}

/**
 * What to say about it.
 *
 * Kept beside the logic so the two cannot drift, and written in plain language that credits the
 * user's effort rather than scolding them for gaps. Nothing here promises a finding will appear:
 * it may genuinely be that nothing in this diary is related to anything else, and that is a
 * legitimate outcome the product must be able to sit with.
 */
export type ReadinessCopy = {
  title: string;
  body: string;
  /** The single most useful next action, when there is one. */
  hint?: string;
};

export function readinessCopy(readiness: InsightsReadiness): ReadinessCopy {
  switch (readiness.kind) {
    case 'ready':
      return { title: '', body: '' };

    case 'no_logs':
      return {
        title: 'Nothing to compare yet',
        body: 'GutSignal looks for things that show up together in your own records. Once there are a couple of weeks of entries, it can start comparing them.',
        hint: 'Use the + button to log a meal or how you are feeling.',
      };

    case 'needs_good_days':
      return {
        title: 'One thing would unlock this',
        body: `You have recorded symptoms on ${readiness.daysWithSymptom} ${readiness.daysWithSymptom === 1 ? 'day' : 'days'}, but no days where you felt fine. Comparing needs both — without the good days there is nothing to weigh the difficult ones against.`,
        hint: 'On a day that goes well, tap + and choose "Feeling good". It takes one tap.',
      };

    case 'needs_more_days':
      return {
        title: 'Still gathering',
        body: `You have logged on ${readiness.daysLogged} ${readiness.daysLogged === 1 ? 'day' : 'days'}. Comparing needs around ${readiness.daysNeeded} before any difference means much, so this will fill in as you go.`,
        hint: 'Logging on the ordinary days matters as much as the bad ones.',
      };

    case 'needs_more_variety':
      return {
        title: 'Nothing varies enough to compare yet',
        body: 'Comparing needs days with something and days without it. So far everything recorded happens either almost always or almost never, which leaves nothing to weigh against anything else.',
        hint: 'This usually resolves on its own as your logs cover more ordinary days.',
      };

    case 'looked_and_found_nothing':
      return {
        title: 'Nothing stands out yet',
        body: `GutSignal compared ${readiness.comparisons} ${readiness.comparisons === 1 ? 'combination' : 'combinations'} in this period and found no consistent relationship. That is a real result, not a gap — sometimes there genuinely is not a pattern to find.`,
        hint: 'Keep logging. Patterns that are real tend to show up as there is more to compare.',
      };
  }
}
