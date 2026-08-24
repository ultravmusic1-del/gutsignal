/**
 * Bowel movement log domain model (spec §45, docs/PROJECT_PLAN.md §4.3).
 *
 * The Bristol scale is a descriptive classification, not a diagnosis. Nothing here maps a type
 * to a condition, and nothing should: "type 6" is a description of one observation, never a
 * statement about the person (CLAUDE.md §17).
 *
 * The descriptions below are written in plain language rather than reproduced from any
 * published chart, and the app draws its own shapes rather than using stool illustrations
 * (spec §45).
 */

import { z } from 'zod';

export const BRISTOL_MIN = 1;
export const BRISTOL_MAX = 7;

export const BRISTOL_TYPES = [1, 2, 3, 4, 5, 6, 7] as const;
export type BristolType = (typeof BRISTOL_TYPES)[number];

/** Short, neutral descriptions. Deliberately physical, never interpretive. */
export const BRISTOL_DESCRIPTIONS: Record<BristolType, string> = {
  1: 'Separate hard lumps',
  2: 'Lumpy and firm',
  3: 'Firm with cracks',
  4: 'Smooth and soft',
  5: 'Soft blobs, clear edges',
  6: 'Mushy, ragged edges',
  7: 'Entirely liquid',
};

export const URGENCY_LEVELS = ['none', 'low', 'moderate', 'high'] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  none: 'None',
  low: 'Some',
  moderate: 'Strong',
  high: 'Urgent',
};

export const DIFFICULTY_LEVELS = ['easy', 'moderate', 'difficult'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: 'Easy',
  moderate: 'Some effort',
  difficult: 'Difficult',
};

export const NOTE_MAX_LENGTH = 1000;

export const bowelDraftSchema = z.object({
  bristolType: z.number().int().min(BRISTOL_MIN).max(BRISTOL_MAX),
  urgency: z.enum(URGENCY_LEVELS),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  /** Whether it felt unfinished. A reported sensation, not a clinical finding. */
  incomplete: z.boolean(),
  occurredAt: z
    .date()
    .refine((value) => value.getTime() <= Date.now(), { message: 'Pick a time that has passed.' }),
  note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
});

export type BowelDraft = z.infer<typeof bowelDraftSchema>;

export function bristolDescription(type: number): string {
  return BRISTOL_DESCRIPTIONS[type as BristolType] ?? 'Not described';
}

export function urgencyLabel(level: UrgencyLevel): string {
  return URGENCY_LABELS[level];
}

export function difficultyLabel(level: DifficultyLevel): string {
  return DIFFICULTY_LABELS[level];
}

/** A one-line summary for the timeline. Describes the entry, never interprets it. */
export function bowelSummary(log: { bristolType: number; urgency: UrgencyLevel }): string {
  return `Type ${log.bristolType} · ${bristolDescription(log.bristolType)}`;
}

/** A persisted bowel movement log. */
export type BowelLog = import('./base').BaseLog & {
  bristolType: number;
  urgency: UrgencyLevel;
  difficulty: DifficultyLevel;
  incomplete: boolean;
};
