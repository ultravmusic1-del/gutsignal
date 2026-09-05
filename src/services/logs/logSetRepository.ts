/**
 * Reading a diary for the pattern engine.
 *
 * The engine is pure: it takes a `LogSet` and returns findings, and knows nothing about storage.
 * This is the one place that turns local SQLite into that input.
 *
 * **It reads from the device, not the server.** Findings are recomputed from local logs rather
 * than fetched, which means insights work with no connection and are always consistent with what
 * the user can actually see in their own timeline. A finding cached from a server that has not
 * yet received last night's entries would be quietly, confusingly stale.
 */

import { listBowelLogsBetween } from './bowelRepository';
import { listContextLogsBetween } from './contextRepository';
import { listMealsBetween } from './mealRepository';
import { listSymptomLogsBetween } from './symptomRepository';
import { listWellbeingLogsBetween } from './wellbeingRepository';
import type { DateRange, LogSet } from '@/domain/pattern-engine/observations';
import type { SqlDatabase } from '@/services/db/sqlite';

/**
 * Everything logged in a local-date range, ready to analyse.
 *
 * The five reads run together rather than in sequence: they are independent, and a user opening
 * Insights should not wait for five round trips to a local database one after another.
 */
export async function loadLogSet(
  db: SqlDatabase,
  { userId, range }: { userId: string; range: DateRange }
): Promise<LogSet> {
  const bounds = { userId, start: range.start, end: range.end };

  const [meals, symptoms, bowel, wellbeing, context] = await Promise.all([
    listMealsBetween(db, bounds),
    listSymptomLogsBetween(db, bounds),
    listBowelLogsBetween(db, bounds),
    listWellbeingLogsBetween(db, bounds),
    listContextLogsBetween(db, bounds),
  ]);

  return { meals, symptoms, bowel, wellbeing, context };
}

/** How many days of history the engine looks at by default. */
export const DEFAULT_ANALYSIS_DAYS = 90;

/**
 * The range ending today that the engine analyses by default.
 *
 * Ninety days is long enough for weekly consistency to mean something and short enough that a
 * diet change six months ago does not drown out how someone is eating now.
 */
export function defaultAnalysisRange(
  today: string,
  days: number = DEFAULT_ANALYSIS_DAYS
): DateRange {
  const end = Date.parse(`${today}T00:00:00Z`);

  if (Number.isNaN(end)) return { start: today, end: today };

  const start = new Date(end - (days - 1) * 86_400_000).toISOString().slice(0, 10);

  return { start, end: today };
}
