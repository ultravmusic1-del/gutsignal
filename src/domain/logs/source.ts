/**
 * How a logged record came to exist (docs/PROJECT_PLAN.md §4.1).
 *
 * Shared by every event table, because the pattern engine treats provenance uniformly: a meal
 * the user typed and a meal confirmed from a photo are equally real, while unconfirmed AI
 * output is not a log at all — it waits in `ai_extraction_candidates` until the user says so
 * (CLAUDE.md §23).
 */

export const LOG_SOURCES = ['manual', 'ai_confirmed', 'healthkit', 'imported'] as const;

export type LogSource = (typeof LOG_SOURCES)[number];
