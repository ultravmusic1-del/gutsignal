/**
 * What the engine is allowed to treat as a factor (spec §54, §85).
 *
 * A factor is an analytical category the engine can test against an outcome. Until
 * `factor_catalog` and its hierarchy arrive, factors are derived from what the app already
 * records in a structured way: meal tags, meal size, the user's own item names, and context.
 *
 * **Context factors are thresholded, not merely present.** "Stress was logged" is not a factor —
 * a stress level of 1 and a stress level of 5 are opposite observations, and treating both as
 * exposure would compare a group against itself. So the factors are `high_stress`, `poor_sleep`
 * and so on, exactly as §85's catalogue anticipates.
 *
 * Every threshold in this file is a judgement, not a measurement. They are gathered here rather
 * than scattered through the engine so they can be reviewed, tuned against real data, and
 * documented in `docs/PATTERN_ENGINE.md` (spec §57, §58).
 */

import {
  MEAL_TAGS,
  MEAL_SIZES,
  mealTagLabel,
  type MealSize,
  type MealTag,
} from '@/domain/logs/meal';
import type { ContextLog, ContextType } from '@/domain/logs/context';

import type { Factor } from './types';

/**
 * A context observation counts as "high" at or above this, and "low" at or below the other.
 *
 * The middle of a 1–5 scale is deliberately neither: a day rated 3 is not evidence of stress or
 * of calm, and forcing it into one group would put ambiguous days on a side they do not belong.
 */
export const CONTEXT_HIGH_THRESHOLD = 4;
export const CONTEXT_LOW_THRESHOLD = 2;

export type ContextFactorDefinition = {
  key: string;
  label: string;
  contextType: ContextType;
  /** Whether this particular entry counts as exposure. */
  matches: (log: ContextLog) => boolean;
};

/**
 * The context factors worth testing.
 *
 * Both ends of each scale are included. "Slept badly" and "slept well" are different questions,
 * and a user who only ever logs one of them should still get an answer about it.
 */
export const CONTEXT_FACTORS: ContextFactorDefinition[] = [
  {
    key: 'high_stress',
    label: 'Higher stress',
    contextType: 'stress',
    matches: (log) => log.valueNumeric !== null && log.valueNumeric >= CONTEXT_HIGH_THRESHOLD,
  },
  {
    key: 'low_stress',
    label: 'Lower stress',
    contextType: 'stress',
    matches: (log) => log.valueNumeric !== null && log.valueNumeric <= CONTEXT_LOW_THRESHOLD,
  },
  {
    key: 'poor_sleep',
    label: 'Poorer sleep',
    contextType: 'sleep_quality',
    matches: (log) => log.valueNumeric !== null && log.valueNumeric <= CONTEXT_LOW_THRESHOLD,
  },
  {
    key: 'good_sleep',
    label: 'Better sleep',
    contextType: 'sleep_quality',
    matches: (log) => log.valueNumeric !== null && log.valueNumeric >= CONTEXT_HIGH_THRESHOLD,
  },
  {
    key: 'exercise',
    label: 'Exercise',
    contextType: 'exercise',
    matches: (log) => log.valueText !== null && log.valueText !== 'none',
  },
];

export const CONTEXT_FACTOR_KEYS = CONTEXT_FACTORS.map((definition) => definition.key);

export function contextFactorDefinition(key: string): ContextFactorDefinition | undefined {
  return CONTEXT_FACTORS.find((definition) => definition.key === key);
}

/** Meal sizes worth testing. The middle size is the norm, not a signal. */
export const MEAL_SIZE_FACTOR_KEYS: MealSize[] = MEAL_SIZES.filter((size) => size !== 'medium');

export const MEAL_SIZE_LABELS: Record<string, string> = {
  small: 'Smaller meals',
  large: 'Larger meals',
};

// --- Building `Factor` values ----------------------------------------------

export function mealTagFactor(tag: MealTag): Factor {
  return { key: tag, label: mealTagLabel(tag), source: 'meal_tag' };
}

export function mealSizeFactor(size: MealSize): Factor {
  return { key: size, label: MEAL_SIZE_LABELS[size] ?? size, source: 'meal_size' };
}

export function contextFactor(definition: ContextFactorDefinition): Factor {
  return { key: definition.key, label: definition.label, source: 'context' };
}

/**
 * A factor for something the user typed into a meal.
 *
 * The key is lower-cased so spellings group together; the label keeps the user's own words,
 * because the raw value is never destroyed (spec §54).
 */
export function mealItemFactor(rawName: string): Factor {
  return { key: rawName.toLocaleLowerCase(), label: rawName, source: 'meal_item' };
}

/** Every factor that does not depend on what the user happens to have logged. */
export function fixedFactors(): Factor[] {
  return [
    ...MEAL_TAGS.map(mealTagFactor),
    ...MEAL_SIZE_FACTOR_KEYS.map(mealSizeFactor),
    ...CONTEXT_FACTORS.map(contextFactor),
  ];
}
