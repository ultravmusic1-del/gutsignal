/**
 * What GutSignal is allowed to interrupt someone for (spec §74–75).
 *
 * ## What this milestone ships, and what it does not
 *
 * The spec lists five toggles: morning check-in, evening check-in, experiment reminders, weekly
 * review, and product updates. Three ship here. The other two are deliberately absent rather than
 * present and inert:
 *
 * - **Experiment reminders** need experiments, which are Milestone 11. A switch labelled "Day 4 of
 *   your coffee experiment" with no experiments behind it is a placeholder control, which `CLAUDE.md`
 *   §57 rules out.
 * - **Product updates** are a push channel. Nothing in GutSignal can send a remote notification —
 *   there is no server that does it and no push credential — so the switch would be a promise the
 *   app cannot keep.
 *
 * Both belong in this vocabulary the day the thing behind them exists, and adding one is a line
 * here plus a row in the settings screen.
 *
 * ## Why the tracking style only sets defaults
 *
 * §74 says to adapt reminders to the tracking preference, and there are two ways to read that. The
 * app could quietly send fewer reminders to a minimal tracker regardless of their switches, or it
 * could start them with fewer switches on. The second is the only one compatible with §75's
 * promise that the user controls every reminder: a toggle that is on and does nothing is worse
 * than no toggle. So the style picks the starting point and the preferences are then obeyed
 * literally.
 */

import type { TrackingStyleKey } from '@/domain/onboarding/options';

export const REMINDER_KINDS = ['morning_check_in', 'evening_check_in', 'weekly_review'] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** A wall-clock time in the user's own timezone. Reminders are local-day things, never UTC. */
export type TimeOfDay = {
  hour: number;
  minute: number;
};

/**
 * A window in which nothing is delivered.
 *
 * `from` and `until` are wall-clock times and the window may wrap midnight — 22:00 until 07:00 is
 * the ordinary case, not the exotic one, which is why the comparison in `isWithinQuietHours` is
 * written the way it is.
 */
export type QuietHours = {
  enabled: boolean;
  from: TimeOfDay;
  until: TimeOfDay;
};

export type NotificationPreferences = {
  morningCheckIn: boolean;
  eveningCheckIn: boolean;
  weeklyReview: boolean;
  morningAt: TimeOfDay;
  eveningAt: TimeOfDay;
  /** 1 = Sunday, matching `expo-notifications`' weekday numbering. 2 = Monday. */
  weeklyReviewWeekday: number;
  weeklyReviewAt: TimeOfDay;
  quietHours: QuietHours;
};

/**
 * Where a user starts, by how much they said they wanted to track (spec §29).
 *
 * A minimal tracker gets one reminder a day, not two. Everything stays adjustable — this is the
 * first screen state, not a policy the app enforces afterwards.
 */
export function defaultPreferences(trackingStyle: TrackingStyleKey): NotificationPreferences {
  const minimal = trackingStyle === 'minimal';

  return {
    // The evening prompt survives into minimal rather than the morning one: "anything worth
    // logging today?" can still capture a whole day, where a morning check-in cannot.
    morningCheckIn: !minimal,
    eveningCheckIn: true,
    weeklyReview: !minimal,

    morningAt: { hour: 9, minute: 0 },
    eveningAt: { hour: 20, minute: 30 },

    weeklyReviewWeekday: 1,
    weeklyReviewAt: { hour: 10, minute: 0 },

    quietHours: {
      enabled: true,
      from: { hour: 22, minute: 0 },
      until: { hour: 7, minute: 0 },
    },
  };
}

/** Minutes since local midnight. The only sane way to compare wall-clock times. */
export function minutesSinceMidnight(time: TimeOfDay): number {
  return time.hour * 60 + time.minute;
}

/**
 * Whether a time falls inside the quiet window.
 *
 * The window is closed at the start and open at the end: a reminder at exactly 22:00 with quiet
 * hours from 22:00 is suppressed, and one at exactly 07:00 with quiet hours until 07:00 is not.
 * Some rule is needed at the boundary and this is the one that matches how people read "quiet from
 * ten until seven".
 *
 * A window that wraps midnight — the normal case — is the union of two ranges rather than one, so
 * the comparison flips when `from` is later than `until`. Getting this wrong the obvious way
 * (`from <= t && t < until`) silently makes every overnight window match nothing at all.
 */
export function isWithinQuietHours(time: TimeOfDay, quietHours: QuietHours): boolean {
  if (!quietHours.enabled) return false;

  const at = minutesSinceMidnight(time);
  const from = minutesSinceMidnight(quietHours.from);
  const until = minutesSinceMidnight(quietHours.until);

  // A window with the same start and end is empty, not the whole day. "Quiet from 9 until 9"
  // silencing everything would be a very expensive reading of an ambiguous setting.
  if (from === until) return false;

  return from < until ? at >= from && at < until : at >= from || at < until;
}
