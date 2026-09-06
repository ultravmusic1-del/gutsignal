import { useEffect, useRef } from 'react';

import { track } from '@/services/analytics/analytics';
import type { AnalyticsEventName, AnalyticsProperties } from '@/services/analytics/events';

/**
 * Reporting a search once the typing stops.
 *
 * A search box fires a change per keystroke. Reporting on each one would count "bloating" as eight
 * searches and make the event a measure of word length, so this waits for the value to settle and
 * reports the settled value once.
 *
 * **The value itself is never sent.** `timeline_searched` is declared property-free precisely
 * because a search string is free text a person typed about their own health (`CLAUDE.md` §29).
 * The value is used here only to decide *when* something happened; nothing derived from it leaves
 * this hook.
 *
 * An empty box is not a search. Clearing the field is how someone gets their whole diary back, and
 * counting that as a search would inflate the number with the opposite of one.
 */

/**
 * How long a value must hold still before it counts as a search.
 *
 * Long enough to sit through a pause mid-word, short enough that a real search is reported while
 * the person is still looking at the results. A display threshold, not a measured one.
 */
export const SETTLE_DELAY_MS = 800;

export function useSettledEvent<E extends AnalyticsEventName>(
  event: AnalyticsProperties<E> extends Record<string, never> ? E : never,
  value: string,
  delayMs: number = SETTLE_DELAY_MS
): void {
  // What was last reported, so holding a value still — or returning to it after a detour — does
  // not report it twice.
  const lastReported = useRef<string | null>(null);

  useEffect(() => {
    const settled = value.trim();

    if (settled.length === 0 || settled === lastReported.current) return;

    const timer = setTimeout(() => {
      lastReported.current = settled;
      track(event as AnalyticsEventName);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [event, value, delayMs]);
}
