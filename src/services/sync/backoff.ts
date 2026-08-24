/**
 * Retry pacing for the sync outbox (docs/PROJECT_PLAN.md §6).
 *
 * A failed sync must never block the UI and must never spin: it backs off exponentially and
 * surfaces as a quiet badge. Pure arithmetic, so the schedule is testable without timers.
 */

/** First retry waits this long. */
export const BASE_DELAY_MS = 2_000;

/** Ceiling, so a long outage still retries promptly once connectivity returns. */
export const MAX_DELAY_MS = 300_000;

/**
 * Delay before retry number `attemptCount` (1-based).
 *
 * Jitter of ±20% keeps a fleet of devices coming back from the same outage from retrying in
 * lockstep. `random` is injected so the schedule can be asserted exactly.
 */
export function retryDelayMs(attemptCount: number, random: () => number = Math.random): number {
  const attempt = Math.max(1, Math.floor(attemptCount));
  const exponential = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
  const jitter = 0.8 + random() * 0.4;

  return Math.round(exponential * jitter);
}

/** ISO instant at which a row that has failed `attemptCount` times may be retried. */
export function nextAttemptAt(
  now: Date,
  attemptCount: number,
  random: () => number = Math.random
): string {
  return new Date(now.getTime() + retryDelayMs(attemptCount, random)).toISOString();
}

/**
 * Whether a row scheduled for `scheduledFor` may be attempted at `now`.
 *
 * An unparseable or missing schedule counts as due. Stranding a user's unsynced log forever
 * because a timestamp got corrupted would be the one failure mode this system exists to
 * prevent.
 */
export function isDue(scheduledFor: string | null, now: Date): boolean {
  if (scheduledFor === null) return true;

  const due = Date.parse(scheduledFor);
  if (Number.isNaN(due)) return true;

  return due <= now.getTime();
}
