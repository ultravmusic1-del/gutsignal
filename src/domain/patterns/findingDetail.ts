/**
 * Turning a `Finding` into a page a person can interrogate (spec §51).
 *
 * "Provide **How this was calculated**. Transparency is a feature." — that line is the reason
 * this module exists. Everything below reads fields the engine already stored; nothing here
 * recomputes, rounds differently, or knows anything the finding does not record. If a sentence
 * cannot be traced to a field on `Finding`, it does not belong here.
 *
 * It lives in `domain` rather than beside the screen for the same reason `outcomeLabels` does:
 * how a finding is described is a §17 safety boundary, and reports, export and Ask My Gut will
 * all need to describe one eventually.
 */

import {
  MIN_CONFIDENCE_FOR_MODERATE,
  MIN_CONFIDENCE_FOR_STRONG,
} from '@/domain/pattern-engine/scoring';
import type { Factor, Finding } from '@/domain/pattern-engine/types';
import { OBSERVATION_WINDOWS, windowLabel } from '@/domain/pattern-engine/windows';

import { outcomeLabel } from './outcomeLabels';

// --- Identity ---------------------------------------------------------------

/**
 * `|` is escaped by `encodeURIComponent`, so it can never appear inside an encoded segment and
 * is therefore unambiguous as a separator — which matters, because a meal item is whatever the
 * user typed.
 */
const ID_SEPARATOR = '|';

/**
 * A stable id for a finding.
 *
 * Findings are recomputed from local logs rather than stored (see `useInsights`), so they have no
 * database id to link to. The four fields below are what makes a comparison distinct: the same
 * factor is compared against several outcomes, and against each outcome in several windows.
 *
 * This is also the React list key on Insights — one definition of identity, not two.
 */
export function encodeFindingId(finding: Finding): string {
  return [
    finding.factor.key,
    finding.outcome.kind,
    finding.outcome.symptomType ?? '',
    finding.window,
  ]
    .map(encodeURIComponent)
    .join(ID_SEPARATOR);
}

/**
 * The finding an id refers to, or null.
 *
 * Null is an ordinary outcome, not an error: the user may have edited or deleted a log since the
 * list was rendered, and a finding that no longer holds must simply stop existing.
 */
export function findByFindingId(findings: Finding[], id: string): Finding | null {
  return findings.find((finding) => encodeFindingId(finding) === id) ?? null;
}

// --- Confidence -------------------------------------------------------------

export type ConfidenceWord = 'Low' | 'Moderate' | 'High';

/**
 * Confidence as a word (spec §51 shows "Confidence: Moderate", not a percentage).
 *
 * The bands are the scoring gates, reused deliberately rather than invented. A finding needs
 * `MIN_CONFIDENCE_FOR_MODERATE` to be called a moderate signal at all, so a user reading
 * "Moderate signal — Confidence: Low" would be reading a contradiction the engine cannot produce.
 *
 * The number itself is never shown. It is a conservative composite, not a probability
 * (see `confidence.ts`), and displaying "0.61" would invite exactly the precision it lacks.
 */
export function confidenceWord(confidence: number): ConfidenceWord {
  if (confidence >= MIN_CONFIDENCE_FOR_STRONG) return 'High';
  if (confidence >= MIN_CONFIDENCE_FOR_MODERATE) return 'Moderate';
  return 'Low';
}

// --- Describing the comparison ----------------------------------------------

export type ExposurePhrases = {
  /** How the exposed group reads in a sentence. */
  present: string;
  /** How the control group reads, as a continuation of the same sentence. */
  absent: string;
};

/**
 * How to name the two groups.
 *
 * **The engine compares days, not meals.** `exposureOn` asks whether a factor appeared anywhere
 * in a day, so "meals containing dairy" would describe a comparison that was never made. Every
 * phrase here is therefore day-shaped, however the factor was recorded.
 */
export function exposurePhrases(factor: Factor): ExposurePhrases {
  const label = factor.label.toLocaleLowerCase();

  if (factor.source === 'context') {
    return { present: `days with ${label}`, absent: 'days without' };
  }

  return { present: `days when you logged ${label}`, absent: 'days when you did not' };
}

/**
 * The "What we observed" sentence.
 *
 * Association language only (`CLAUDE.md` §17): it reports what was recorded and how often, and
 * says nothing about why. The three-way direction matters — a `no_clear_pattern` finding really
 * did come out even, and rounding that into "more often" would manufacture a signal.
 */
export function observationSentence(finding: Finding): string {
  const outcome = outcomeLabel(finding.outcome.kind, finding.outcome.symptomType);
  const { present, absent } = exposurePhrases(finding.factor);

  // Intensity is not frequency. Every other outcome is a thing that either happened or did not,
  // so "recorded more often" describes it exactly; a severity is a number that is higher or
  // lower, and describing it as a frequency would state something the engine never measured.
  // The engine only emits a severity finding when both groups have a mean (see engine.ts), so
  // `meanSeverityDifference` is the figure this sentence is actually about.
  if (finding.outcome.kind === 'symptom_severity') {
    const difference = finding.metrics.meanSeverityDifference ?? 0;

    if (difference === 0) return `${outcome} was about the same on ${present} as on ${absent}.`;

    return `${outcome} was ${difference > 0 ? 'higher' : 'lower'} on ${present} than on ${absent}.`;
  }

  const difference = finding.metrics.absoluteDifference;
  const direction =
    difference > 0 ? 'more often' : difference < 0 ? 'less often' : 'about as often';

  return `${outcome} was recorded ${direction} on ${present} than on ${absent}.`;
}

/** One side of the comparison, formatted for whatever was actually measured. */
export type ComparisonGroup = {
  /** The headline figure: `46%` for an occurrence, `6.5 out of 10` for an intensity. */
  value: string;
  /** How many days it was computed from. A figure without its denominator is not evidence. */
  days: number;
  /** Which days those were, e.g. `days when you logged dairy`. */
  label: string;
  /**
   * The whole phrase: `46% of 18 days when you logged dairy`.
   *
   * Assembled here because the joining word depends on what was measured — a rate is *of* a
   * number of days, an average is *across* them — and three surfaces getting that agreement
   * right independently is three chances to get it wrong.
   */
  summary: string;
};

export type ComparisonNumbers = { exposed: ComparisonGroup; control: ComparisonGroup };

/**
 * The two figures a finding's sentence is about.
 *
 * This exists because the card, the detail screen and the printed report each reached for
 * `exposedOutcomeRate`/`controlOutcomeRate` directly, which is right for five outcome kinds and
 * wrong for the sixth: an intensity finding was explained with occurrence percentages. Reading
 * the shape of the finding in one place means the numbers cannot disagree with the words beside
 * them on one surface and agree on another.
 */
export function comparisonNumbers(finding: Finding): ComparisonNumbers {
  const { metrics } = finding;
  const { present, absent } = exposurePhrases(finding.factor);
  const { exposedMeanSeverity, controlMeanSeverity } = metrics;

  // Narrowed with an explicit branch rather than a boolean flag: a flag would leave both means
  // typed `number | null` and force a non-null assertion, which is exactly the kind of "trust me"
  // that this file should not contain.
  const group = (value: string, days: number, label: string, joiner: string): ComparisonGroup => ({
    value,
    days,
    label,
    summary: `${value} ${joiner} ${days} ${days === 1 ? 'day' : 'days'}${label.replace(/^days/, '')}`,
  });

  if (
    finding.outcome.kind === 'symptom_severity' &&
    exposedMeanSeverity !== null &&
    controlMeanSeverity !== null
  ) {
    return {
      exposed: group(asIntensity(exposedMeanSeverity), metrics.exposedCount, present, 'across'),
      control: group(asIntensity(controlMeanSeverity), metrics.controlCount, absent, 'across'),
    };
  }

  return {
    exposed: group(asPercentage(metrics.exposedOutcomeRate), metrics.exposedCount, present, 'of'),
    control: group(asPercentage(metrics.controlOutcomeRate), metrics.controlCount, absent, 'of'),
  };
}

/**
 * Factors that travelled with this one (spec §51 "Things to consider", `CLAUDE.md` §60).
 *
 * The framing is deliberate and narrow: these two things moved together, so this comparison
 * cannot separate them. It never suggests the other factor is the real explanation — that would
 * be a causal claim about a different factor, which is no better than making one about this one.
 */
export function thingsToConsider(finding: Finding): string[] {
  return finding.confounders.map(
    (confounder) =>
      `${confounder.factor.label} often occurred on the same days, so this comparison cannot separate the two.`
  );
}

/**
 * What to suggest next.
 *
 * Spec §51 offers "Keep tracking — or — Start an experiment". Experiments are Milestone 11 and do
 * not exist, and a disabled button would be a placeholder control (`CLAUDE.md` §57), so only the
 * first half is offered until they do.
 *
 * The second sentence is the honest half: more data is as likely to dissolve a pattern as to
 * confirm it, and a product that only ever promises confirmation is training its users to see
 * signal in noise.
 */
export function nextStep(_finding: Finding): string {
  return 'Keep logging as you have been. With more days this either holds up or fades — both are useful answers, and a difference that came from chance tends to shrink rather than grow.';
}

// --- How this was calculated ------------------------------------------------

export type CalculationStep = {
  label: string;
  detail: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `2026-06-01` → `1 Jun 2026`.
 *
 * Parsed as a string on purpose. `new Date('2026-06-01')` is midnight **UTC**, which renders as
 * 31 May for every user west of Greenwich — exactly the class of bug `CLAUDE.md` §16 exists to
 * prevent, and one that would silently misdate the analysis range.
 */
export function formatLocalDate(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return localDate;

  const [, year, month, day] = match as unknown as [string, string, string, string];
  const monthName = MONTHS[Number(month) - 1];
  if (monthName === undefined) return localDate;

  return `${Number(day)} ${monthName} ${year}`;
}

const asPercentage = (rate: number) => `${Math.round(rate * 100)}%`;

/**
 * A mean severity, on the 1–10 scale the user entered it on.
 *
 * The scale is carried in the string rather than assumed: "6.5" alone invites being read as a
 * percentage or a count, which is the confusion this whole change exists to remove.
 */
const asIntensity = (mean: number) => `${Number(mean.toFixed(1))} out of 10`;

/**
 * The working, shown in full.
 *
 * Every step reads a field the finding already carries, so this section can never disagree with
 * the headline above it. Steps that would have nothing to say are omitted rather than padded with
 * "N/A" — a row that says nothing still costs the reader a line.
 */
export function calculationSteps(finding: Finding): CalculationStep[] {
  const { metrics, consistency, trackingCompleteness } = finding;
  const { present, absent } = exposurePhrases(finding.factor);
  const window = OBSERVATION_WINDOWS[finding.window];

  const steps: CalculationStep[] = [
    {
      label: 'Period examined',
      detail: `${formatLocalDate(finding.analysisStart)} to ${formatLocalDate(finding.analysisEnd)} — ${trackingCompleteness.totalDays} days, of which you logged on ${trackingCompleteness.daysWithAnyLog}.`,
    },
    {
      label: 'Days compared',
      detail: `${metrics.exposedCount} ${present}, against ${metrics.controlCount} ${absent}.`,
    },
    {
      label: 'What was counted',
      detail: `${outcomeLabel(finding.outcome.kind, finding.outcome.symptomType)}, recorded ${windowLabel(finding.window).toLocaleLowerCase()} — between ${window.fromHours} and ${window.toHours} hours after.`,
    },
    {
      label: 'The two rates',
      detail: `${asPercentage(metrics.exposedOutcomeRate)} against ${asPercentage(metrics.controlOutcomeRate)}, a difference of ${asPercentage(Math.abs(metrics.absoluteDifference))}.`,
    },
  ];

  // The §59 rule, stated where a user can actually see it: a day with nothing recorded is not
  // evidence that the day went well, so it is excluded from both groups rather than helping one.
  if (metrics.unknownCount > 0) {
    steps.push({
      label: 'Days with nothing recorded',
      detail: `${metrics.unknownCount} ${metrics.unknownCount === 1 ? 'day was' : 'days were'} left out. Nothing recorded is not the same as a day that went well, so these count for neither side.`,
    });
  }

  steps.push({
    label: 'Repeated week to week',
    detail:
      consistency.agreementRate === null
        ? 'Not enough weeks contained both kinds of day to check whether this repeats.'
        : `The difference pointed the same way in ${consistency.agreeingWeeks} of ${consistency.comparableWeeks} comparable weeks.`,
  });

  if (metrics.confidenceInterval !== null) {
    steps.push({
      label: 'How precise this is',
      detail: `The true difference is somewhere around ${asPercentage(metrics.confidenceInterval.low)} to ${asPercentage(metrics.confidenceInterval.high)}. A wide range means the diary cannot yet pin it down.`,
    });
  }

  steps.push({
    label: 'Worked out by',
    detail: `Pattern engine ${finding.engineVersion}, on this device, from your own logs. The same logs always give the same answer.`,
  });

  return steps;
}
