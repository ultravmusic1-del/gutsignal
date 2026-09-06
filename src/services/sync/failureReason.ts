/**
 * Turning a sync failure into one of four words (`CLAUDE.md` §29, §30).
 *
 * The analytics allowlist gives `sync_failed` a fixed `reason` vocabulary rather than a message,
 * and that constraint is doing real work here. A Supabase error message can contain a row id, a
 * column name, a constraint name, or the text the user typed — sending it to a vendor would put
 * health content in a product-analytics database, which §58 calls a release blocker. Four words
 * cannot carry any of that.
 *
 * The classification is deliberately coarse. It answers "is the offline layer broken, is the
 * session broken, or is this a data problem?" — enough to act on, and nothing more. The precise
 * message still goes into `sync_queue.last_error` on the device, where a developer can read it and
 * a vendor cannot.
 */

import type { AnalyticsProperties } from '@/services/analytics/events';

export type SyncFailureReason = AnalyticsProperties<'sync_failed'>['reason'];

/**
 * Which reason wins when a run failed for several.
 *
 * Not the first failure seen, and not the most frequent. If anything in a run failed on auth, that
 * is the story — fifty rows failing behind one expired session is one problem, and reporting it as
 * "conflict" because a conflict happened to sort first would send someone after the wrong thing.
 * Order is by how specifically actionable the cause is.
 */
const PRIORITY: SyncFailureReason[] = ['auth', 'conflict', 'network', 'unknown'];

/** Postgres SQLSTATE codes that arrive through PostgREST with a meaning worth separating. */
const AUTH_CODES = new Set([
  '42501', // insufficient_privilege — an RLS policy refused the write
  'PGRST301', // JWT expired
]);

const CONFLICT_CODES = new Set([
  '23505', // unique_violation
  '23503', // foreign_key_violation
  '23514', // check_violation
]);

type Errorish = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
};

/**
 * One failure, classified.
 *
 * Reads the structured fields first and the message only as a fallback: a status code means the
 * same thing in every locale, while message text is a moving target across library versions.
 */
export function classifySyncFailure(error: unknown): SyncFailureReason {
  if (error === null || error === undefined) return 'unknown';

  const { message, code, status, name } = (error ?? {}) as Errorish;

  const codeText = typeof code === 'string' ? code : '';
  const statusCode = typeof status === 'number' ? status : undefined;

  if (AUTH_CODES.has(codeText) || statusCode === 401 || statusCode === 403) return 'auth';
  if (CONFLICT_CODES.has(codeText) || statusCode === 409) return 'conflict';

  // A fetch that never reached a server has no status at all. `AbortError` is included because a
  // request abandoned on a dying connection is a network problem from the user's side, whatever
  // it looks like from the runtime's.
  if (name === 'AbortError' || name === 'TypeError') return 'network';

  const text = typeof message === 'string' ? message.toLowerCase() : '';
  if (text.length === 0) return 'unknown';

  if (text.includes('jwt') || text.includes('unauthor') || text.includes('row-level security')) {
    return 'auth';
  }
  if (text.includes('duplicate key') || text.includes('violates')) return 'conflict';
  if (
    text.includes('network') ||
    text.includes('fetch failed') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('econnreset') ||
    text.includes('offline')
  ) {
    return 'network';
  }

  return 'unknown';
}

/**
 * The one reason to report for a run that produced several.
 *
 * Null for a run that failed at nothing, so a caller cannot accidentally report a success.
 */
export function dominantFailureReason(reasons: SyncFailureReason[]): SyncFailureReason | null {
  if (reasons.length === 0) return null;

  const seen = new Set(reasons);
  return PRIORITY.find((reason) => seen.has(reason)) ?? 'unknown';
}
