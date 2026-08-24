/**
 * Context log domain model (spec §47, docs/PROJECT_PLAN.md §4.3).
 *
 * Context is what surrounds a day rather than what happened in the gut: stress, sleep and
 * exercise. The engine reads these mainly as **confounders** — coffee and short sleep travel
 * together, and without the sleep observation the engine would happily attribute their combined
 * effect to coffee alone (spec §60).
 *
 * Deliberately narrow. Spec §47 warns against building an overwhelming universal health diary,
 * so travel and menstrual-cycle context are not here: they are listed as possible later, opt-in
 * additions, and asking every user for them would be exactly the overreach that warning names.
 */

import { z } from 'zod';

export const CONTEXT_TYPES = ['stress', 'sleep_quality', 'exercise'] as const;
export type ContextType = (typeof CONTEXT_TYPES)[number];

export const CONTEXT_TYPE_LABELS: Record<ContextType, string> = {
  stress: 'Stress',
  sleep_quality: 'Sleep quality',
  exercise: 'Exercise',
};

/** Types measured on a 1–5 scale. The rest carry a text value instead. */
export const SCALED_CONTEXT_TYPES = ['stress', 'sleep_quality'] as const;

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

export const EXERCISE_LEVELS = ['none', 'light', 'moderate', 'intense'] as const;
export type ExerciseLevel = (typeof EXERCISE_LEVELS)[number];

export const EXERCISE_LABELS: Record<ExerciseLevel, string> = {
  none: 'None',
  light: 'Light',
  moderate: 'Moderate',
  intense: 'Intense',
};

/** Plain-language ends of each scale, so a number never stands alone (CLAUDE.md §36). */
export const SCALE_LABELS: Record<(typeof SCALED_CONTEXT_TYPES)[number], [string, string]> = {
  stress: ['Calm', 'Very stressed'],
  sleep_quality: ['Slept badly', 'Slept well'],
};

export const NOTE_MAX_LENGTH = 1000;

function isScaled(type: ContextType): boolean {
  return (SCALED_CONTEXT_TYPES as readonly string[]).includes(type);
}

/**
 * The flat shape the row is stored in, with the same pairing rule the database enforces.
 *
 * Keeping one rule expressed in two places that must agree is a risk; keeping it expressed the
 * same way in both is what makes the agreement checkable.
 */
export const contextDraftSchema = z
  .object({
    contextType: z.enum(CONTEXT_TYPES),
    valueNumeric: z.number().int().min(SCALE_MIN).max(SCALE_MAX).nullable(),
    valueText: z.enum(EXERCISE_LEVELS).nullable(),
    occurredAt: z.date().refine((value) => value.getTime() <= Date.now(), {
      message: 'Pick a time that has passed.',
    }),
    note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
  })
  .refine(
    (draft) =>
      isScaled(draft.contextType)
        ? draft.valueNumeric !== null && draft.valueText === null
        : draft.valueText !== null && draft.valueNumeric === null,
    { message: 'That context type needs the matching kind of value.' }
  );

export type ContextDraft = z.infer<typeof contextDraftSchema>;

export function contextTypeLabel(type: ContextType): string {
  return CONTEXT_TYPE_LABELS[type];
}

export function exerciseLabel(level: ExerciseLevel): string {
  return EXERCISE_LABELS[level];
}

/** How a stored context entry reads in the timeline. */
export function contextSummary(log: {
  contextType: ContextType;
  valueNumeric: number | null;
  valueText: string | null;
}): string {
  if (log.contextType === 'exercise') {
    const level = (log.valueText ?? 'none') as ExerciseLevel;
    return `${contextTypeLabel(log.contextType)} · ${exerciseLabel(level)}`;
  }

  const scale = SCALE_LABELS[log.contextType];
  const value = log.valueNumeric ?? 0;
  const end = value <= 2 ? scale[0] : value >= 4 ? scale[1] : 'In between';

  return `${contextTypeLabel(log.contextType)} · ${value}/${SCALE_MAX} — ${end}`;
}

/** A persisted context observation. */
export type ContextLog = import('./base').BaseLog & {
  contextType: ContextType;
  valueNumeric: number | null;
  valueText: string | null;
};
