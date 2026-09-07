/**
 * Recognising an entry the user probably did not mean to make twice.
 *
 * ## Why this matters more than tidiness
 *
 * The pattern engine counts *days*, not entries, so a duplicate does not directly inflate an
 * exposure count. What it does is quieter: it fills the timeline with entries the user did not
 * make, puts a second row in the outbox to upload, and — for a day-level state like "feeling
 * good" — makes the diary claim something twice that can only be true once.
 *
 * ## What this must never do
 *
 * **Never drop an entry.** §15 is unconditional: an unsynchronised record is never silently
 * discarded, and "it looked like a duplicate" is not an exception. Everything here *detects*; the
 * decision to save anyway belongs to the user, and the caller asks them.
 *
 * A double-tap and a genuine repeat are indistinguishable from the data alone — people do eat the
 * same thing twice, and a symptom can return within the hour. So the window is short and the
 * question is asked rather than assumed.
 */

/** How close together two identical entries have to be to look like one tap counted twice. */
export const DUPLICATE_WINDOW_MINUTES = 5;

const MS_PER_MINUTE = 60_000;

export type DuplicateCandidate = {
  /** ISO instant. */
  occurredAt: string;
  /** What makes two entries "the same" for this kind — built by the caller. */
  signature: string;
};

/**
 * The most recent entry that looks like the same thing recorded again, or null.
 *
 * Compares by instant rather than by creation time: an entry backdated to this morning is not a
 * duplicate of one logged this morning, even though both were typed a minute apart.
 */
export function findNearDuplicate(
  existing: DuplicateCandidate[],
  candidate: DuplicateCandidate,
  windowMinutes: number = DUPLICATE_WINDOW_MINUTES
): DuplicateCandidate | null {
  const at = Date.parse(candidate.occurredAt);
  if (Number.isNaN(at)) return null;

  const window = windowMinutes * MS_PER_MINUTE;

  const matches = existing
    .filter((entry) => entry.signature === candidate.signature)
    .filter((entry) => {
      const other = Date.parse(entry.occurredAt);
      return !Number.isNaN(other) && Math.abs(other - at) <= window;
    })
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  return matches[0] ?? null;
}

/**
 * Whether a good day is already on record for this date.
 *
 * A separate question from the one above, because "feeling good" is a statement about a *day*
 * rather than a moment. Two of them five minutes apart is a double tap; two of them nine hours
 * apart is still only one good day, so the window does not apply and the local date does.
 */
export function hasGoodDayFor(recordedDates: string[], localDate: string): boolean {
  return recordedDates.includes(localDate);
}
