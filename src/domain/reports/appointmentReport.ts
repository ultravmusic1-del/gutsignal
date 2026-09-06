/**
 * The report a person takes to an appointment (spec §70, §71).
 *
 * This is the only artefact GutSignal produces that leaves the app and is read by someone who
 * never saw the caveats on screen. A clinician reading "dairy → symptoms" on a printed page has no
 * way to know it rests on nine days, and no reason to doubt it. So every rule in `CLAUDE.md` §17
 * and `docs/PATTERN_ENGINE.md` applies here with more force than anywhere else, and two of them are
 * load-bearing:
 *
 * - **Every number carries its denominator.** "Symptoms on 40% of days" is a claim; "on 12 of the
 *   30 days you reported on" is evidence. The second cannot be misread as the first.
 * - **Days with nothing recorded are counted separately, never as good days.** A quiet fortnight in
 *   a diary means the person stopped logging at least as often as it means they felt well, and a
 *   report that quietly treats absence as wellness is worse than no report (§59).
 *
 * There is deliberately **no summary, no headline and no conclusion**. Spec §70 says avoid generic
 * conclusions; the honest form of that is a page of observations a clinician interprets, not a page
 * of interpretations they have to unpick.
 *
 * Pure: the caller supplies the range and the moment, so a report is reproducible and testable.
 * Rendering lives elsewhere — this decides *what* is said, which is the part worth getting right.
 */

import { BRISTOL_TYPES, bristolDescription, type BristolType } from '@/domain/logs/bowel';
import { symptomLabel } from '@/domain/logs/symptom';
import type { SymptomKey } from '@/domain/onboarding/options';
import {
  buildDays,
  trackingCompleteness,
  type DateRange,
  type DayLogs,
  type LogSet,
} from '@/domain/pattern-engine/observations';
import type { Finding } from '@/domain/pattern-engine/types';
import { formatLocalDate } from '@/domain/patterns/findingDetail';
import { whatStandsOut, worthInvestigating } from '@/domain/patterns/insights';

/** Periods spec §70 asks for. A custom range is any other `DateRange`. */
export const REPORT_PERIODS = [30, 90] as const;

/**
 * The line that must appear on every report, whatever else does.
 *
 * Not a legal disclaimer bolted on at the end — it is the sentence that makes the rest readable,
 * because a clinician needs to know these are self-reported associations from a diary rather than
 * measurements or a diagnosis.
 */
export const REPORT_DISCLAIMER =
  'This is a personal record kept by the patient, not a clinical measurement. GutSignal describes ' +
  'how often things were recorded together in this diary. It does not diagnose, and it does not ' +
  'establish that one thing caused another.';

export type ReportCount = {
  /** How many of something. */
  count: number;
  /** Out of how many — never omitted, so a rate cannot be read without its basis. */
  outOf: number;
  /** What `outOf` counts, in words. */
  basis: string;
};

export type TrackingSection = {
  totalDays: number;
  daysLogged: number;
  daysReportedOn: number;
  daysWithSymptoms: number;
  daysRecordedAsGood: number;
  /** Days in the period with nothing recorded at all. Named, never folded into anything. */
  daysWithNothingRecorded: number;
};

export type SymptomSection = {
  /** Days with any symptom, out of days the person reported on. */
  anySymptom: ReportCount;
  /** Per symptom, most frequent first. */
  bySymptom: { symptom: string; label: string; days: number }[];
  /** Mean of each symptom day's worst reading, 1–10. Null when nothing was recorded. */
  meanWorstSeverity: number | null;
  /** How many days contributed to that mean. */
  severityDays: number;
};

export type BowelSection = {
  entries: number;
  daysWithAnEntry: number;
  /** Entries per week over the period, to one decimal. Null when the period is empty. */
  perWeek: number | null;
  /** Every Bristol type, including the zeroes — a distribution with gaps is not a distribution. */
  bristol: { type: BristolType; description: string; count: number }[];
};

export type AssociationsSection = {
  /** The findings substantial enough to mention, in the engine's own order. */
  standsOut: Finding[];
  /** Early signals, kept separate so they are not read as conclusions. */
  emerging: Finding[];
  /** Everything the engine compared, so the reader can judge the silence. */
  comparisonsMade: number;
};

export type AppointmentReport = {
  period: { start: string; end: string; label: string };
  generatedAt: string;
  tracking: TrackingSection;
  symptoms: SymptomSection;
  bowel: BowelSection;
  associations: AssociationsSection;
  disclaimer: string;
  /** Sections the app cannot fill yet, named rather than silently missing. */
  notIncluded: string[];
};

/** A day says something about how the person felt only if they said so (§59). */
const reportedOn = (day: DayLogs) => day.symptoms.length > 0 || day.wellbeing.length > 0;

const hasAnyLog = (day: DayLogs) =>
  day.meals.length > 0 ||
  day.symptoms.length > 0 ||
  day.bowel.length > 0 ||
  day.wellbeing.length > 0 ||
  day.context.length > 0;

function buildSymptoms(days: DayLogs[]): SymptomSection {
  const reported = days.filter(reportedOn);
  const symptomDays = days.filter((day) => day.symptoms.length > 0);

  const perSymptom = new Map<string, number>();
  for (const day of symptomDays) {
    // A symptom recorded three times in one day is one day with that symptom, not three.
    for (const type of new Set(day.symptoms.map((log) => log.symptomType))) {
      perSymptom.set(type, (perSymptom.get(type) ?? 0) + 1);
    }
  }

  // The day's worst reading, matching the pattern engine and the trend chart. Two surfaces
  // disagreeing about how bad a day was is worse than either choice on its own.
  const worst = symptomDays.map((day) =>
    day.symptoms.reduce((highest, log) => Math.max(highest, log.severity), 0)
  );

  return {
    anySymptom: {
      count: symptomDays.length,
      outOf: reported.length,
      basis: 'days you reported on',
    },
    bySymptom: [...perSymptom.entries()]
      .map(([symptom, count]) => ({
        symptom,
        label: symptomLabel(symptom as SymptomKey),
        days: count,
      }))
      // Most frequent first, then alphabetical, so the same diary always produces the same page.
      .sort((a, b) => b.days - a.days || a.label.localeCompare(b.label)),
    meanWorstSeverity:
      worst.length === 0
        ? null
        : Math.round((worst.reduce((total, value) => total + value, 0) / worst.length) * 10) / 10,
    severityDays: worst.length,
  };
}

function buildBowel(days: DayLogs[]): BowelSection {
  const entries = days.flatMap((day) => day.bowel);
  const counts = new Map<number, number>();

  for (const entry of entries) {
    counts.set(entry.bristolType, (counts.get(entry.bristolType) ?? 0) + 1);
  }

  return {
    entries: entries.length,
    daysWithAnEntry: days.filter((day) => day.bowel.length > 0).length,
    perWeek: days.length === 0 ? null : Math.round((entries.length / (days.length / 7)) * 10) / 10,
    // Every type, including the zeroes: a distribution missing its empty bars is not a
    // distribution, and a clinician reading it needs to see what was absent.
    bristol: BRISTOL_TYPES.map((type) => ({
      type,
      description: bristolDescription(type),
      count: counts.get(type) ?? 0,
    })),
  };
}

function periodLabel(range: DateRange, days: number): string {
  const known = REPORT_PERIODS.find((period) => period === days);
  const span = known === undefined ? `${days} days` : `${known} days`;

  return `${span} · ${formatLocalDate(range.start)} to ${formatLocalDate(range.end)}`;
}

export function buildAppointmentReport({
  logs,
  findings,
  range,
  generatedAt,
}: {
  logs: LogSet;
  findings: Finding[];
  range: DateRange;
  generatedAt: Date;
}): AppointmentReport {
  const days = buildDays(logs, range);
  const completeness = trackingCompleteness(days);

  const compared = findings.filter(
    (finding) => finding.metrics.exposedCount > 0 && finding.metrics.controlCount > 0
  );

  return {
    period: { start: range.start, end: range.end, label: periodLabel(range, days.length) },
    generatedAt: generatedAt.toISOString(),

    tracking: {
      totalDays: completeness.totalDays,
      daysLogged: completeness.daysWithAnyLog,
      daysReportedOn: days.filter(reportedOn).length,
      daysWithSymptoms: completeness.daysWithSymptom,
      daysRecordedAsGood: completeness.daysWithGoodState,
      daysWithNothingRecorded: days.filter((day) => !hasAnyLog(day)).length,
    },

    symptoms: buildSymptoms(days),
    bowel: buildBowel(days),

    associations: {
      standsOut: whatStandsOut(findings),
      emerging: worthInvestigating(findings),
      comparisonsMade: compared.length,
    },

    disclaimer: REPORT_DISCLAIMER,

    // Named rather than silently absent. A clinician who cannot tell whether a section is missing
    // or empty cannot use the report, and §70 lists both of these.
    notIncluded: [
      'Experiments — GutSignal does not support them yet.',
      'Medications and supplements — GutSignal does not record them yet.',
    ],
  };
}
