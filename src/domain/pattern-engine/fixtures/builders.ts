/**
 * Building synthetic diaries (spec §53, CLAUDE.md §42).
 *
 * The fixture suite is the pattern engine's acceptance criterion, and it is only as trustworthy
 * as the diaries it runs on. These builders exist so a scenario reads as a description of a
 * person's month rather than as a wall of object literals — if a fixture is hard to read, nobody
 * can tell whether it actually encodes the situation it claims to.
 *
 * Every log carries its own `occurredLocalDate`, exactly as the app writes it. Nothing here
 * derives a day from an instant, because the engine must never do so either (risk R-02) and a
 * fixture that cheated would hide precisely the bug it should catch.
 */

import type { BowelLog, DifficultyLevel, UrgencyLevel } from '@/domain/logs/bowel';
import type { ContextLog, ContextType, ExerciseLevel } from '@/domain/logs/context';
import type { Meal, MealSize, MealTag } from '@/domain/logs/meal';
import type { SymptomLog } from '@/domain/logs/symptom';
import type { WellbeingLog } from '@/domain/logs/wellbeing';
import type { SymptomKey } from '@/domain/onboarding/options';

import type { LogSet } from '../observations';

export const USER_ID = 'fixture-user';

const COMMON = {
  userId: USER_ID,
  note: null,
  source: 'manual' as const,
  occurredTz: 'UTC',
  occurredUtcOffsetMinutes: 0,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** `count` consecutive local dates starting at `start`. */
export function datesFrom(start: string, count: number): string[] {
  const first = Date.parse(`${start}T00:00:00Z`);

  return Array.from({ length: count }, (_, index) =>
    new Date(first + index * 86_400_000).toISOString().slice(0, 10)
  );
}

export function emptyLogs(): LogSet {
  return { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };
}

/** Merges several partial log sets into one. */
export function mergeLogs(...sets: Partial<LogSet>[]): LogSet {
  return sets.reduce<LogSet>(
    (all, set) => ({
      meals: [...all.meals, ...(set.meals ?? [])],
      symptoms: [...all.symptoms, ...(set.symptoms ?? [])],
      bowel: [...all.bowel, ...(set.bowel ?? [])],
      wellbeing: [...all.wellbeing, ...(set.wellbeing ?? [])],
      context: [...all.context, ...(set.context ?? [])],
    }),
    emptyLogs()
  );
}

type Occurrence = {
  /** Defaults to midday on `localDate`, in UTC. */
  at?: string;
  /** Defaults to `'UTC'`. Set to encode a diary written in another zone. */
  tz?: string;
  offsetMinutes?: number;
};

function occurrence(localDate: string, hour: number, options: Occurrence = {}) {
  return {
    occurredAt: options.at ?? `${localDate}T${String(hour).padStart(2, '0')}:00:00.000Z`,
    occurredLocalDate: localDate,
    occurredTz: options.tz ?? 'UTC',
    occurredUtcOffsetMinutes: options.offsetMinutes ?? 0,
  };
}

export function makeMeal(
  localDate: string,
  {
    tags = [],
    items = [],
    size = 'medium',
    id,
    hour = 8,
    ...rest
  }: {
    tags?: MealTag[];
    items?: string[];
    size?: MealSize;
    id?: string;
    hour?: number;
  } & Occurrence = {}
): Meal {
  const mealId = id ?? `meal-${localDate}-${tags.join('+')}-${items.join('+')}`;

  return {
    ...COMMON,
    ...occurrence(localDate, hour, rest),
    id: mealId,
    title: items.length > 0 ? items.join(', ') : 'A meal',
    mealSize: size,
    photoAssetId: null,
    items: items.map((rawName, position) => ({
      id: `${mealId}-item-${position}`,
      mealId,
      userId: USER_ID,
      rawName,
      canonicalFactorId: null,
      confidence: null,
      userConfirmed: true,
      position,
    })),
    tags,
  };
}

export function makeSymptom(
  localDate: string,
  {
    type = 'bloating',
    severity = 6,
    id,
    hour = 14,
    ...rest
  }: { type?: SymptomKey; severity?: number; id?: string; hour?: number } & Occurrence = {}
): SymptomLog {
  return {
    ...COMMON,
    ...occurrence(localDate, hour, rest),
    id: id ?? `symptom-${localDate}-${type}`,
    symptomType: type,
    severity,
  };
}

export function makeWellbeing(
  localDate: string,
  { id, hour = 20, ...rest }: { id?: string; hour?: number } & Occurrence = {}
): WellbeingLog {
  return {
    ...COMMON,
    ...occurrence(localDate, hour, rest),
    id: id ?? `wellbeing-${localDate}`,
  };
}

export function makeBowel(
  localDate: string,
  {
    bristolType = 4,
    urgency = 'low',
    difficulty = 'easy',
    incomplete = false,
    id,
    hour = 7,
    ...rest
  }: {
    bristolType?: number;
    urgency?: UrgencyLevel;
    difficulty?: DifficultyLevel;
    incomplete?: boolean;
    id?: string;
    hour?: number;
  } & Occurrence = {}
): BowelLog {
  return {
    ...COMMON,
    ...occurrence(localDate, hour, rest),
    id: id ?? `bowel-${localDate}`,
    bristolType,
    urgency,
    difficulty,
    incomplete,
  };
}

export function makeContext(
  localDate: string,
  {
    type = 'stress',
    value = 4,
    level,
    id,
    hour = 21,
    ...rest
  }: {
    type?: ContextType;
    /** For the scaled types. */
    value?: number;
    /** For exercise. */
    level?: ExerciseLevel;
    id?: string;
    hour?: number;
  } & Occurrence = {}
): ContextLog {
  const isExercise = type === 'exercise';

  return {
    ...COMMON,
    ...occurrence(localDate, hour, rest),
    id: id ?? `context-${localDate}-${type}`,
    contextType: type,
    valueNumeric: isExercise ? null : value,
    valueText: isExercise ? (level ?? 'moderate') : null,
  };
}

/**
 * Marks a log deleted, as the app's tombstone does.
 *
 * Used by the deletion fixture: the engine must stop counting a record the user removed, which
 * is a different thing from the record never having existed.
 */
export function tombstone<T extends { deletedAt: string | null; updatedAt: string }>(
  log: T,
  at = '2026-06-01T00:00:00.000Z'
): T {
  return { ...log, deletedAt: at, updatedAt: at };
}
