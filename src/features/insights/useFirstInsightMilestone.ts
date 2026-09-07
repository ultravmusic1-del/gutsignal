import { useEffect, useRef } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { track } from '@/services/analytics/analytics';
import { hasReachedMilestone, recordMilestone } from '@/services/analytics/milestones';
import { openDatabase } from '@/services/db/database';

/**
 * Reports the first time a diary has something to show — once, ever, per user.
 *
 * `insights_viewed` already fires on every visit, which is right for a screen view and useless for
 * the question §33 actually poses: how many people get far enough for an insight to exist, and
 * therefore far enough for a paywall to be anything other than a wall. That needs the *crossing*,
 * not the visits.
 *
 * The milestone is written before the event is sent, and the write is what decides. A ref alone
 * would survive one mount and not a relaunch; the database survives both, and its
 * `ON CONFLICT DO NOTHING` settles a race between two mounts without the caller reasoning about
 * it. The ref is only here to avoid a pointless read on every render.
 *
 * Silent on failure. This is measurement — it may not cost the user a screen (§54).
 */
export function useFirstInsightMilestone(ready: boolean): void {
  const { userId } = useAuth();
  const attempted = useRef(false);

  useEffect(() => {
    if (!ready || !userId || attempted.current) return;

    attempted.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const db = await openDatabase();
        if (await hasReachedMilestone(db, userId, 'first_insight_available')) return;

        const recorded = await recordMilestone(db, userId, 'first_insight_available', new Date());

        // Only the caller that actually wrote the row reports it.
        if (recorded && !cancelled) track('first_insight_available');
      } catch {
        // Deliberately silent, and deliberately not retried: a milestone missed because storage
        // was busy is a gap in a funnel, not a problem for the person using the app.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, userId]);
}
