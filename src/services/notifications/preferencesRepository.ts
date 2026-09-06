/**
 * Reading and writing notification preferences on this device.
 *
 * Local only, and not queued for sync. A reminder is registered with *this* phone's OS against
 * *this* phone's clock, so the setting belongs to the device rather than to the account — syncing
 * it would let a tablet silently reschedule a phone. It is also the only user-owned table in the
 * local database holding no health information, which is why nothing here touches the outbox.
 *
 * A user with no row yet is not an error. `load` answers with the defaults for their tracking
 * style, so the settings screen has something correct to show before anything is saved.
 */

import {
  defaultPreferences,
  type NotificationPreferences,
} from '@/domain/notifications/preferences';
import type { TrackingStyleKey } from '@/domain/onboarding/options';
import type { SqlDatabase } from '@/services/db/sqlite';

const TABLE = 'notification_preferences';

type PreferencesRow = {
  morning_check_in: number;
  evening_check_in: number;
  weekly_review: number;
  morning_hour: number;
  morning_minute: number;
  evening_hour: number;
  evening_minute: number;
  weekly_weekday: number;
  weekly_hour: number;
  weekly_minute: number;
  quiet_hours_enabled: number;
  quiet_from_hour: number;
  quiet_from_minute: number;
  quiet_until_hour: number;
  quiet_until_minute: number;
};

/** SQLite has no boolean. One place to convert, so no call site has to remember. */
const toBoolean = (value: number): boolean => value === 1;
const toInteger = (value: boolean): number => (value ? 1 : 0);

function fromRow(row: PreferencesRow): NotificationPreferences {
  return {
    morningCheckIn: toBoolean(row.morning_check_in),
    eveningCheckIn: toBoolean(row.evening_check_in),
    weeklyReview: toBoolean(row.weekly_review),
    morningAt: { hour: row.morning_hour, minute: row.morning_minute },
    eveningAt: { hour: row.evening_hour, minute: row.evening_minute },
    weeklyReviewWeekday: row.weekly_weekday,
    weeklyReviewAt: { hour: row.weekly_hour, minute: row.weekly_minute },
    quietHours: {
      enabled: toBoolean(row.quiet_hours_enabled),
      from: { hour: row.quiet_from_hour, minute: row.quiet_from_minute },
      until: { hour: row.quiet_until_hour, minute: row.quiet_until_minute },
    },
  };
}

/**
 * The user's preferences, or the defaults for their tracking style if they have never saved any.
 *
 * The fallback is not persisted. Writing defaults on first read would make "never changed" and
 * "chose exactly the defaults" indistinguishable, and the difference matters the day the defaults
 * change: someone who accepted them should move with them, someone who chose them should not.
 */
export async function loadNotificationPreferences(
  db: SqlDatabase,
  userId: string,
  trackingStyle: TrackingStyleKey
): Promise<NotificationPreferences> {
  const row = await db.getFirstAsync<PreferencesRow>(
    `SELECT * FROM ${TABLE} WHERE user_id = ?`,
    userId
  );

  return row === null ? defaultPreferences(trackingStyle) : fromRow(row);
}

/** Whether this user has ever saved preferences. Distinguishes "accepted" from "chose". */
export async function hasSavedNotificationPreferences(
  db: SqlDatabase,
  userId: string
): Promise<boolean> {
  const row = await db.getFirstAsync<{ user_id: string }>(
    `SELECT user_id FROM ${TABLE} WHERE user_id = ?`,
    userId
  );

  return row !== null;
}

export async function saveNotificationPreferences(
  db: SqlDatabase,
  userId: string,
  preferences: NotificationPreferences,
  now: Date
): Promise<void> {
  const timestamp = now.toISOString();

  await db.runAsync(
    `INSERT INTO ${TABLE} (
       user_id, morning_check_in, evening_check_in, weekly_review,
       morning_hour, morning_minute, evening_hour, evening_minute,
       weekly_weekday, weekly_hour, weekly_minute,
       quiet_hours_enabled, quiet_from_hour, quiet_from_minute,
       quiet_until_hour, quiet_until_minute,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       morning_check_in   = excluded.morning_check_in,
       evening_check_in   = excluded.evening_check_in,
       weekly_review      = excluded.weekly_review,
       morning_hour       = excluded.morning_hour,
       morning_minute     = excluded.morning_minute,
       evening_hour       = excluded.evening_hour,
       evening_minute     = excluded.evening_minute,
       weekly_weekday     = excluded.weekly_weekday,
       weekly_hour        = excluded.weekly_hour,
       weekly_minute      = excluded.weekly_minute,
       quiet_hours_enabled = excluded.quiet_hours_enabled,
       quiet_from_hour    = excluded.quiet_from_hour,
       quiet_from_minute  = excluded.quiet_from_minute,
       quiet_until_hour   = excluded.quiet_until_hour,
       quiet_until_minute = excluded.quiet_until_minute,
       updated_at         = excluded.updated_at`,
    userId,
    toInteger(preferences.morningCheckIn),
    toInteger(preferences.eveningCheckIn),
    toInteger(preferences.weeklyReview),
    preferences.morningAt.hour,
    preferences.morningAt.minute,
    preferences.eveningAt.hour,
    preferences.eveningAt.minute,
    preferences.weeklyReviewWeekday,
    preferences.weeklyReviewAt.hour,
    preferences.weeklyReviewAt.minute,
    toInteger(preferences.quietHours.enabled),
    preferences.quietHours.from.hour,
    preferences.quietHours.from.minute,
    preferences.quietHours.until.hour,
    preferences.quietHours.until.minute,
    timestamp,
    timestamp
  );
}
