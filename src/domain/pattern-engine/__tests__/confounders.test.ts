import type { ContextLog } from '@/domain/logs/context';
import type { Meal } from '@/domain/logs/meal';

import { findConfounders, imbalanceBetween, maxOverlap } from '../confounders';
import { buildDays, type LogSet } from '../observations';
import type { Factor } from '../types';

/**
 * Detecting factors that travelled together (spec §60).
 *
 * The measure is deliberately **imbalance**, not similarity. What ruins a comparison is the
 * other factor being unevenly distributed between the two groups — not how often the two things
 * merely co-occur.
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

function meal(localDate: string, tags: Meal['tags']): Meal {
  return {
    ...base,
    id: `m-${localDate}-${tags.join('-')}`,
    title: 'A meal',
    mealSize: 'medium',
    photoAssetId: null,
    occurredAt: `${localDate}T08:00:00.000Z`,
    occurredLocalDate: localDate,
    items: [],
    tags,
  };
}

function sleep(localDate: string, level: number): ContextLog {
  return {
    ...base,
    id: `c-${localDate}`,
    contextType: 'sleep_quality',
    valueNumeric: level,
    valueText: null,
    occurredAt: `${localDate}T07:00:00.000Z`,
    occurredLocalDate: localDate,
  };
}

const emptySet: LogSet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };

const RANGE = { start: '2026-01-01', end: '2026-01-20' };
const DATES = Array.from({ length: 20 }, (_, i) =>
  new Date(Date.parse('2026-01-01T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10)
);

const COFFEE: Factor = { key: 'caffeinated', label: 'Caffeinated', source: 'meal_tag' };
const SPICY: Factor = { key: 'spicy', label: 'Spicy', source: 'meal_tag' };
const POOR_SLEEP: Factor = { key: 'poor_sleep', label: 'Poorer sleep', source: 'context' };

describe('imbalanceBetween', () => {
  it('is total when the other factor appears only alongside the target', () => {
    // Coffee every day for ten days, poor sleep on exactly those days and no others.
    const days = buildDays(
      {
        ...emptySet,
        meals: DATES.slice(0, 10).map((date) => meal(date, ['caffeinated'])),
        context: DATES.slice(0, 10).map((date) => sleep(date, 1)),
      },
      RANGE
    );

    expect(imbalanceBetween(days, COFFEE, POOR_SLEEP)).toBeCloseTo(1);
  });

  it('is zero when the other factor is spread evenly across both groups', () => {
    // Poor sleep on half the coffee days and half the non-coffee days: it cannot explain any
    // difference between them, however often the two co-occur.
    const days = buildDays(
      {
        ...emptySet,
        meals: DATES.slice(0, 10).map((date) => meal(date, ['caffeinated'])),
        context: [...DATES.slice(0, 5), ...DATES.slice(10, 15)].map((date) => sleep(date, 1)),
      },
      RANGE
    );

    expect(imbalanceBetween(days, COFFEE, POOR_SLEEP)).toBeCloseTo(0);
  });

  it('is partial when the other factor merely leans one way', () => {
    const days = buildDays(
      {
        ...emptySet,
        meals: DATES.slice(0, 10).map((date) => meal(date, ['caffeinated'])),
        context: [...DATES.slice(0, 8), ...DATES.slice(10, 12)].map((date) => sleep(date, 1)),
      },
      RANGE
    );

    // 80% of coffee days, 20% of the rest.
    expect(imbalanceBetween(days, COFFEE, POOR_SLEEP)).toBeCloseTo(0.6);
  });

  it('is symmetric in effect but measured from the target', () => {
    const days = buildDays(
      {
        ...emptySet,
        meals: DATES.slice(0, 10).map((date) => meal(date, ['caffeinated'])),
        context: DATES.slice(0, 10).map((date) => sleep(date, 1)),
      },
      RANGE
    );

    expect(imbalanceBetween(days, POOR_SLEEP, COFFEE)).toBeCloseTo(1);
  });

  it('is zero when the target never appears, because there is nothing to split', () => {
    const days = buildDays({ ...emptySet, context: DATES.map((date) => sleep(date, 1)) }, RANGE);

    expect(imbalanceBetween(days, COFFEE, POOR_SLEEP)).toBe(0);
  });

  it('is zero when the target appears every day, because there is no other group', () => {
    const days = buildDays(
      {
        ...emptySet,
        meals: DATES.map((date) => meal(date, ['caffeinated'])),
        context: DATES.slice(0, 5).map((date) => sleep(date, 1)),
      },
      RANGE
    );

    expect(imbalanceBetween(days, COFFEE, POOR_SLEEP)).toBe(0);
  });

  it('is zero for a range with no days at all', () => {
    expect(imbalanceBetween([], COFFEE, POOR_SLEEP)).toBe(0);
  });
});

describe('findConfounders', () => {
  const days = () =>
    buildDays(
      {
        ...emptySet,
        meals: [
          ...DATES.slice(0, 10).map((date) => meal(date, ['caffeinated'])),
          // Spicy is spread evenly, so it confounds nothing.
          ...[...DATES.slice(0, 5), ...DATES.slice(10, 15)].map((date) => ({
            ...meal(date, ['spicy']),
            id: `spicy-${date}`,
          })),
        ],
        context: DATES.slice(0, 10).map((date) => sleep(date, 1)),
      },
      RANGE
    );

  it('reports a factor that travelled with the target', () => {
    const confounders = findConfounders(days(), COFFEE, [SPICY, POOR_SLEEP]);

    expect(confounders.map((c) => c.factor.key)).toEqual(['poor_sleep']);
    expect(confounders[0]?.overlap).toBeCloseTo(1);
  });

  it('ignores a factor that is spread evenly, however often it co-occurs', () => {
    // Spicy appears on five of the ten coffee days — plenty of co-occurrence, no confounding.
    const confounders = findConfounders(days(), COFFEE, [SPICY]);

    expect(confounders).toEqual([]);
  });

  it('never reports the target as its own confounder', () => {
    const confounders = findConfounders(days(), COFFEE, [COFFEE, POOR_SLEEP]);

    expect(confounders.map((c) => c.factor.key)).not.toContain('caffeinated');
  });

  it('orders by overlap, most entangled first, and deterministically', () => {
    const mixed = buildDays(
      {
        ...emptySet,
        meals: [
          ...DATES.slice(0, 10).map((date) => meal(date, ['caffeinated'])),
          ...DATES.slice(0, 8).map((date) => ({ ...meal(date, ['spicy']), id: `s-${date}` })),
        ],
        context: DATES.slice(0, 10).map((date) => sleep(date, 1)),
      },
      RANGE
    );

    const keys = findConfounders(mixed, COFFEE, [SPICY, POOR_SLEEP]).map((c) => c.factor.key);

    expect(keys).toEqual(['poor_sleep', 'spicy']);
    expect(findConfounders(mixed, COFFEE, [POOR_SLEEP, SPICY]).map((c) => c.factor.key)).toEqual(
      keys
    );
  });

  it('finds nothing when there is nothing to compare', () => {
    expect(findConfounders([], COFFEE, [POOR_SLEEP])).toEqual([]);
  });
});

describe('maxOverlap', () => {
  it('is the strongest entanglement found', () => {
    expect(
      maxOverlap([
        { factor: SPICY, overlap: 0.4 },
        { factor: POOR_SLEEP, overlap: 0.9 },
      ])
    ).toBeCloseTo(0.9);
  });

  it('is zero when nothing was entangled, so confidence is not penalised', () => {
    expect(maxOverlap([])).toBe(0);
  });
});
