/**
 * The one display shape every log type collapses to (spec §48).
 *
 * Today and the Timeline show the same entries; without a shared mapping they would drift, and
 * the same meal would read differently on two screens. So each log type is converted here, once,
 * by a pure function.
 *
 * Deliberately presentational-but-honest: a `detail` line describes what was recorded and never
 * interprets it. Nothing here decides what an entry *means* — that is the pattern engine's job,
 * and it works from the structured rows, not from these strings.
 */

import { bowelSummary, urgencyLabel, type BowelLog } from './bowel';
import { contextSummary, type ContextLog } from './context';
import { mealSummary, mealTagLabel, type Meal } from './meal';
import { severityLabel, symptomLabel, type SymptomLog } from './symptom';
import type { WellbeingLog } from './wellbeing';

export const LOG_ENTRY_KINDS = ['meal', 'symptom', 'bowel', 'wellbeing', 'context'] as const;
export type LogEntryKind = (typeof LOG_ENTRY_KINDS)[number];

/** How each kind is named to the user. Named in text, never carried by colour alone (§36). */
export const LOG_ENTRY_KIND_LABELS: Record<LogEntryKind, string> = {
  meal: 'Meal',
  symptom: 'Symptom',
  bowel: 'Bowel movement',
  wellbeing: 'Feeling good',
  context: 'Context',
};

/** The filter chips above the timeline, in display order. */
export const TIMELINE_FILTERS = [
  { key: 'all', label: 'All', kind: null },
  { key: 'meal', label: 'Meals', kind: 'meal' },
  { key: 'symptom', label: 'Symptoms', kind: 'symptom' },
  { key: 'bowel', label: 'Bowel', kind: 'bowel' },
  { key: 'wellbeing', label: 'Wellbeing', kind: 'wellbeing' },
  { key: 'context', label: 'Context', kind: 'context' },
] as const satisfies readonly { key: string; label: string; kind: LogEntryKind | null }[];

export type TimelineFilterKey = (typeof TIMELINE_FILTERS)[number]['key'];

export type LogEntry = {
  kind: LogEntryKind;
  id: string;
  kindLabel: string;
  occurredAt: string;
  occurredLocalDate: string;
  occurredTz: string;
  /** True while the server has not yet confirmed this entry. */
  syncPending: boolean;
  title: string;
  /** A second line describing the entry. Null when the title says everything. */
  detail: string | null;
  note: string | null;
  tags: string[];
};

function base(
  kind: LogEntryKind,
  log: {
    id: string;
    occurredAt: string;
    occurredLocalDate: string;
    occurredTz: string;
    note: string | null;
  },
  syncPending: boolean
) {
  return {
    kind,
    id: log.id,
    kindLabel: LOG_ENTRY_KIND_LABELS[kind],
    occurredAt: log.occurredAt,
    occurredLocalDate: log.occurredLocalDate,
    occurredTz: log.occurredTz,
    syncPending,
    note: log.note,
  };
}

export function mealEntry(meal: Meal, syncPending: boolean): LogEntry {
  return {
    ...base('meal', meal, syncPending),
    title: meal.title,
    detail: mealSummary(meal),
    tags: meal.tags.map(mealTagLabel),
  };
}

export function symptomEntry(log: SymptomLog, syncPending: boolean): LogEntry {
  return {
    ...base('symptom', log, syncPending),
    title: symptomLabel(log.symptomType),
    detail: `${severityLabel(log.severity)} · ${log.severity}/10`,
    tags: [],
  };
}

export function bowelEntry(log: BowelLog, syncPending: boolean): LogEntry {
  return {
    ...base('bowel', log, syncPending),
    title: bowelSummary(log),
    detail: `Urgency: ${urgencyLabel(log.urgency)}`,
    tags: log.incomplete ? ['Felt unfinished'] : [],
  };
}

export function wellbeingEntry(log: WellbeingLog, syncPending: boolean): LogEntry {
  return {
    ...base('wellbeing', log, syncPending),
    title: 'A good moment',
    // No metric, and deliberately none. This entry earns its place by being a comparison
    // point, not by being detailed (spec §44).
    detail: null,
    tags: [],
  };
}

export function contextEntry(log: ContextLog, syncPending: boolean): LogEntry {
  return {
    ...base('context', log, syncPending),
    title: contextSummary(log),
    detail: null,
    tags: [],
  };
}

/** Where tapping an entry goes to edit it. */
export function editRouteFor(entry: Pick<LogEntry, 'kind' | 'id'>): string {
  const screen = entry.kind === 'wellbeing' ? 'wellbeing' : entry.kind;
  return `/log/${screen}?id=${entry.id}`;
}

/**
 * Groups entries into day sections, newest day first.
 *
 * Grouping reads `occurredLocalDate`, which was computed in the user's zone at the moment of
 * logging. Deriving the day here from the instant would silently regroup a year of history the
 * first time someone travels (risk R-02).
 */
export function groupByLocalDate(
  entries: LogEntry[]
): { localDate: string; entries: LogEntry[] }[] {
  const byDate = new Map<string, LogEntry[]>();

  for (const entry of entries) {
    const bucket = byDate.get(entry.occurredLocalDate) ?? [];
    bucket.push(entry);
    byDate.set(entry.occurredLocalDate, bucket);
  }

  return [...byDate.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([localDate, dayEntries]) => ({ localDate, entries: dayEntries }));
}
