import {
  defaultPreferences,
  isWithinQuietHours,
  type NotificationPreferences,
  type QuietHours,
} from '../preferences';
import { planReminders } from '../schedule';

/**
 * When GutSignal is allowed to interrupt someone (spec §74–75).
 *
 * All wall-clock reasoning, which is where this kind of code goes wrong: an overnight quiet window
 * is two ranges, not one, and the obvious comparison makes every overnight window match nothing.
 */

const prefs = (overrides: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  ...defaultPreferences('balanced'),
  ...overrides,
});

const quiet = (from: number, until: number): QuietHours => ({
  enabled: true,
  from: { hour: from, minute: 0 },
  until: { hour: until, minute: 0 },
});

describe('quiet hours', () => {
  // The ordinary case, and the one a naive `from <= t && t < until` gets wrong: 22:00 is later
  // than 07:00, so the window is the union of two ranges rather than one.
  it('covers a window that wraps midnight', () => {
    const overnight = quiet(22, 7);

    expect(isWithinQuietHours({ hour: 23, minute: 30 }, overnight)).toBe(true);
    expect(isWithinQuietHours({ hour: 3, minute: 0 }, overnight)).toBe(true);
    expect(isWithinQuietHours({ hour: 6, minute: 59 }, overnight)).toBe(true);
    expect(isWithinQuietHours({ hour: 12, minute: 0 }, overnight)).toBe(false);
    expect(isWithinQuietHours({ hour: 21, minute: 59 }, overnight)).toBe(false);
  });

  it('covers a window inside one day', () => {
    const daytime = quiet(9, 17);

    expect(isWithinQuietHours({ hour: 12, minute: 0 }, daytime)).toBe(true);
    expect(isWithinQuietHours({ hour: 8, minute: 59 }, daytime)).toBe(false);
    expect(isWithinQuietHours({ hour: 20, minute: 0 }, daytime)).toBe(false);
  });

  // Closed at the start, open at the end. Some rule is needed and this is the one that matches
  // how "quiet from ten until seven" reads.
  it('includes the start minute and excludes the end minute', () => {
    const overnight = quiet(22, 7);

    expect(isWithinQuietHours({ hour: 22, minute: 0 }, overnight)).toBe(true);
    expect(isWithinQuietHours({ hour: 7, minute: 0 }, overnight)).toBe(false);
  });

  it('is inert when switched off', () => {
    expect(isWithinQuietHours({ hour: 3, minute: 0 }, { ...quiet(22, 7), enabled: false })).toBe(
      false
    );
  });

  // "Quiet from 9 until 9" is ambiguous, and reading it as the whole day would silence everything
  // a user had switched on without telling them.
  it('treats a zero-length window as empty rather than as the whole day', () => {
    const empty = quiet(9, 9);

    expect(isWithinQuietHours({ hour: 9, minute: 0 }, empty)).toBe(false);
    expect(isWithinQuietHours({ hour: 21, minute: 0 }, empty)).toBe(false);
  });
});

describe('planning reminders', () => {
  it('schedules what is switched on, in the order the day runs', () => {
    const plan = planReminders(prefs());

    expect(plan.scheduled.map((reminder) => reminder.kind)).toEqual([
      'morning_check_in',
      'evening_check_in',
      'weekly_review',
    ]);
    expect(plan.suppressed).toEqual([]);
  });

  it('schedules nothing that is switched off', () => {
    const plan = planReminders(
      prefs({ morningCheckIn: false, eveningCheckIn: false, weeklyReview: false })
    );

    expect(plan.scheduled).toEqual([]);
    expect(plan.suppressed).toEqual([]);
  });

  it('carries the weekday on the weekly reminder and on nothing else', () => {
    const plan = planReminders(prefs({ weeklyReviewWeekday: 3 }));

    const weekly = plan.scheduled.find((reminder) => reminder.kind === 'weekly_review');
    const morning = plan.scheduled.find((reminder) => reminder.kind === 'morning_check_in');

    expect(weekly?.weekday).toBe(3);
    expect(morning).not.toHaveProperty('weekday');
  });

  /**
   * The case the settings screen exists to explain.
   *
   * A reminder inside quiet hours will never arrive. Dropping it silently would leave an enabled
   * toggle doing nothing, which is exactly what §75's "the user controls every reminder" rules out
   * — so the plan says what it suppressed and the screen repeats it.
   */
  it('suppresses a reminder that falls inside quiet hours, and says so', () => {
    const plan = planReminders(
      prefs({ morningAt: { hour: 6, minute: 0 }, quietHours: quiet(22, 7) })
    );

    expect(plan.scheduled.map((reminder) => reminder.kind)).toEqual([
      'evening_check_in',
      'weekly_review',
    ]);
    expect(plan.suppressed).toEqual([{ kind: 'morning_check_in', reason: 'quiet_hours' }]);
  });

  it('does not report a switched-off reminder as suppressed', () => {
    const plan = planReminders(
      prefs({
        morningCheckIn: false,
        morningAt: { hour: 6, minute: 0 },
        quietHours: quiet(22, 7),
      })
    );

    expect(plan.suppressed).toEqual([]);
  });

  /**
   * A lock screen is read by whoever is holding the phone (§28).
   *
   * Nothing in a notification may name a symptom, a food or a finding. The copy is fixed and
   * carries no user data at all, and this is the test that keeps it that way when someone later
   * tries to make a reminder "more helpful".
   */
  it('carries no user data in its copy', () => {
    const plan = planReminders(prefs());

    for (const reminder of plan.scheduled) {
      expect(reminder.title.length).toBeGreaterThan(0);
      expect(reminder.body.length).toBeGreaterThan(0);
      expect(`${reminder.title} ${reminder.body}`).not.toMatch(
        /bloating|diarrhea|constipation|bristol|dairy|gluten|coffee|severity|\d/i
      );
    }
  });
});

describe('defaults by tracking style', () => {
  // §74 says adapt to the tracking preference. It sets the starting point only — see the module
  // comment on why the alternative reading is incompatible with §75.
  it('starts a minimal tracker with one daily reminder', () => {
    const plan = planReminders(defaultPreferences('minimal'));

    expect(plan.scheduled.map((reminder) => reminder.kind)).toEqual(['evening_check_in']);
  });

  it.each(['balanced', 'detailed'] as const)('starts a %s tracker with the full set', (style) => {
    const plan = planReminders(defaultPreferences(style));

    expect(plan.scheduled).toHaveLength(3);
  });

  it('starts everyone with quiet hours on', () => {
    for (const style of ['minimal', 'balanced', 'detailed'] as const) {
      expect(defaultPreferences(style).quietHours.enabled).toBe(true);
    }
  });

  // A default that lands inside the default quiet window would mean a fresh install shows a
  // suppression warning before the user has touched anything.
  it('never ships a default reminder inside the default quiet hours', () => {
    for (const style of ['minimal', 'balanced', 'detailed'] as const) {
      expect(planReminders(defaultPreferences(style)).suppressed).toEqual([]);
    }
  });
});
