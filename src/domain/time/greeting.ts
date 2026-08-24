/**
 * Time-of-day greeting.
 *
 * Pure and hour-driven rather than reading the clock itself, because everything in
 * src/domain must be deterministic and testable — the same rule that keeps the pattern
 * engine reproducible. The caller supplies the user's LOCAL hour; "morning" is a local-day
 * concept, never a UTC one (spec §102).
 */
export function greetingForHour(hour: number): string {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return 'Hello';
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
