/**
 * Counting log writes, without describing them (`CLAUDE.md` §29).
 *
 * Every save and delete in the app funnels through here, so there is one place to check that the
 * funnel counts entries and never characterises them. Spec §29's worked example is followed
 * exactly: the log kind lives in the **event name**, and the only property is whether this was a
 * new entry or a correction.
 *
 * What is deliberately absent is everything a product manager would ask for next — what was
 * eaten, how bad it was, how long the form took, how many items were added. None of that can be
 * sent, because none of it is declared, and this module is where that constraint becomes visible
 * rather than theoretical.
 */

import { LOG_ENTRY_KINDS, type LogEntryKind } from '@/domain/logs/entry';
import { track, type TrackResult } from '@/services/analytics/analytics';
import type { AnalyticsEventName } from '@/services/analytics/events';

/** Whether the user recorded something new or corrected an existing entry. */
export type LogWriteMode = 'created' | 'edited';

/**
 * Which event each log kind reports.
 *
 * A `Record<LogEntryKind, …>` rather than a lookup that could miss: adding a sixth log type stops
 * compiling here, which is the correct place to be reminded that the funnel needs an event for it.
 */
export const LOG_COMPLETED_EVENTS = {
  meal: 'meal_log_completed',
  symptom: 'symptom_log_completed',
  bowel: 'bowel_log_completed',
  wellbeing: 'wellbeing_log_completed',
  context: 'context_log_completed',
} as const satisfies Record<LogEntryKind, AnalyticsEventName>;

export type LogCompletedEvent = (typeof LOG_COMPLETED_EVENTS)[LogEntryKind];

/**
 * Report that an entry was saved.
 *
 * Called from a mutation's `onSuccess`, so a failed write is never counted — react-query
 * guarantees that, which is why there is no success flag to get wrong here.
 */
export function trackLogSaved(kind: LogEntryKind, mode: LogWriteMode): TrackResult {
  return track(LOG_COMPLETED_EVENTS[kind], { mode });
}

export function trackLogDeleted(kind: LogEntryKind): TrackResult {
  return track('log_deleted', { kind });
}

/** Exported for the test that checks every kind is covered. */
export const TRACKED_LOG_KINDS = LOG_ENTRY_KINDS;
