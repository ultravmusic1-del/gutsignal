/**
 * Turning preferences into the exact set of reminders to register with the OS (spec §74).
 *
 * Pure, so the thing that decides when GutSignal interrupts someone can be tested without a
 * device. The provider in `services/notifications` takes this plan and does nothing but register
 * it — the decisions all live here.
 *
 * ## Why suppression is returned rather than applied silently
 *
 * Quiet hours and a reminder time can contradict each other: morning check-in at 09:00 with quiet
 * hours until 10:00 means the user has switched something on that will never arrive. Dropping it
 * quietly is the obvious implementation and the wrong one — the settings screen would show an
 * enabled toggle that does nothing, which is the failure §75 exists to prevent.
 *
 * So the plan names what it suppressed and why, and the screen says so.
 */

import {
  isWithinQuietHours,
  type NotificationPreferences,
  type ReminderKind,
  type TimeOfDay,
} from './preferences';

export type PlannedReminder = {
  kind: ReminderKind;
  at: TimeOfDay;
  /** Present for weekly reminders only. 1 = Sunday, matching `expo-notifications`. */
  weekday?: number;
  title: string;
  body: string;
};

export type SuppressedReminder = {
  kind: ReminderKind;
  reason: 'quiet_hours';
};

export type ReminderPlan = {
  scheduled: PlannedReminder[];
  suppressed: SuppressedReminder[];
};

/**
 * The copy, in one place.
 *
 * Taken from spec §74 and kept calm and unpushy (§34). No notification claims a finding, names a
 * food or mentions a symptom — a lock screen is read by whoever is holding the phone, and §28's
 * data minimisation does not stop at the app's own edge.
 */
const COPY: Record<ReminderKind, { title: string; body: string }> = {
  morning_check_in: {
    title: 'Quick gut check-in?',
    body: 'How are things this morning?',
  },
  evening_check_in: {
    title: 'Anything worth logging today?',
    body: 'A few seconds now is a clearer picture later.',
  },
  weekly_review: {
    title: 'Your weekly review is ready',
    body: 'See what your week looked like.',
  },
};

/**
 * Every reminder the preferences ask for, split into what will be delivered and what will not.
 *
 * Order is stable — morning, evening, weekly — so a caller can compare two plans, and so the
 * settings screen lists them the way the day runs.
 */
export function planReminders(preferences: NotificationPreferences): ReminderPlan {
  const scheduled: PlannedReminder[] = [];
  const suppressed: SuppressedReminder[] = [];

  const consider = (kind: ReminderKind, enabled: boolean, at: TimeOfDay, weekday?: number) => {
    if (!enabled) return;

    if (isWithinQuietHours(at, preferences.quietHours)) {
      suppressed.push({ kind, reason: 'quiet_hours' });
      return;
    }

    scheduled.push({
      kind,
      at,
      ...(weekday === undefined ? {} : { weekday }),
      ...COPY[kind],
    });
  };

  consider('morning_check_in', preferences.morningCheckIn, preferences.morningAt);
  consider('evening_check_in', preferences.eveningCheckIn, preferences.eveningAt);
  consider(
    'weekly_review',
    preferences.weeklyReview,
    preferences.weeklyReviewAt,
    preferences.weeklyReviewWeekday
  );

  return { scheduled, suppressed };
}
