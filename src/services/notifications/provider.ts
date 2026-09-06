/**
 * The notification seam (`CLAUDE.md` §7).
 *
 * Domain code decides *what* to schedule; this decides nothing and only talks to the OS. Keeping
 * the boundary here is what lets `reminders.ts` be tested without a device, and what makes an
 * Android implementation a new file rather than a rewrite.
 */

import type { PlannedReminder } from '@/domain/notifications/schedule';

/**
 * What the OS currently allows.
 *
 * `undetermined` is not a synonym for `denied` and the difference matters: it is the only state in
 * which asking is still possible. Collapsing the two is how an app ends up either never asking or
 * asking someone who has already said no.
 */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

export interface NotificationProvider {
  getPermission(): Promise<NotificationPermission>;

  /**
   * Shows the OS permission sheet.
   *
   * **Only call this after the user has seen an explanation and asked for it** (spec §74). iOS
   * gives an app one chance: a sheet shown at launch, before anyone knows what the app does, is a
   * permission spent rather than a permission asked.
   */
  requestPermission(): Promise<NotificationPermission>;

  /**
   * Makes the OS schedule exactly `reminders` and nothing else.
   *
   * Replaces rather than adds. Every implementation must cancel what it previously scheduled
   * first — a settings screen is saved repeatedly, and an `apply` that appends would give someone
   * four identical morning reminders by the end of a session.
   */
  apply(reminders: PlannedReminder[]): Promise<void>;

  /** Cancels everything this app has scheduled. Used on sign-out and when permission is lost. */
  cancelAll(): Promise<void>;
}
