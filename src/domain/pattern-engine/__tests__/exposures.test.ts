import type { ContextLog } from '@/domain/logs/context';
import type { Meal } from '@/domain/logs/meal';
import type { SymptomLog } from '@/domain/logs/symptom';

import { candidateFactors, discoverMealItemFactors, DEFAULT_CANDIDATE_LIMITS } from '../exposures';
import { buildDays, type LogSet } from '../observations';

/**
 * Which factors are worth testing at all (spec §57, §58, §61).
 *
 * Every factor admitted here becomes a comparison, and every comparison is another chance for a
 * coincidence to look like a signal. The filtering is therefore part of the multiple-comparison
 * defence, not merely an optimisation.
 */

const base = {
  userId: 'u1',
  note: null,
  source: 'manual' as const,
  occurredTz: 'UTC',
  occurredUtcOffsetMinutes: 0,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function meal(localDate: string, tags: Meal['tags'] = [], items: string[] = []): Meal {
  return {
    ...base,
    id: `m-${localDate}-${items.join('-')}`,
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

function stress(localDate: string, level: number): ContextLog {
  return {
    ...base,
    id: `c-${localDate}`,
    contextType: 'stress',
    valueNumeric: level,
    valueText: null,
    occurredAt: `${localDate}T20:00:00.000Z`,
    occurredLocalDate: localDate,
  };
}

function symptom(localDate: string): SymptomLog {
  return {
    ...base,
    id: `s-${localDate}`,
    symptomType: 'bloating',
    severity: 5,
    occurredAt: `${localDate}T12:00:00.000Z`,
    occurredLocalDate: localDate,
  };
}

const emptySet: LogSet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };

/** `count` consecutive dates from 2026-01-01. */
function dates(count: number): string[] {
  const start = Date.parse('2026-01-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10)
  );
}

const RANGE = { start: '2026-01-01', end: '2026-01-20' };
const ALL_DATES = dates(20);

describe('discoverMealItemFactors', () => {
  it('finds an item the user logged often enough to be worth testing', () => {
    const meals = ALL_DATES.slice(0, 5).map((date) => meal(date, [], ['coffee']));
    const days = buildDays({ ...emptySet, meals }, RANGE);

    const factors = discoverMealItemFactors(days, 3);

    expect(factors.map((f) => f.key)).toEqual(['coffee']);
    expect(factors[0]?.source).toBe('meal_item');
  });

  it('ignores an item logged too rarely to compare', () => {
    const days = buildDays({ ...emptySet, meals: [meal('2026-01-01', [], ['truffle'])] }, RANGE);

    expect(discoverMealItemFactors(days, 3)).toEqual([]);
  });

  it('groups spellings that differ only by case', () => {
    const meals = [
      meal('2026-01-01', [], ['Coffee']),
      meal('2026-01-02', [], ['coffee']),
      meal('2026-01-03', [], ['COFFEE']),
    ];
    const days = buildDays({ ...emptySet, meals }, RANGE);

    const factors = discoverMealItemFactors(days, 3);

    expect(factors).toHaveLength(1);
    expect(factors[0]?.key).toBe('coffee');
  });

  it('keeps the user’s own words as the label', () => {
    // Spec §54: the raw value is never destroyed. The key normalises; the label does not.
    const meals = [
      meal('2026-01-01', [], ['Oat milk']),
      meal('2026-01-02', [], ['Oat milk']),
      meal('2026-01-03', [], ['oat milk']),
    ];
    const days = buildDays({ ...emptySet, meals }, RANGE);

    expect(discoverMealItemFactors(days, 3)[0]?.label).toBe('Oat milk');
  });

  it('counts days, not mentions, so one busy day cannot qualify a factor alone', () => {
    // Three coffees on one day is one observation of coffee, not three.
    const days = buildDays(
      {
        ...emptySet,
        meals: [
          { ...meal('2026-01-01', [], ['coffee']), id: 'a' },
          { ...meal('2026-01-01', [], ['coffee']), id: 'b' },
          { ...meal('2026-01-01', [], ['coffee']), id: 'c' },
        ],
      },
      RANGE
    );

    expect(discoverMealItemFactors(days, 3)).toEqual([]);
  });

  it('returns factors in a stable order regardless of input order', () => {
    // The engine is deterministic: the same logs must always produce the same scan.
    const names = ['apple', 'banana', 'cherry'];
    const forward = names.flatMap((name) =>
      ALL_DATES.slice(0, 4).map((date) => ({ ...meal(date, [], [name]), id: `${name}-${date}` }))
    );

    const forwardKeys = discoverMealItemFactors(
      buildDays({ ...emptySet, meals: forward }, RANGE),
      3
    ).map((f) => f.key);
    const reverseKeys = discoverMealItemFactors(
      buildDays({ ...emptySet, meals: [...forward].reverse() }, RANGE),
      3
    ).map((f) => f.key);

    expect(forwardKeys).toEqual(reverseKeys);
  });
});

describe('candidateFactors', () => {
  it('admits a factor with enough exposed and enough unexposed days', () => {
    const meals = ALL_DATES.slice(0, 8).map((date) => meal(date, ['caffeinated']));
    const days = buildDays({ ...emptySet, meals }, RANGE);

    const candidates = candidateFactors(days);
    const caffeinated = candidates.find((c) => c.factor.key === 'caffeinated');

    expect(caffeinated).toBeDefined();
    expect(caffeinated?.exposedDays).toBe(8);
    expect(caffeinated?.unexposedDays).toBe(12);
  });

  it('rejects a factor seen on too few days', () => {
    const meals = ALL_DATES.slice(0, 2).map((date) => meal(date, ['spicy']));
    const days = buildDays({ ...emptySet, meals }, RANGE);

    expect(candidateFactors(days).find((c) => c.factor.key === 'spicy')).toBeUndefined();
  });

  it('rejects a factor present on every single day, which has no control group', () => {
    // Someone who drinks coffee every morning cannot learn anything about coffee from their own
    // diary. Saying nothing is the honest answer; inventing a comparison is not.
    const meals = ALL_DATES.map((date) => meal(date, ['caffeinated']));
    const days = buildDays({ ...emptySet, meals }, RANGE);

    expect(candidateFactors(days).find((c) => c.factor.key === 'caffeinated')).toBeUndefined();
  });

  it('rejects a factor present on nearly every day, leaving too thin a control group', () => {
    const meals = ALL_DATES.slice(0, 19).map((date) => meal(date, ['caffeinated']));
    const days = buildDays({ ...emptySet, meals }, RANGE);

    expect(candidateFactors(days).find((c) => c.factor.key === 'caffeinated')).toBeUndefined();
  });

  it('admits thresholded context factors rather than raw context types', () => {
    const context = [
      ...ALL_DATES.slice(0, 6).map((date) => stress(date, 5)),
      ...ALL_DATES.slice(6, 12).map((date) => stress(date, 1)),
    ];
    const days = buildDays({ ...emptySet, context }, RANGE);

    const keys = candidateFactors(days).map((c) => c.factor.key);

    expect(keys).toContain('high_stress');
    expect(keys).toContain('low_stress');
    expect(keys).not.toContain('stress');
  });

  it('includes discovered meal items alongside the fixed factors', () => {
    const meals = ALL_DATES.slice(0, 6).map((date) => meal(date, ['homemade'], ['porridge']));
    const days = buildDays({ ...emptySet, meals }, RANGE);

    const keys = candidateFactors(days).map((c) => c.factor.key);

    expect(keys).toContain('homemade');
    expect(keys).toContain('porridge');
  });

  it('returns an empty list for a diary with nothing in it', () => {
    expect(candidateFactors(buildDays(emptySet, RANGE))).toEqual([]);
  });

  it('returns nothing when the range is too short to compare anything', () => {
    const days = buildDays(
      {
        ...emptySet,
        meals: [meal('2026-01-01', ['caffeinated'])],
        symptoms: [symptom('2026-01-01')],
      },
      { start: '2026-01-01', end: '2026-01-02' }
    );

    expect(candidateFactors(days)).toEqual([]);
  });

  it('orders candidates deterministically', () => {
    const meals = [
      ...ALL_DATES.slice(0, 8).map((date) => ({ ...meal(date, ['caffeinated']), id: `c-${date}` })),
      ...ALL_DATES.slice(0, 6).map((date) => ({ ...meal(date, ['spicy']), id: `s-${date}` })),
    ];
    const days = buildDays({ ...emptySet, meals }, RANGE);

    const first = candidateFactors(days).map((c) => c.factor.key);
    const second = candidateFactors(days).map((c) => c.factor.key);

    expect(first).toEqual(second);
    // Most-observed first, so the strongest evidence is scanned before the thinnest.
    expect(first.indexOf('caffeinated')).toBeLessThan(first.indexOf('spicy'));
  });

  it('honours caller-supplied limits, because the thresholds are judgements', () => {
    const meals = ALL_DATES.slice(0, 2).map((date) => meal(date, ['spicy']));
    const days = buildDays({ ...emptySet, meals }, RANGE);

    const relaxed = candidateFactors(days, { minExposedDays: 2, minControlDays: 2 });

    expect(relaxed.find((c) => c.factor.key === 'spicy')).toBeDefined();
  });

  it('exposes its defaults so they can be documented and reviewed', () => {
    expect(DEFAULT_CANDIDATE_LIMITS.minExposedDays).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_CANDIDATE_LIMITS.minControlDays).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_CANDIDATE_LIMITS.minItemMentions).toBeGreaterThanOrEqual(3);
  });
});
