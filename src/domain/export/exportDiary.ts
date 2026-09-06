/**
 * The user's diary, in a form they can keep (spec §98, `CLAUDE.md` §28, §53).
 *
 * Export is not a feature that earns its keep in a demo. It is the promise that a person's record
 * of their own health is theirs — that they can take it to a clinician, move to another app, or
 * keep it after deleting the account. §53 lists it among the things that must not be simplified
 * away, and §28 requires it outright.
 *
 * Two formats, for two different readers:
 *
 * - **JSON is lossless.** Every field, including the ones the UI never shows: source, timezone,
 *   offset, created and updated timestamps. Someone rebuilding their history elsewhere needs all of
 *   it, and a "helpfully" trimmed export is one that has to be redone.
 * - **CSV is per log type**, because a diary is five differently-shaped things. One flat file would
 *   be mostly empty columns, and a spreadsheet full of blanks is not analysable.
 *
 * **Timestamps appear twice, always** (§98 asks for meaningful human-readable ones). The instant is
 * the machine-readable truth; the local date and time are what the person actually experienced.
 * Keeping both is a §16 requirement — a day boundary cannot be reconstructed from UTC alone, and an
 * export that dropped the offset would silently move entries near midnight.
 *
 * Pure. No filesystem, no sharing, no `Date.now()` — the caller supplies the moment, so an export
 * is reproducible and testable.
 */

import type { LogSet } from '@/domain/pattern-engine/observations';
import { formatLocalTime } from '@/domain/time/occurrence';

import { csvFile } from './csv';

/**
 * The export format's own version.
 *
 * Bumped when the shape changes, so a file can be read years later by something that knows which
 * shape it is looking at. Independent of the app version, which moves for unrelated reasons.
 */
export const EXPORT_FORMAT_VERSION = 1;

export type ExportMeta = {
  /** When the export was made. Supplied rather than read, so this module stays pure. */
  generatedAt: Date;
  /** The account the diary belongs to. */
  userId: string;
  /** The app build, for support. */
  appVersion: string;
};

/** A file the caller will write or share. */
export type ExportFile = {
  name: string;
  /** Text content, ready to write as UTF-8. */
  content: string;
};

/**
 * Both readings of when something happened.
 *
 * `at` is the instant, unambiguous anywhere. `localDate`, `localTime` and the offset are what the
 * person's own clock said, which is the reading that matters for "was this before bed?" and the
 * only one from which a day boundary can be rebuilt.
 */
function occurrence(log: {
  occurredAt: string;
  occurredLocalDate: string;
  occurredTz: string;
  occurredUtcOffsetMinutes: number;
}) {
  return {
    at: log.occurredAt,
    localDate: log.occurredLocalDate,
    localTime: formatLocalTime(log.occurredAt, log.occurredTz),
    timeZone: log.occurredTz,
    utcOffsetMinutes: log.occurredUtcOffsetMinutes,
  };
}

/** Tombstones are how a deletion replicates; they are not part of anyone's diary. */
const alive = <T extends { deletedAt: string | null }>(logs: T[]): T[] =>
  logs.filter((log) => log.deletedAt === null);

/** Oldest first, and stable: an export run twice on the same diary is byte-identical. */
const chronological = <T extends { occurredAt: string; id: string }>(logs: T[]): T[] =>
  [...logs].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));

export function buildJsonExport(logs: LogSet, meta: ExportMeta): string {
  const document = {
    format: 'gutsignal-export',
    formatVersion: EXPORT_FORMAT_VERSION,
    generatedAt: meta.generatedAt.toISOString(),
    appVersion: meta.appVersion,
    userId: meta.userId,

    // A reader should not have to infer what this file does or does not contain.
    about:
      'Your GutSignal diary. Times appear twice: "at" is the exact moment, and "localDate" and ' +
      '"localTime" are what your own clock said. Deleted entries are not included. Patterns and ' +
      'insights are not included because they are worked out from these entries rather than ' +
      'stored — the same logs will produce them again.',

    meals: chronological(alive(logs.meals)).map((meal) => ({
      id: meal.id,
      occurred: occurrence(meal),
      title: meal.title,
      size: meal.mealSize,
      items: meal.items.map((item) => item.rawName),
      tags: meal.tags,
      note: meal.note,
      source: meal.source,
      createdAt: meal.createdAt,
      updatedAt: meal.updatedAt,
    })),

    symptoms: chronological(alive(logs.symptoms)).map((symptom) => ({
      id: symptom.id,
      occurred: occurrence(symptom),
      symptom: symptom.symptomType,
      severity: symptom.severity,
      note: symptom.note,
      source: symptom.source,
      createdAt: symptom.createdAt,
      updatedAt: symptom.updatedAt,
    })),

    bowelMovements: chronological(alive(logs.bowel)).map((bowel) => ({
      id: bowel.id,
      occurred: occurrence(bowel),
      bristolType: bowel.bristolType,
      urgency: bowel.urgency,
      difficulty: bowel.difficulty,
      incomplete: bowel.incomplete,
      note: bowel.note,
      source: bowel.source,
      createdAt: bowel.createdAt,
      updatedAt: bowel.updatedAt,
    })),

    goodDays: chronological(alive(logs.wellbeing)).map((entry) => ({
      id: entry.id,
      occurred: occurrence(entry),
      note: entry.note,
      source: entry.source,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })),

    context: chronological(alive(logs.context)).map((entry) => ({
      id: entry.id,
      occurred: occurrence(entry),
      type: entry.contextType,
      value: entry.valueNumeric ?? entry.valueText,
      note: entry.note,
      source: entry.source,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })),
  };

  return JSON.stringify(document, null, 2);
}

/** Columns every log type shares, so the five files read alike. */
const WHEN_HEADERS = ['date', 'time', 'time_zone', 'recorded_at_utc'];

const whenCells = (log: Parameters<typeof occurrence>[0]) => {
  const when = occurrence(log);
  return [when.localDate, when.localTime, when.timeZone, when.at];
};

/**
 * One CSV per log type.
 *
 * Named so they sort together in a folder and say what they are without being opened. Empty types
 * still produce a file with its header: a missing file reads as "the export failed", while an empty
 * one reads as "you have not logged any of these", and only the second is true.
 */
export function buildCsvExports(logs: LogSet): ExportFile[] {
  return [
    {
      name: 'gutsignal-meals.csv',
      content: csvFile(
        [...WHEN_HEADERS, 'title', 'size', 'items', 'tags', 'note'],
        chronological(alive(logs.meals)).map((meal) => [
          ...whenCells(meal),
          meal.title,
          meal.mealSize,
          meal.items.map((item) => item.rawName).join('; '),
          meal.tags.join('; '),
          meal.note,
        ])
      ),
    },
    {
      name: 'gutsignal-symptoms.csv',
      content: csvFile(
        [...WHEN_HEADERS, 'symptom', 'severity_1_to_10', 'note'],
        chronological(alive(logs.symptoms)).map((symptom) => [
          ...whenCells(symptom),
          symptom.symptomType,
          symptom.severity,
          symptom.note,
        ])
      ),
    },
    {
      name: 'gutsignal-bowel-movements.csv',
      content: csvFile(
        [...WHEN_HEADERS, 'bristol_type_1_to_7', 'urgency', 'difficulty', 'incomplete', 'note'],
        chronological(alive(logs.bowel)).map((bowel) => [
          ...whenCells(bowel),
          bowel.bristolType,
          bowel.urgency,
          bowel.difficulty,
          bowel.incomplete,
          bowel.note,
        ])
      ),
    },
    {
      name: 'gutsignal-good-days.csv',
      content: csvFile(
        [...WHEN_HEADERS, 'note'],
        chronological(alive(logs.wellbeing)).map((entry) => [...whenCells(entry), entry.note])
      ),
    },
    {
      name: 'gutsignal-context.csv',
      content: csvFile(
        [...WHEN_HEADERS, 'type', 'value', 'note'],
        chronological(alive(logs.context)).map((entry) => [
          ...whenCells(entry),
          entry.contextType,
          entry.valueNumeric ?? entry.valueText,
          entry.note,
        ])
      ),
    },
  ];
}

/** Everything, as files ready to write. */
export function buildDiaryExport(logs: LogSet, meta: ExportMeta): ExportFile[] {
  return [
    { name: 'gutsignal-diary.json', content: buildJsonExport(logs, meta) },
    ...buildCsvExports(logs),
  ];
}
