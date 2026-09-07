/**
 * Events that happen once per user and must not be reported twice.
 *
 * `insights_viewed` fires every time the screen is opened, which is right for a screen view and
 * useless for a funnel: "how many users ever reached a populated Insights screen" cannot be
 * recovered from it. A milestone is the other shape — the first crossing, recorded so the next
 * launch does not report it again.
 *
 * Local, and deliberately outside the outbox. This records that an event was *sent*, which is a
 * property of this install rather than of the account; syncing it would let a second device
 * suppress a milestone it never reported.
 *
 * Nothing here holds health information. A milestone key is a fixed string from the app's own
 * vocabulary, and the timestamp is when the app noticed rather than anything about the person
 * (`CLAUDE.md` §29).
 */

import type { SqlDatabase } from '@/services/db/sqlite';

/** Every milestone the app records. Fixed, for the same reason analytics event names are. */
export const USER_MILESTONES = ['first_insight_available'] as const;

export type UserMilestone = (typeof USER_MILESTONES)[number];

export async function hasReachedMilestone(
  db: SqlDatabase,
  userId: string,
  milestone: UserMilestone
): Promise<boolean> {
  const row = await db.getFirstAsync<{ milestone: string }>(
    'SELECT milestone FROM user_milestones WHERE user_id = ? AND milestone = ?',
    userId,
    milestone
  );

  return row !== null;
}

/**
 * Records a milestone, and answers whether this call was the one that recorded it.
 *
 * The return value is the point. Two callers racing — a screen mounting twice, a re-render
 * during a slow read — must not both report the event, and `INSERT ... ON CONFLICT DO NOTHING`
 * makes the database rather than the caller the thing that decides which one won.
 */
export async function recordMilestone(
  db: SqlDatabase,
  userId: string,
  milestone: UserMilestone,
  now: Date
): Promise<boolean> {
  const result = await db.runAsync(
    `INSERT INTO user_milestones (user_id, milestone, reached_at)
     VALUES (?, ?, ?)
     ON CONFLICT (user_id, milestone) DO NOTHING`,
    userId,
    milestone,
    now.toISOString()
  );

  return result.changes > 0;
}
