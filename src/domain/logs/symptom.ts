/**
 * Symptom log domain model (spec §36, docs/PROJECT_PLAN.md §4.3).
 *
 * A symptom log is an *observation the user reported*, not a clinical finding. The vocabulary
 * is shared with onboarding so the pattern engine, the database check constraint and the UI
 * all speak the same keys — a drift between them would fail at insert time, on a device.
 */

import { z } from 'zod';

import { SYMPTOMS, SYMPTOM_KEYS, type SymptomKey } from '@/domain/onboarding/options';

export const SEVERITY_MIN = 1;
export const SEVERITY_MAX = 10;

/** Longest note we accept here. Anything longer belongs in a journal entry (M7). */
export const NOTE_MAX_LENGTH = 1000;

/** How a record came to exist. Unconfirmed AI output never reaches this table (§4.1). */
export const LOG_SOURCES = ['manual', 'ai_confirmed', 'healthkit', 'imported'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

/** What the user fills in. Occurrence columns are derived from `occurredAt` at save time. */
export const symptomDraftSchema = z.object({
  symptomType: z.enum(SYMPTOM_KEYS),
  severity: z.number().int().min(SEVERITY_MIN).max(SEVERITY_MAX),
  occurredAt: z
    .date()
    .refine((value) => value.getTime() <= Date.now(), { message: 'Pick a time that has passed.' }),
  note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
});

export type SymptomDraft = z.infer<typeof symptomDraftSchema>;

/** A persisted symptom log, in the shape both SQLite and Postgres hold it. */
export type SymptomLog = {
  id: string;
  userId: string;
  symptomType: SymptomKey;
  severity: number;
  note: string | null;
  source: LogSource;
  occurredAt: string;
  occurredLocalDate: string;
  occurredTz: string;
  occurredUtcOffsetMinutes: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Plain-language intensity labels for the severity scale.
 *
 * These describe how strong the user said something felt. They deliberately carry no clinical
 * weight: "severe" is an intensity, never a diagnosis or a signal to seek treatment (§17).
 */
const SEVERITY_LABELS: Record<number, string> = {
  1: 'Barely noticeable',
  2: 'Mild',
  3: 'Mild',
  4: 'Noticeable',
  5: 'Moderate',
  6: 'Moderate',
  7: 'Strong',
  8: 'Strong',
  9: 'Very strong',
  10: 'Severe',
};

export function severityLabel(severity: number): string {
  return SEVERITY_LABELS[severity] ?? 'Moderate';
}

/** The user-facing label for a symptom key. */
export function symptomLabel(key: SymptomKey): string {
  return SYMPTOMS.find((option) => option.key === key)?.label ?? key;
}
