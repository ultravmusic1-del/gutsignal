/**
 * Query options for reads that never leave the device.
 *
 * The client defaults in `client.ts` are written for *server* state (`CLAUDE.md` §10): stale for a
 * minute, retried twice, refetched on reconnect. Every one of those is right for a Supabase call
 * over a phone connection and wrong for a `SELECT` against local SQLite, which is most of what
 * this app reads.
 *
 * - **`retry: false`.** A local read does not fail transiently. If SQLite refuses, the database is
 *   locked, corrupt or unopenable, and none of those is fixed by asking again — so two retries
 *   with backoff only delay the error state by seconds while the user looks at a blank card. That
 *   is the same failure the boot screen was showing before ADR-0046, and the same seconds.
 * - **`refetchOnReconnect: false`.** Nothing about a local table changes because the network came
 *   back. The sync engine invalidates explicitly when it actually writes something.
 * - **`staleTime: 0`.** A read from local storage costs a millisecond, and the alternative is a
 *   diary that shows the user something other than what they just saved.
 *
 * `staleTime` is overridden by the two queries that run the pattern engine, which is the one local
 * read expensive enough to be worth caching.
 */
export const LOCAL_QUERY_OPTIONS = {
  staleTime: 0,
  retry: false,
  refetchOnReconnect: false,
} as const;
