/**
 * The timeline query (spec §48).
 *
 * One chronological diary drawn from five separate tables. The ordering and paging happen in a
 * single `UNION ALL` that reads only the columns needed to place an entry — kind, id, when, and
 * whether it is still queued. The page's detail is then filled in with at most one query per
 * kind, so a page of fifty entries costs six queries rather than fifty.
 *
 * **Keyset pagination, not OFFSET.** Paging by `(occurred_at, id)` keeps every page the same
 * cost, while `OFFSET 5000` makes SQLite walk and discard five thousand rows first. That
 * difference is the milestone's acceptance criterion — a diary is append-mostly and the oldest
 * pages are exactly the ones a long-time user scrolls to.
 *
 * The `id` tiebreaker matters: two entries can share a timestamp to the millisecond, and an
 * unstable sort would let one repeat on the next page while another vanished.
 */

import {
  bowelEntry,
  contextEntry,
  mealEntry,
  symptomEntry,
  wellbeingEntry,
  type LogEntry,
  type LogEntryKind,
} from '@/domain/logs/entry';
import type { SqlBindValue, SqlDatabase } from '@/services/db/sqlite';

import { listBowelLogsByIds } from './bowelRepository';
import { listContextLogsByIds } from './contextRepository';
import { listMealsByIds } from './mealRepository';
import { listSymptomLogsByIds } from './symptomRepository';
import { listWellbeingLogsByIds } from './wellbeingRepository';

/** Entries per page. Large enough that scrolling rarely waits, small enough to stay cheap. */
export const TIMELINE_PAGE_SIZE = 40;

export type TimelineCursor = {
  occurredAt: string;
  id: string;
};

export type TimelineQuery = {
  userId: string;
  /** Null shows every kind. */
  kind?: LogEntryKind | null;
  /** Free text across titles, notes and meal items. Blank searches nothing. */
  search?: string;
  cursor?: TimelineCursor | null;
  limit?: number;
};

export type TimelinePage = {
  entries: LogEntry[];
  /** Pass back to fetch the next page. Null when the end has been reached. */
  nextCursor: TimelineCursor | null;
};

type PlacementRow = {
  kind: LogEntryKind;
  id: string;
  occurred_at: string;
  sync_pending: number;
};

type Source = {
  kind: LogEntryKind;
  table: string;
  /**
   * Where a search term may match for this kind, and how many times the term is bound.
   * Meals reach into their items, which is where the food a user actually remembers lives.
   */
  search: { sql: string; bindings: number };
};

const SOURCES: Source[] = [
  {
    kind: 'meal',
    table: 'meal_logs',
    search: {
      sql: `(t.title LIKE ? OR t.note LIKE ?
             OR EXISTS (SELECT 1 FROM meal_items mi
                         WHERE mi.meal_id = t.id AND mi.raw_name LIKE ?))`,
      bindings: 3,
    },
  },
  {
    kind: 'symptom',
    table: 'symptom_logs',
    search: { sql: '(t.note LIKE ? OR t.symptom_type LIKE ?)', bindings: 2 },
  },
  {
    kind: 'bowel',
    table: 'bowel_logs',
    search: { sql: '(t.note LIKE ?)', bindings: 1 },
  },
  {
    kind: 'wellbeing',
    table: 'wellbeing_logs',
    search: { sql: '(t.note LIKE ?)', bindings: 1 },
  },
  {
    kind: 'context',
    table: 'context_logs',
    search: { sql: '(t.note LIKE ? OR t.context_type LIKE ?)', bindings: 2 },
  },
];

/** Builds one arm of the union, plus the parameters it binds, in order. */
function buildArm(
  source: Source,
  { userId, cursor, term }: { userId: string; cursor: TimelineCursor | null; term: string | null }
): { sql: string; params: SqlBindValue[] } {
  const params: SqlBindValue[] = [];
  const conditions = ['t.user_id = ?', 't.deleted_at IS NULL'];

  // The table name is bound rather than interpolated into the join condition, so the outbox
  // lookup is a parameter like any other.
  params.push(source.table, userId);

  if (cursor !== null) {
    conditions.push('(t.occurred_at < ? OR (t.occurred_at = ? AND t.id < ?))');
    params.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
  }

  if (term !== null) {
    conditions.push(source.search.sql);
    for (let i = 0; i < source.search.bindings; i += 1) params.push(term);
  }

  const sql = `
    SELECT '${source.kind}' AS kind,
           t.id                  AS id,
           t.occurred_at         AS occurred_at,
           (q.id IS NOT NULL)    AS sync_pending
      FROM ${source.table} t
      LEFT JOIN sync_queue q ON q.table_name = ? AND q.record_id = t.id
     WHERE ${conditions.join(' AND ')}`;

  return { sql, params };
}

/**
 * Finds which entries belong on this page.
 *
 * Each arm is limited as well as the union: without that, a search matching ten thousand meals
 * would sort ten thousand rows to return forty.
 */
async function fetchPlacements(
  db: SqlDatabase,
  query: TimelineQuery,
  limit: number
): Promise<PlacementRow[]> {
  const term = query.search?.trim() ? `%${query.search.trim()}%` : null;
  const cursor = query.cursor ?? null;

  const sources =
    query.kind == null ? SOURCES : SOURCES.filter((source) => source.kind === query.kind);

  const arms = sources.map((source) => buildArm(source, { userId: query.userId, cursor, term }));

  const unionSql = arms
    .map((arm) => `SELECT * FROM (${arm.sql} ORDER BY occurred_at DESC, id DESC LIMIT ?)`)
    .join('\n    UNION ALL\n    ');

  const params: SqlBindValue[] = [];
  for (const arm of arms) {
    params.push(...arm.params, limit);
  }
  params.push(limit);

  return db.getAllAsync<PlacementRow>(
    `SELECT kind, id, occurred_at, sync_pending
       FROM (
    ${unionSql}
       )
      ORDER BY occurred_at DESC, id DESC
      LIMIT ?`,
    ...params
  );
}

/** Fills in the detail for a page, one query per kind present. */
async function hydrate(
  db: SqlDatabase,
  placements: PlacementRow[]
): Promise<Map<string, LogEntry>> {
  const idsByKind = new Map<LogEntryKind, string[]>();
  for (const placement of placements) {
    const ids = idsByKind.get(placement.kind) ?? [];
    ids.push(placement.id);
    idsByKind.set(placement.kind, ids);
  }

  const pending = new Set(
    placements.filter((placement) => placement.sync_pending === 1).map((p) => `${p.kind}:${p.id}`)
  );
  const isPending = (kind: LogEntryKind, id: string) => pending.has(`${kind}:${id}`);

  const entries = new Map<string, LogEntry>();
  const add = (entry: LogEntry) => entries.set(`${entry.kind}:${entry.id}`, entry);

  const [meals, symptoms, bowel, wellbeing, context] = await Promise.all([
    listMealsByIds(db, idsByKind.get('meal') ?? []),
    listSymptomLogsByIds(db, idsByKind.get('symptom') ?? []),
    listBowelLogsByIds(db, idsByKind.get('bowel') ?? []),
    listWellbeingLogsByIds(db, idsByKind.get('wellbeing') ?? []),
    listContextLogsByIds(db, idsByKind.get('context') ?? []),
  ]);

  for (const meal of meals) add(mealEntry(meal, isPending('meal', meal.id)));
  for (const log of symptoms) add(symptomEntry(log, isPending('symptom', log.id)));
  for (const log of bowel) add(bowelEntry(log, isPending('bowel', log.id)));
  for (const log of wellbeing) add(wellbeingEntry(log, isPending('wellbeing', log.id)));
  for (const log of context) add(contextEntry(log, isPending('context', log.id)));

  return entries;
}

/** One page of the timeline, newest first. */
export async function fetchTimelinePage(
  db: SqlDatabase,
  query: TimelineQuery
): Promise<TimelinePage> {
  const limit = query.limit ?? TIMELINE_PAGE_SIZE;

  // One extra row tells us whether another page exists without a second count query.
  const placements = await fetchPlacements(db, query, limit + 1);
  const hasMore = placements.length > limit;
  const pageRows = hasMore ? placements.slice(0, limit) : placements;

  const hydrated = await hydrate(db, pageRows);

  // Ordered by the placement query, not by the hydration, which returns rows per kind.
  const entries = pageRows.flatMap((placement) => {
    const entry = hydrated.get(`${placement.kind}:${placement.id}`);
    return entry === undefined ? [] : [entry];
  });

  const last = pageRows.at(-1);

  return {
    entries,
    nextCursor:
      hasMore && last !== undefined ? { occurredAt: last.occurred_at, id: last.id } : null,
  };
}

/** How many entries the diary holds, for the empty-versus-filtered distinction. */
export async function countTimelineEntries(db: SqlDatabase, userId: string): Promise<number> {
  const counts = await Promise.all(
    SOURCES.map(async (source) => {
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${source.table} WHERE user_id = ? AND deleted_at IS NULL`,
        userId
      );
      return row?.count ?? 0;
    })
  );

  return counts.reduce((total, count) => total + count, 0);
}
