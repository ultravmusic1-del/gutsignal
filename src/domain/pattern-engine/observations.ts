/**
 * Turning raw logs into the observations the engine compares (spec §56, §59).
 *
 * This module is where the product's most consequential rule lives: **a blank day is not a good
 * day.** Only an explicit wellbeing entry is evidence that things were fine. A day where someone
 * logged lunch and nothing else says nothing at all about whether they had symptoms, and using
 * it as a control would manufacture evidence out of how diligently they happened to log.
 *
 * Days with an unknown outcome are kept rather than filtered out, so the engine can report how
 * much was unknown instead of quietly presenting a small, self-selected sample as a whole
 * picture.
 *
 * The unit is the user's **local calendar day**, computed when the entry was made, never derived
 * here from an instant (risk R-02).
 *
 * Pure: no database, no clock, no platform. Everything is a function of its arguments.
 */

import type { BowelLog } from '@/domain/logs/bowel';
import type { ContextLog } from '@/domain/logs/context';
import type { Meal } from '@/domain/logs/meal';
import type { SymptomLog } from '@/domain/logs/symptom';
import type { WellbeingLog } from '@/domain/logs/wellbeing';

import { contextFactorDefinition } from './factors';
import type { Factor, Observation, Outcome, TrackingCompleteness, TrackingState } from './types';

/** Everything logged over the analysed range. */
export type LogSet = {
  meals: Meal[];
  symptoms: SymptomLog[];
  bowel: BowelLog[];
  wellbeing: WellbeingLog[];
  context: ContextLog[];
};

/** Inclusive local-date bounds. */
export type DateRange = {
  start: string;
  end: string;
};

/** Everything logged on one of the user's calendar days. */
export type DayLogs = {
  localDate: string;
} & LogSet;

/** Bristol types at the ends of the scale, which is what `stool_consistency` asks about. */
const LOOSE_OR_HARD = (bristolType: number) => bristolType <= 2 || bristolType >= 6;

/** Urgency levels that count as the outcome having occurred. */
const STRONG_URGENCY = new Set(['moderate', 'high']);

/** Every local date from `start` to `end`, inclusive. Empty for a backwards range. */
export function enumerateLocalDates({ start, end }: DateRange): string[] {
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);

  if (Number.isNaN(first) || Number.isNaN(last) || first > last) return [];

  const dates: string[] = [];
  for (let at = first; at <= last; at += 86_400_000) {
    dates.push(new Date(at).toISOString().slice(0, 10));
  }

  return dates;
}

/**
 * Buckets logs into one entry per calendar day across the whole range.
 *
 * Days with nothing logged are present and empty. They are not noise — they are the record of
 * how much is unknown, and dropping them here would make every later count look better than it
 * is.
 */
export function buildDays(logs: LogSet, range: DateRange): DayLogs[] {
  const dates = enumerateLocalDates(range);
  if (dates.length === 0) return [];

  const byDate = new Map<string, DayLogs>(
    dates.map((localDate) => [
      localDate,
      { localDate, meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] },
    ])
  );

  const place = <T extends { occurredLocalDate: string; deletedAt: string | null }>(
    entries: T[],
    onto: (day: DayLogs) => T[]
  ) => {
    for (const entry of entries) {
      if (entry.deletedAt !== null) continue;

      const day = byDate.get(entry.occurredLocalDate);
      if (day === undefined) continue; // outside the analysed range

      onto(day).push(entry);
    }
  };

  place(logs.meals, (day) => day.meals);
  place(logs.symptoms, (day) => day.symptoms);
  place(logs.bowel, (day) => day.bowel);
  place(logs.wellbeing, (day) => day.wellbeing);
  place(logs.context, (day) => day.context);

  return dates.flatMap((date) => {
    const day = byDate.get(date);
    return day === undefined ? [] : [day];
  });
}

/**
 * Whether this day can say anything about this outcome, and if so what kind of evidence it is.
 *
 * Observability is outcome-specific on purpose. A wellbeing entry means "I felt fine", which is
 * a real observation that a *symptom* did not occur — but it says nothing about what a stool
 * looked like. Only a bowel log can answer that.
 */
export function outcomeObservability(day: DayLogs, outcome: Outcome): TrackingState {
  switch (outcome.kind) {
    case 'symptom_occurrence':
    case 'symptom_severity':
    case 'any_symptom': {
      // Recording any symptom shows the user was tracking symptoms that day, so the absence of
      // this particular one is evidence rather than silence.
      if (day.symptoms.length > 0) return 'symptom_logged';
      if (day.wellbeing.length > 0) return 'explicit_good_state';
      return 'no_data';
    }

    case 'bowel_urgency':
    case 'stool_consistency': {
      // Feeling fine is not an observation of a bowel movement.
      return day.bowel.length > 0 ? 'symptom_logged' : 'no_data';
    }

    case 'wellbeing': {
      // Either kind of entry tells you something about how the day felt.
      if (day.symptoms.length > 0) return 'symptom_logged';
      if (day.wellbeing.length > 0) return 'explicit_good_state';
      return 'no_data';
    }
  }
}

/** Whether the outcome actually happened on a day where it could be observed. */
function outcomeOccurredOn(day: DayLogs, outcome: Outcome): boolean {
  switch (outcome.kind) {
    case 'symptom_occurrence':
    case 'symptom_severity':
      return day.symptoms.some((log) => log.symptomType === outcome.symptomType);

    case 'any_symptom':
      return day.symptoms.length > 0;

    case 'bowel_urgency':
      return day.bowel.some((log) => STRONG_URGENCY.has(log.urgency));

    case 'stool_consistency':
      return day.bowel.some((log) => LOOSE_OR_HARD(log.bristolType));

    case 'wellbeing':
      return day.wellbeing.length > 0;
  }
}

/**
 * The numeric value of the outcome, for outcomes that have one.
 *
 * Severity takes the **worst** reading of the day rather than the mean. A day with one mild and
 * one severe episode was a bad day, and averaging it into something moderate would understate
 * exactly the days that matter most.
 */
function outcomeValueOn(day: DayLogs, outcome: Outcome): number | null {
  if (outcome.kind !== 'symptom_severity') return null;

  const severities = day.symptoms
    .filter((log) => log.symptomType === outcome.symptomType)
    .map((log) => log.severity);

  return severities.length === 0 ? null : Math.max(...severities);
}

/** Whether the factor was present on this day, and when it first appeared. */
export function exposureOn(
  day: DayLogs,
  factor: Factor
): { exposed: boolean; exposedAt: string | null } {
  const matches: string[] = [];

  switch (factor.source) {
    case 'meal_tag': {
      for (const meal of day.meals) {
        if (meal.tags.some((tag) => tag === factor.key)) matches.push(meal.occurredAt);
      }
      break;
    }

    case 'meal_item': {
      // Matched case-insensitively on the user's own words. Normalisation into canonical
      // factors is a later step; the raw name is never rewritten (spec §54).
      const wanted = factor.key.toLocaleLowerCase();
      for (const meal of day.meals) {
        if (meal.items.some((item) => item.rawName.toLocaleLowerCase() === wanted)) {
          matches.push(meal.occurredAt);
        }
      }
      break;
    }

    case 'meal_size': {
      for (const meal of day.meals) {
        if (meal.mealSize === factor.key) matches.push(meal.occurredAt);
      }
      break;
    }

    case 'context': {
      // Thresholded, not merely present: a stress level of 1 and a level of 5 are opposite
      // observations, and counting both as exposure would compare a group against itself.
      const definition = contextFactorDefinition(factor.key);
      if (definition === undefined) break;

      for (const entry of day.context) {
        if (entry.contextType === definition.contextType && definition.matches(entry)) {
          matches.push(entry.occurredAt);
        }
      }
      break;
    }
  }

  if (matches.length === 0) return { exposed: false, exposedAt: null };

  // The earliest occurrence, so window work later measures from the first exposure.
  return { exposed: true, exposedAt: matches.sort()[0] ?? null };
}

/** One observation per day in the range: was the factor present, and what was seen afterwards. */
export function buildObservations(
  days: DayLogs[],
  factor: Factor,
  outcome: Outcome
): Observation[] {
  return days.map((day) => {
    const { exposed, exposedAt } = exposureOn(day, factor);
    const outcomeState = outcomeObservability(day, outcome);
    const observed = outcomeState !== 'no_data';

    return {
      localDate: day.localDate,
      exposedAt,
      exposed,
      outcomeState,
      // Nothing is asserted about a day that could not be observed.
      outcomeValue: observed ? outcomeValueOn(day, outcome) : null,
      outcomeOccurred: observed ? outcomeOccurredOn(day, outcome) : false,
    };
  });
}

/**
 * How completely the user was tracking over the range (§59).
 *
 * Feeds confidence directly: a difference measured across a well-tracked month deserves more
 * weight than the same difference across a month with four entries in it.
 */
export function trackingCompleteness(days: DayLogs[]): TrackingCompleteness {
  const totalDays = days.length;

  const hasAnything = (day: DayLogs) =>
    day.meals.length > 0 ||
    day.symptoms.length > 0 ||
    day.bowel.length > 0 ||
    day.wellbeing.length > 0 ||
    day.context.length > 0;

  const daysWithAnyLog = days.filter(hasAnything).length;
  const daysWithGoodState = days.filter((day) => day.wellbeing.length > 0).length;
  const daysWithSymptom = days.filter((day) => day.symptoms.length > 0).length;

  return {
    totalDays,
    daysWithAnyLog,
    daysWithGoodState,
    daysWithSymptom,
    coverage: totalDays === 0 ? 0 : daysWithAnyLog / totalDays,
  };
}
