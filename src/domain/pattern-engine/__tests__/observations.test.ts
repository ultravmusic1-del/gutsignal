import type { BowelLog } from '@/domain/logs/bowel';
import type { ContextLog } from '@/domain/logs/context';
import type { Meal } from '@/domain/logs/meal';
import type { SymptomLog } from '@/domain/logs/symptom';
import type { WellbeingLog } from '@/domain/logs/wellbeing';

import {
  buildDays,
  buildObservations,
  outcomeObservability,
  trackingCompleteness,
  type DayLogs,
} from '../observations';
import type { Factor, Outcome } from '../types';

/**
 * The missing-data rules (spec §59, CLAUDE.md §19) are the most consequential thing in the
 * engine. A blank day is not a good day, and the difference decides whether the control group
 * is real evidence or an artefact of how diligently someone happened to log.
 */

const base = {
  userId: 'u1',
  note: null,
  source: 'manual' as const,
  occurredTz: 'UTC',
  occurredUtcOffsetMinutes: 0,
  deletedAt: null,
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
};

function symptom(localDate: string, symptomType = 'bloating', severity = 6): SymptomLog {
  return {
    ...base,
    id: `s-${localDate}-${symptomType}`,
    symptomType: symptomType as SymptomLog['symptomType'],
    severity,
    occurredAt: `${localDate}T12:00:00.000Z`,
    occurredLocalDate: localDate,
  };
}

function wellbeing(localDate: string): WellbeingLog {
  return {
    ...base,
    id: `w-${localDate}`,
    occurredAt: `${localDate}T18:00:00.000Z`,
    occurredLocalDate: localDate,
  };
}

function meal(localDate: string, tags: Meal['tags'] = [], items: string[] = []): Meal {
  return {
    ...base,
    id: `m-${localDate}`,
    title: 'A meal',
    mealSize: 'medium',
    photoAssetId: null,
    occurredAt: `${localDate}T08:00:00.000Z`,
    occurredLocalDate: localDate,
    items: items.map((rawName, position) => ({
      id: `mi-${localDate}-${position}`,
      mealId: `m-${localDate}`,
      userId: 'u1',
      rawName,
      canonicalFactorId: null,
      confidence: null,
      userConfirmed: true,
      position,
    })),
    tags,
  };
}

function bowel(localDate: string, bristolType = 4, urgency: BowelLog['urgency'] = 'low'): BowelLog {
  return {
    ...base,
    id: `b-${localDate}`,
    bristolType,
    urgency,
    difficulty: 'easy',
    incomplete: false,
    occurredAt: `${localDate}T07:00:00.000Z`,
    occurredLocalDate: localDate,
  };
}

function context(localDate: string, contextType: ContextLog['contextType'] = 'stress'): ContextLog {
  return {
    ...base,
    id: `c-${localDate}`,
    contextType,
    valueNumeric: 4,
    valueText: null,
    occurredAt: `${localDate}T20:00:00.000Z`,
    occurredLocalDate: localDate,
  };
}

const emptySet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };

const COFFEE: Factor = { key: 'caffeinated', label: 'Caffeinated', source: 'meal_tag' };
const BLOATING: Outcome = { kind: 'symptom_occurrence', symptomType: 'bloating' };

describe('buildDays', () => {
  it('creates a day for every date in the range, including ones with nothing logged', () => {
    // Days with no logs must exist as days. Dropping them would hide how much is unknown.
    const days = buildDays(
      { ...emptySet, symptoms: [symptom('2026-08-24')] },
      { start: '2026-08-22', end: '2026-08-24' }
    );

    expect(days.map((day) => day.localDate)).toEqual(['2026-08-22', '2026-08-23', '2026-08-24']);
  });

  it('files each log under its own local date, not the range', () => {
    const days = buildDays(
      {
        ...emptySet,
        symptoms: [symptom('2026-08-22'), symptom('2026-08-24')],
        meals: [meal('2026-08-23')],
      },
      { start: '2026-08-22', end: '2026-08-24' }
    );

    expect(days[0]?.symptoms).toHaveLength(1);
    expect(days[1]?.symptoms).toHaveLength(0);
    expect(days[1]?.meals).toHaveLength(1);
    expect(days[2]?.symptoms).toHaveLength(1);
  });

  it('ignores logs outside the range', () => {
    const days = buildDays(
      { ...emptySet, symptoms: [symptom('2026-01-01'), symptom('2026-08-23')] },
      { start: '2026-08-22', end: '2026-08-24' }
    );

    expect(days.flatMap((day) => day.symptoms)).toHaveLength(1);
  });

  it('returns nothing for a backwards range rather than inventing days', () => {
    expect(buildDays(emptySet, { start: '2026-08-24', end: '2026-08-22' })).toEqual([]);
  });
});

describe('outcomeObservability — the missing-data rule', () => {
  const day = (over: Partial<DayLogs>): DayLogs => ({
    localDate: '2026-08-24',
    meals: [],
    symptoms: [],
    bowel: [],
    wellbeing: [],
    context: [],
    ...over,
  });

  it('reports no data for a completely empty day', () => {
    expect(outcomeObservability(day({}), BLOATING)).toBe('no_data');
  });

  it('reports no data for a day where ONLY a meal was logged', () => {
    // The trap. Logging lunch says nothing whatsoever about whether symptoms happened, so this
    // day cannot serve as a control. Treating it as one would manufacture evidence out of the
    // days someone remembered to log food and forgot everything else.
    expect(outcomeObservability(day({ meals: [meal('2026-08-24')] }), BLOATING)).toBe('no_data');
  });

  it('reports no data for a day where only context was logged', () => {
    expect(outcomeObservability(day({ context: [context('2026-08-24')] }), BLOATING)).toBe(
      'no_data'
    );
  });

  it('reports an explicit good state only when the user actually said so', () => {
    expect(outcomeObservability(day({ wellbeing: [wellbeing('2026-08-24')] }), BLOATING)).toBe(
      'explicit_good_state'
    );
  });

  it('reports a symptom observation when the symptom was recorded', () => {
    expect(outcomeObservability(day({ symptoms: [symptom('2026-08-24')] }), BLOATING)).toBe(
      'symptom_logged'
    );
  });

  it('counts a different symptom as an observation of this one not happening', () => {
    // Recording nausea shows the user was tracking symptoms that day, so the absence of
    // bloating is real evidence rather than silence.
    expect(
      outcomeObservability(day({ symptoms: [symptom('2026-08-24', 'nausea')] }), BLOATING)
    ).toBe('symptom_logged');
  });

  it('lets a symptom outrank a good-state entry on the same day', () => {
    const observed = outcomeObservability(
      day({ symptoms: [symptom('2026-08-24')], wellbeing: [wellbeing('2026-08-24')] }),
      BLOATING
    );

    expect(observed).toBe('symptom_logged');
  });

  it('does not let a good day make bowel type observable', () => {
    // Feeling fine says nothing about what a stool looked like. Only a bowel log does.
    const outcome: Outcome = { kind: 'stool_consistency' };

    expect(outcomeObservability(day({ wellbeing: [wellbeing('2026-08-24')] }), outcome)).toBe(
      'no_data'
    );
    expect(outcomeObservability(day({ bowel: [bowel('2026-08-24')] }), outcome)).toBe(
      'symptom_logged'
    );
  });

  it('treats either a good day or a symptom as an observation of wellbeing', () => {
    const outcome: Outcome = { kind: 'wellbeing' };

    expect(outcomeObservability(day({ wellbeing: [wellbeing('2026-08-24')] }), outcome)).toBe(
      'explicit_good_state'
    );
    expect(outcomeObservability(day({ symptoms: [symptom('2026-08-24')] }), outcome)).toBe(
      'symptom_logged'
    );
    expect(outcomeObservability(day({ meals: [meal('2026-08-24')] }), outcome)).toBe('no_data');
  });
});

describe('buildObservations', () => {
  const range = { start: '2026-08-20', end: '2026-08-24' };

  it('marks a day exposed when the factor was present', () => {
    const days = buildDays(
      {
        ...emptySet,
        meals: [meal('2026-08-21', ['caffeinated']), meal('2026-08-22')],
        symptoms: [symptom('2026-08-21'), symptom('2026-08-22')],
      },
      range
    );

    const observations = buildObservations(days, COFFEE, BLOATING);
    const byDate = new Map(observations.map((o) => [o.localDate, o]));

    expect(byDate.get('2026-08-21')?.exposed).toBe(true);
    expect(byDate.get('2026-08-22')?.exposed).toBe(false);
  });

  it('records when the exposure happened, for later window work', () => {
    const days = buildDays({ ...emptySet, meals: [meal('2026-08-21', ['caffeinated'])] }, range);
    const observation = buildObservations(days, COFFEE, BLOATING).find(
      (o) => o.localDate === '2026-08-21'
    );

    expect(observation?.exposedAt).toBe('2026-08-21T08:00:00.000Z');
  });

  it('leaves the exposure instant null on unexposed days', () => {
    const days = buildDays({ ...emptySet, meals: [meal('2026-08-21')] }, range);
    const observation = buildObservations(days, COFFEE, BLOATING).find(
      (o) => o.localDate === '2026-08-21'
    );

    expect(observation?.exposedAt).toBeNull();
  });

  it('keeps unknown-outcome days rather than dropping them', () => {
    // The count of what was unknown is itself evidence about how much to trust the rest.
    const days = buildDays({ ...emptySet, meals: [meal('2026-08-21', ['caffeinated'])] }, range);
    const observations = buildObservations(days, COFFEE, BLOATING);

    expect(observations).toHaveLength(5);
    expect(observations.every((o) => o.outcomeState === 'no_data')).toBe(true);
  });

  it('marks the outcome as occurred only when that symptom was recorded', () => {
    const days = buildDays(
      {
        ...emptySet,
        symptoms: [symptom('2026-08-21', 'bloating'), symptom('2026-08-22', 'nausea')],
      },
      range
    );

    const byDate = new Map(buildObservations(days, COFFEE, BLOATING).map((o) => [o.localDate, o]));

    expect(byDate.get('2026-08-21')?.outcomeOccurred).toBe(true);
    expect(byDate.get('2026-08-22')?.outcomeOccurred).toBe(false);
  });

  it('never reports an outcome as occurred on a day with no observation', () => {
    const days = buildDays(emptySet, range);
    const observations = buildObservations(days, COFFEE, BLOATING);

    expect(observations.every((o) => o.outcomeOccurred === false)).toBe(true);
    expect(observations.every((o) => o.outcomeValue === null)).toBe(true);
  });

  it('carries severity as the value for a severity outcome', () => {
    const outcome: Outcome = { kind: 'symptom_severity', symptomType: 'bloating' };
    const days = buildDays(
      { ...emptySet, symptoms: [symptom('2026-08-21', 'bloating', 8)] },
      range
    );

    const observation = buildObservations(days, COFFEE, outcome).find(
      (o) => o.localDate === '2026-08-21'
    );

    expect(observation?.outcomeValue).toBe(8);
  });

  it('takes the worst severity when a symptom was recorded more than once', () => {
    const outcome: Outcome = { kind: 'symptom_severity', symptomType: 'bloating' };
    const days = buildDays(
      {
        ...emptySet,
        symptoms: [
          { ...symptom('2026-08-21', 'bloating', 3), id: 'a' },
          { ...symptom('2026-08-21', 'bloating', 9), id: 'b' },
        ],
      },
      range
    );

    const observation = buildObservations(days, COFFEE, outcome).find(
      (o) => o.localDate === '2026-08-21'
    );

    expect(observation?.outcomeValue).toBe(9);
  });

  it('recognises an explicit good day as an observed absence, not a gap', () => {
    const days = buildDays({ ...emptySet, wellbeing: [wellbeing('2026-08-21')] }, range);
    const observation = buildObservations(days, COFFEE, BLOATING).find(
      (o) => o.localDate === '2026-08-21'
    );

    expect(observation?.outcomeState).toBe('explicit_good_state');
    expect(observation?.outcomeOccurred).toBe(false);
  });
});

describe('exposure sources', () => {
  const range = { start: '2026-08-21', end: '2026-08-21' };

  it('finds a factor in a meal item', () => {
    const factor: Factor = { key: 'coffee', label: 'Coffee', source: 'meal_item' };
    const days = buildDays({ ...emptySet, meals: [meal('2026-08-21', [], ['Coffee'])] }, range);

    expect(buildObservations(days, factor, BLOATING)[0]?.exposed).toBe(true);
  });

  it('matches a meal item regardless of case', () => {
    const factor: Factor = { key: 'coffee', label: 'Coffee', source: 'meal_item' };
    const days = buildDays({ ...emptySet, meals: [meal('2026-08-21', [], ['COFFEE'])] }, range);

    expect(buildObservations(days, factor, BLOATING)[0]?.exposed).toBe(true);
  });

  it('finds a factor in a context entry', () => {
    const factor: Factor = { key: 'stress', label: 'Stress', source: 'context' };
    const days = buildDays({ ...emptySet, context: [context('2026-08-21', 'stress')] }, range);

    expect(buildObservations(days, factor, BLOATING)[0]?.exposed).toBe(true);
  });

  it('finds a factor in meal size', () => {
    const factor: Factor = { key: 'large', label: 'Large meal', source: 'meal_size' };
    const days = buildDays({ ...emptySet, meals: [meal('2026-08-21')] }, range);

    expect(buildObservations(days, factor, BLOATING)[0]?.exposed).toBe(false);
  });
});

describe('trackingCompleteness', () => {
  it('measures how much of the range carries any log at all', () => {
    const days = buildDays(
      {
        ...emptySet,
        symptoms: [symptom('2026-08-21')],
        wellbeing: [wellbeing('2026-08-22')],
        meals: [meal('2026-08-23')],
      },
      { start: '2026-08-20', end: '2026-08-24' }
    );

    expect(trackingCompleteness(days)).toEqual({
      totalDays: 5,
      daysWithAnyLog: 3,
      daysWithGoodState: 1,
      daysWithSymptom: 1,
      coverage: 0.6,
    });
  });

  it('reports zero coverage for an empty range rather than dividing by zero', () => {
    expect(trackingCompleteness([])).toEqual({
      totalDays: 0,
      daysWithAnyLog: 0,
      daysWithGoodState: 0,
      daysWithSymptom: 0,
      coverage: 0,
    });
  });
});
