/**
 * Wellbeing log domain model (spec §44, docs/PROJECT_PLAN.md §4.3).
 *
 * This is the smallest table in the product and one of the most important. The pattern engine
 * needs control observations, and **the absence of a symptom log is not one**: it could equally
 * mean the user felt fine, was busy, or forgot. Only an explicit statement that today was a good
 * day can serve as a comparison point, which is why this is stored separately and is never
 * inferred from missing data (spec §59, CLAUDE.md §19).
 *
 * One tap, by design. Anything that makes this slower makes the control group smaller, and a
 * control group that only the most diligent users produce is a biased one.
 */

import { z } from 'zod';

export const NOTE_MAX_LENGTH = 1000;

export const wellbeingDraftSchema = z.object({
  occurredAt: z
    .date()
    .refine((value) => value.getTime() <= Date.now(), { message: 'Pick a time that has passed.' }),
  note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
});

export type WellbeingDraft = z.infer<typeof wellbeingDraftSchema>;

/** A persisted wellbeing observation. Deliberately carries nothing but when and an optional note. */
export type WellbeingLog = import('./base').BaseLog;
