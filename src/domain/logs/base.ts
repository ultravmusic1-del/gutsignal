/**
 * The fields every single-row event log carries (docs/PROJECT_PLAN.md §4.1).
 *
 * Kept in one place so the shape cannot drift between log types — the pattern engine reads all
 * of them the same way, and a table that named its columns differently would need a special
 * case in the one module that must not have any.
 */

import type { LogSource } from './source';

export type BaseLog = {
  id: string;
  userId: string;
  note: string | null;
  source: LogSource;
  /** The instant, UTC. Gives ordering. */
  occurredAt: string;
  /** The user's calendar day at that instant. Gives day grouping — never the UTC date. */
  occurredLocalDate: string;
  occurredTz: string;
  occurredUtcOffsetMinutes: number;
  /** Tombstone, so a deletion replicates instead of looking like a row that never arrived. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
