/**
 * The pattern engine's fixture suite (CLAUDE.md §42).
 *
 * Fifteen synthetic diaries, each encoding a situation the engine must handle correctly, and
 * each stating what it is defending against. This is the milestone's acceptance criterion: a
 * change to the engine that breaks any of these is a change that would mislead a real user.
 *
 * Most fixtures assert what the engine *refuses* to say. That is deliberate — for a product
 * whose promise is honest uncertainty, a false negative costs a user one insight, while a false
 * positive costs them a food they did not need to give up.
 */

import type { PatternStatus } from '@/domain/patterns/status';

import type { DateRange, LogSet } from '../observations';
import type { Outcome } from '../types';

import {
  datesFrom,
  emptyLogs,
  makeContext,
  makeMeal,
  makeSymptom,
  makeWellbeing,
  mergeLogs,
  tombstone,
} from './builders';

export type ScenarioExpectation = {
  /** The pair must be classified as one of these. */
  status?: PatternStatus[];
  /** The pair must NOT be classified as any of these. */
  notStatus?: PatternStatus[];
  maxConfidence?: number;
  /** The engine must have noticed something travelling with this factor. */
  hasConfounder?: boolean;
  /** A limitation matching this must be shown to the user. */
  limitation?: RegExp;
  /** The pair must not appear at all — the engine declined to examine it. */
  absent?: boolean;
};

export type Scenario = {
  name: string;
  /** What this fixture defends against. */
  why: string;
  logs: LogSet;
  range: DateRange;
  factorKey: string;
  outcome: Outcome;
  expect: ScenarioExpectation;
};

const START = '2026-01-05'; // a Monday, so weeks line up cleanly
const LONG = datesFrom(START, 84); // twelve whole weeks
const RANGE: DateRange = { start: LONG[0]!, end: LONG[LONG.length - 1]! };

const BLOATING: Outcome = { kind: 'symptom_occurrence', symptomType: 'bloating' };

/** Every other day is an exposure day. */
const EXPOSED = LONG.filter((_, i) => i % 2 === 0);
const CONTROL = LONG.filter((_, i) => i % 2 === 1);

/**
 * A diary where `tag` appears on `exposedDates` and the symptom follows on a given proportion of
 * those days, against a background rate on the rest. Every day is observed either way, so
 * nothing is left ambiguous unless a fixture says so.
 */
function association({
  exposedDates = EXPOSED,
  controlDates = CONTROL,
  exposedRate,
  controlRate,
  tag = 'caffeinated' as const,
}: {
  exposedDates?: string[];
  controlDates?: string[];
  exposedRate: number;
  controlRate: number;
  tag?: 'caffeinated' | 'spicy' | 'alcoholic';
}): LogSet {
  const withSymptom = (dates: string[], rate: number) => {
    const count = Math.round(dates.length * rate);
    return {
      symptoms: dates.slice(0, count).map((date) => makeSymptom(date)),
      wellbeing: dates.slice(count).map((date) => makeWellbeing(date)),
    };
  };

  return mergeLogs(
    { meals: exposedDates.map((date) => makeMeal(date, { tags: [tag] })) },
    withSymptom(exposedDates, exposedRate),
    withSymptom(controlDates, controlRate)
  );
}

// --- 1. An obvious association ---------------------------------------------

const obvious: Scenario = {
  name: 'obvious positive association',
  why: 'A real, strong, repeated association must actually be found. The engine erring towards silence is only defensible if it still speaks when the evidence is plain.',
  logs: association({ exposedRate: 0.9, controlRate: 0.1 }),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: { status: ['moderate', 'stronger_recurring_signal'] },
};

// --- 2. No association -----------------------------------------------------

const noAssociation: Scenario = {
  name: 'no association',
  why: 'Identical rates in both groups must be reported as no clear pattern, not left to look like an absence of evidence.',
  logs: association({ exposedRate: 0.5, controlRate: 0.5 }),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: { status: ['no_clear_pattern'] },
};

// --- 3. A tiny sample ------------------------------------------------------

const tinySample: Scenario = {
  name: 'tiny sample',
  why: 'Spec §58: never a strong signal because something happened twice. A perfect split across four days must still say nothing.',
  logs: mergeLogs(
    { meals: LONG.slice(0, 2).map((date) => makeMeal(date, { tags: ['caffeinated'] })) },
    { symptoms: LONG.slice(0, 2).map((date) => makeSymptom(date)) },
    { wellbeing: LONG.slice(2, 4).map((date) => makeWellbeing(date)) }
  ),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: { absent: true },
};

// --- 4. A history full of gaps ---------------------------------------------

const missingDataHeavy: Scenario = {
  name: 'missing-data-heavy history',
  why: 'Spec §59: confidence must fall when most of the period is unknown, and the user must be told coverage was thin.',
  logs: mergeLogs(
    { meals: EXPOSED.map((date) => makeMeal(date, { tags: ['caffeinated'] })) },
    // Only the first twelve days carry any outcome at all; the rest is silence.
    { symptoms: EXPOSED.slice(0, 6).map((date) => makeSymptom(date)) },
    { wellbeing: CONTROL.slice(0, 6).map((date) => makeWellbeing(date)) }
  ),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: {
    notStatus: ['stronger_recurring_signal'],
    limitation: /logged|unknown/i,
  },
};

// --- 5. Explicit good-state controls ---------------------------------------

const goodStateControls: Scenario = {
  name: 'explicit good-state controls',
  why: 'Spec §44 and §59: only an explicit wellbeing entry is a control. A diary of meals and symptoms with no good days recorded cannot support a comparison, however many meals it contains.',
  logs: mergeLogs(
    { meals: LONG.map((date) => makeMeal(date, { tags: ['caffeinated'] })) },
    { symptoms: EXPOSED.slice(0, 10).map((date) => makeSymptom(date)) }
  ),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: { absent: true },
};

// --- 6. Strong confounding -------------------------------------------------

const confounded: Scenario = {
  name: 'strong confounding',
  why: 'Spec §60: when two factors never appear apart, neither may be credited independently, and the user must be told they are hard to separate.',
  logs: mergeLogs(
    // Coffee and a late, rich meal always arrive together.
    {
      meals: EXPOSED.flatMap((date) => [
        makeMeal(date, { tags: ['caffeinated'], id: `coffee-${date}` }),
        makeMeal(date, { tags: ['rich_high_fat'], id: `rich-${date}` }),
      ]),
    },
    {
      symptoms: EXPOSED.slice(0, Math.round(EXPOSED.length * 0.9)).map((date) => makeSymptom(date)),
      wellbeing: EXPOSED.slice(Math.round(EXPOSED.length * 0.9)).map((date) => makeWellbeing(date)),
    },
    {
      symptoms: CONTROL.slice(0, Math.round(CONTROL.length * 0.1)).map((date) => makeSymptom(date)),
      wellbeing: CONTROL.slice(Math.round(CONTROL.length * 0.1)).map((date) => makeWellbeing(date)),
    }
  ),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: {
    hasConfounder: true,
    notStatus: ['stronger_recurring_signal'],
    limitation: /same time|separate/i,
  },
};

// --- 7. Consistency across weeks -------------------------------------------

const crossWeek: Scenario = {
  name: 'cross-week consistency',
  why: 'An association that repeats every week is the strongest thing this engine can honestly report.',
  logs: association({ exposedRate: 0.95, controlRate: 0.05 }),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: { status: ['moderate', 'stronger_recurring_signal'] },
};

// --- 8. A one-off anomaly --------------------------------------------------

const oneOff: Scenario = {
  name: 'one-off anomaly',
  why: 'A single dramatic week against eleven ordinary ones must not become a finding. This is the shape most likely to produce a false positive in real data.',
  logs: (() => {
    const anomalyWeek = LONG.slice(0, 7);
    const rest = LONG.slice(7);
    const restExposed = rest.filter((_, i) => i % 2 === 0);
    const restControl = rest.filter((_, i) => i % 2 === 1);

    return mergeLogs(
      // Coffee every day of the anomaly week, with symptoms every day.
      {
        meals: anomalyWeek.map((date) => makeMeal(date, { tags: ['caffeinated'] })),
        symptoms: anomalyWeek.map((date) => makeSymptom(date)),
      },
      // Afterwards, coffee makes no difference at all.
      { meals: restExposed.map((date) => makeMeal(date, { tags: ['caffeinated'] })) },
      {
        symptoms: restExposed.filter((_, i) => i % 2 === 0).map((date) => makeSymptom(date)),
        wellbeing: restExposed.filter((_, i) => i % 2 === 1).map((date) => makeWellbeing(date)),
      },
      {
        symptoms: restControl.filter((_, i) => i % 2 === 0).map((date) => makeSymptom(date)),
        wellbeing: restControl.filter((_, i) => i % 2 === 1).map((date) => makeWellbeing(date)),
      }
    );
  })(),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: { notStatus: ['stronger_recurring_signal'] },
};

// --- 9. Contradictory periods ----------------------------------------------

const contradictory: Scenario = {
  name: 'contradictory periods',
  why: 'Six weeks pointing one way and six the other must not average into a confident finding. The weeks disagree, and the engine has to notice.',
  logs: (() => {
    const firstHalf = LONG.slice(0, 42);
    const secondHalf = LONG.slice(42);

    const half = (dates: string[], exposedRate: number, controlRate: number) => {
      const exposed = dates.filter((_, i) => i % 2 === 0);
      const control = dates.filter((_, i) => i % 2 === 1);

      const split = (group: string[], rate: number) => {
        const count = Math.round(group.length * rate);
        return {
          symptoms: group.slice(0, count).map((date) => makeSymptom(date)),
          wellbeing: group.slice(count).map((date) => makeWellbeing(date)),
        };
      };

      return mergeLogs(
        { meals: exposed.map((date) => makeMeal(date, { tags: ['caffeinated'] })) },
        split(exposed, exposedRate),
        split(control, controlRate)
      );
    };

    // Coffee looks harmful in the first half and protective in the second.
    return mergeLogs(half(firstHalf, 0.9, 0.1), half(secondHalf, 0.1, 0.9));
  })(),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: { status: ['no_clear_pattern'], notStatus: ['stronger_recurring_signal'] },
};

// --- 10. Midnight and timezone boundaries ----------------------------------

const timezoneBoundary: Scenario = {
  name: 'midnight and timezone boundary',
  why: 'Risk R-02. Every log here has an instant whose UTC date differs from the local date it was filed under. Grouping by the instant would move every entry to the wrong day and destroy the association.',
  logs: (() => {
    // 02:00 UTC is the previous evening in New York, so occurredLocalDate is the day before.
    const lateEvening = (date: string, hour: number) => {
      const utcDate = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10);
      return { at: `${utcDate}T0${hour}:00:00.000Z`, tz: 'America/New_York', offsetMinutes: -300 };
    };

    return mergeLogs(
      {
        meals: EXPOSED.map((date) =>
          makeMeal(date, { tags: ['caffeinated'], ...lateEvening(date, 1) })
        ),
      },
      {
        symptoms: EXPOSED.slice(0, Math.round(EXPOSED.length * 0.9)).map((date) =>
          makeSymptom(date, lateEvening(date, 3))
        ),
        wellbeing: EXPOSED.slice(Math.round(EXPOSED.length * 0.9)).map((date) =>
          makeWellbeing(date, lateEvening(date, 3))
        ),
      },
      {
        symptoms: CONTROL.slice(0, Math.round(CONTROL.length * 0.1)).map((date) =>
          makeSymptom(date, lateEvening(date, 3))
        ),
        wellbeing: CONTROL.slice(Math.round(CONTROL.length * 0.1)).map((date) =>
          makeWellbeing(date, lateEvening(date, 3))
        ),
      }
    );
  })(),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: { status: ['moderate', 'stronger_recurring_signal'] },
};

// --- 11. Several foods eaten together --------------------------------------

const simultaneousExposures: Scenario = {
  name: 'multiple simultaneous food exposures',
  why: 'Spec §54: a meal contains several items at once. Each must be examined without the others being silently credited, and items that always travel together must be flagged as inseparable.',
  logs: mergeLogs(
    {
      meals: EXPOSED.map((date) =>
        makeMeal(date, { items: ['coffee', 'oat milk', 'croissant'], id: `combo-${date}` })
      ),
    },
    {
      symptoms: EXPOSED.slice(0, Math.round(EXPOSED.length * 0.9)).map((date) => makeSymptom(date)),
      wellbeing: EXPOSED.slice(Math.round(EXPOSED.length * 0.9)).map((date) => makeWellbeing(date)),
    },
    {
      symptoms: CONTROL.slice(0, Math.round(CONTROL.length * 0.1)).map((date) => makeSymptom(date)),
      wellbeing: CONTROL.slice(Math.round(CONTROL.length * 0.1)).map((date) => makeWellbeing(date)),
    }
  ),
  range: RANGE,
  factorKey: 'coffee',
  outcome: BLOATING,
  expect: { hasConfounder: true, limitation: /same time|separate/i },
};

// --- 12. A factor the user named themselves --------------------------------

const customFactor: Scenario = {
  name: 'custom factor from the user’s own words',
  why: 'Spec §54: the raw value is never destroyed. A food the vocabulary has never heard of must still be examinable, under the user’s own spelling.',
  logs: mergeLogs(
    {
      meals: EXPOSED.map((date) => makeMeal(date, { items: ['Kombucha'], id: `kombucha-${date}` })),
    },
    {
      symptoms: EXPOSED.slice(0, Math.round(EXPOSED.length * 0.9)).map((date) => makeSymptom(date)),
      wellbeing: EXPOSED.slice(Math.round(EXPOSED.length * 0.9)).map((date) => makeWellbeing(date)),
    },
    {
      symptoms: CONTROL.slice(0, Math.round(CONTROL.length * 0.1)).map((date) => makeSymptom(date)),
      wellbeing: CONTROL.slice(Math.round(CONTROL.length * 0.1)).map((date) => makeWellbeing(date)),
    }
  ),
  range: RANGE,
  factorKey: 'kombucha',
  outcome: BLOATING,
  expect: { status: ['moderate', 'stronger_recurring_signal'] },
};

// --- 13. A factor present every single day ---------------------------------

const noControlGroup: Scenario = {
  name: 'factor present every day',
  why: 'Someone who drinks coffee every morning cannot learn anything about coffee from their own diary. Saying nothing is the honest answer; inventing a comparison is not.',
  logs: mergeLogs(
    { meals: LONG.map((date) => makeMeal(date, { tags: ['caffeinated'] })) },
    {
      symptoms: LONG.filter((_, i) => i % 2 === 0).map((date) => makeSymptom(date)),
      wellbeing: LONG.filter((_, i) => i % 2 === 1).map((date) => makeWellbeing(date)),
    }
  ),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: { absent: true },
};

// --- 14. Context as a factor -----------------------------------------------

const contextFactor: Scenario = {
  name: 'thresholded context factor',
  why: 'Spec §85: the factor is “poorer sleep”, not “sleep was logged”. Days rated in the middle of the scale belong to neither group.',
  logs: mergeLogs(
    { context: EXPOSED.map((date) => makeContext(date, { type: 'sleep_quality', value: 1 })) },
    { context: CONTROL.map((date) => makeContext(date, { type: 'sleep_quality', value: 5 })) },
    {
      symptoms: EXPOSED.slice(0, Math.round(EXPOSED.length * 0.9)).map((date) => makeSymptom(date)),
      wellbeing: EXPOSED.slice(Math.round(EXPOSED.length * 0.9)).map((date) => makeWellbeing(date)),
    },
    {
      symptoms: CONTROL.slice(0, Math.round(CONTROL.length * 0.1)).map((date) => makeSymptom(date)),
      wellbeing: CONTROL.slice(Math.round(CONTROL.length * 0.1)).map((date) => makeWellbeing(date)),
    }
  ),
  range: RANGE,
  factorKey: 'poor_sleep',
  outcome: BLOATING,
  expect: { status: ['moderate', 'stronger_recurring_signal'] },
};

// --- 15. A diary too short to say anything ---------------------------------

const tooShort: Scenario = {
  name: 'range too short to compare',
  why: 'A new user with four days of logs must be told nothing at all, however striking those four days look.',
  logs: (() => {
    const short = datesFrom(START, 4);
    return mergeLogs(
      { meals: short.slice(0, 2).map((date) => makeMeal(date, { tags: ['caffeinated'] })) },
      { symptoms: short.slice(0, 2).map((date) => makeSymptom(date)) },
      { wellbeing: short.slice(2).map((date) => makeWellbeing(date)) }
    );
  })(),
  range: { start: START, end: datesFrom(START, 4)[3]! },
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: { absent: true },
};

// --- 16. Someone who logs in bursts ----------------------------------------

const inconsistentLogger: Scenario = {
  name: 'inconsistent logger',
  why: 'Real diaries are not evenly spaced. Someone logs for four days, forgets for ten, comes back. The comparison can still look clean because the days that exist are unambiguous — and confidence must reflect how much of the period is simply unknown, not how tidy the surviving days are.',
  logs: (() => {
    // Four days on, ten days off, repeatedly.
    const logged = LONG.filter((_, i) => i % 14 < 4);
    const exposed = logged.filter((_, i) => i % 2 === 0);
    const control = logged.filter((_, i) => i % 2 === 1);

    return association({
      exposedDates: exposed,
      controlDates: control,
      exposedRate: 0.9,
      controlRate: 0.1,
    });
  })(),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  // The association inside the logged days is strong, and most of the period is still unknown.
  expect: {
    notStatus: ['stronger_recurring_signal'],
    limitation: /less than two thirds|unknown/i,
  },
};

// --- 17. A week when everything was bad ------------------------------------

const illnessWeek: Scenario = {
  name: 'illness week',
  why: 'A stomach bug produces a week of symptoms regardless of what was eaten. A factor that happens to appear during that week must not inherit the credit for it, and week-to-week consistency is what separates the two.',
  logs: (() => {
    const illness = new Set(LONG.slice(28, 35));

    return mergeLogs(
      // The factor is spread evenly across the whole period, unrelated to the illness.
      { meals: EXPOSED.map((date) => makeMeal(date, { tags: ['caffeinated'] })) },
      // Symptoms only during the bad week, on every day of it.
      { symptoms: [...illness].map((date) => makeSymptom(date)) },
      { wellbeing: LONG.filter((date) => !illness.has(date)).map((date) => makeWellbeing(date)) }
    );
  })(),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  // One week pointing one way, eleven pointing nowhere. That is not a pattern.
  expect: { notStatus: ['stronger_recurring_signal', 'moderate'] },
};

// --- 18. Someone who never records a symptom -------------------------------

const noSymptomsAtAll: Scenario = {
  name: 'no-symptom user',
  why: 'Plenty of people track for weeks and feel fine throughout. The engine must find nothing and say nothing, rather than manufacturing a comparison out of a column that is empty on every single day.',
  logs: mergeLogs(
    { meals: EXPOSED.map((date) => makeMeal(date, { tags: ['caffeinated'] })) },
    { wellbeing: LONG.map((date) => makeWellbeing(date)) }
  ),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  // `outcomesFor` derives outcomes from what the diary contains, so a symptom nobody has ever
  // logged is never asked about.
  expect: { absent: true },
};

// --- 19. Symptoms nearly every day -----------------------------------------

const highBaseline: Scenario = {
  name: 'very high symptom baseline',
  why: 'Someone with daily symptoms has almost no symptom-free days to compare against. A 97% rate against a 93% rate is four points on a very unwell person, and presenting that as a finding would hand them a food to give up for nothing.',
  logs: association({ exposedRate: 0.97, controlRate: 0.93 }),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  expect: { status: ['no_clear_pattern'] },
};

// --- 20. Two things changed at once ----------------------------------------

const simultaneousDietChange: Scenario = {
  name: 'two diet changes on the same day',
  why: 'People do not change one thing at a time. Cutting coffee and starting to eat earlier on the same Monday makes the two inseparable for the rest of the diary, and the honest answer is to say so rather than to credit whichever was examined first.',
  logs: (() => {
    const before = LONG.slice(0, 42);
    const after = LONG.slice(42);

    return mergeLogs(
      // Both factors appear together, and only in the second half.
      { meals: after.map((date) => makeMeal(date, { tags: ['caffeinated', 'spicy'] })) },
      { symptoms: before.slice(0, 34).map((date) => makeSymptom(date)) },
      { wellbeing: before.slice(34).map((date) => makeWellbeing(date)) },
      { symptoms: after.slice(0, 8).map((date) => makeSymptom(date)) },
      { wellbeing: after.slice(8).map((date) => makeWellbeing(date)) }
    );
  })(),
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  // Whatever else it concludes, it must notice the other factor moved with this one.
  expect: { hasConfounder: true },
};

export const SCENARIOS: Scenario[] = [
  obvious,
  noAssociation,
  tinySample,
  missingDataHeavy,
  goodStateControls,
  confounded,
  crossWeek,
  oneOff,
  contradictory,
  timezoneBoundary,
  simultaneousExposures,
  customFactor,
  inconsistentLogger,
  illnessWeek,
  noSymptomsAtAll,
  highBaseline,
  simultaneousDietChange,
  noControlGroup,
  contextFactor,
  tooShort,
];

// --- Paired scenarios, which need two runs to mean anything ----------------

/**
 * A retrospective edit (CLAUDE.md §42).
 *
 * The user corrects a month-old entry. The engine must reflect the correction — a finding built
 * on data the user has since said was wrong is worse than no finding.
 */
export const retrospectiveEdit = {
  why: 'A finding must follow the data as corrected, not as first entered.',
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  before: association({ exposedRate: 0.9, controlRate: 0.1 }),
  after: (() => {
    const original = association({ exposedRate: 0.9, controlRate: 0.1 });

    // The user goes back and reclassifies most exposed days as good days instead.
    const corrected = original.symptoms.filter((_, index) => index % 5 === 0);
    const nowGood = original.symptoms
      .filter((_, index) => index % 5 !== 0)
      .map((log) => makeWellbeing(log.occurredLocalDate, { id: `corrected-${log.id}` }));

    return { ...original, symptoms: corrected, wellbeing: [...original.wellbeing, ...nowGood] };
  })(),
};

/**
 * A deletion that changes a finding (CLAUDE.md §42).
 *
 * Removing logs must remove their influence. A tombstoned record is one the user took back, and
 * continuing to count it would mean the app knows something about them they have retracted.
 */
export const deletionChangesFinding = {
  why: 'Deleted logs must stop counting. Anything else means the app is using data the user withdrew.',
  range: RANGE,
  factorKey: 'caffeinated',
  outcome: BLOATING,
  before: association({ exposedRate: 0.9, controlRate: 0.1 }),
  after: (() => {
    const original = association({ exposedRate: 0.9, controlRate: 0.1 });

    // Every coffee entry is deleted, so the factor no longer exists in the diary at all.
    return { ...original, meals: original.meals.map((meal) => tombstone(meal)) };
  })(),
};

export const EMPTY_DIARY: LogSet = emptyLogs();
