import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { track } from '@/services/analytics/analytics';
import type { AnalyticsEventName, AnalyticsProperties } from '@/services/analytics/events';

/**
 * Reporting that a screen was looked at, once per visit.
 *
 * Screen events are where funnels usually go wrong, and always in the same two ways. Report from
 * a render and every state change becomes a "view", so the number counts re-renders rather than
 * people. Report from a mount effect and a tab the user returns to five times counts once,
 * because React Navigation keeps the screen mounted underneath it.
 *
 * So: **once per focus**, guarded by a ref that resets when focus is lost. Someone who opens
 * Insights, goes to Timeline and comes back has viewed it twice, which is true.
 *
 * **Waiting for the answer.** Some of these events describe what the user actually saw —
 * `insights_viewed` distinguishes an empty screen from a populated one — and at the moment of
 * focus the query is usually still running. Passing `null` means "not yet": the event fires on
 * the first pass of that visit where the properties are known. If they never become known,
 * nothing is reported, which beats reporting a guess.
 *
 * Reporting happens in an effect rather than during render, which matters beyond tidiness: React
 * may discard a render or run it twice, and a discarded render that already sent an event cannot
 * take it back.
 */
export function useScreenView<E extends AnalyticsEventName>(
  event: E,
  properties: AnalyticsProperties<E> | null
): void {
  const focused = useRef(false);
  const reported = useRef(false);

  // Refs rather than state throughout. Focus held in state would make this hook re-render its
  // screen on every navigation, which is a real cost for something the screen never reads — and
  // a state update from inside a focus effect is exactly the kind of thing that turns into an
  // ordering puzzle later.
  const latest = useRef(properties);

  // Written in an effect rather than during render: a ref write is a mutation, and React makes no
  // promise that a render it started will be the one it keeps. Declared first, so it has already
  // run by the time the effects below read it.
  useEffect(() => {
    latest.current = properties;
  });

  const report = useCallback(() => {
    if (!focused.current || reported.current || latest.current === null) return;

    track(event, latest.current as never);
    reported.current = true;
  }, [event]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      report();

      return () => {
        focused.current = false;
        reported.current = false;
      };
    }, [report])
  );

  // Properties are small, flat and enum-valued by construction (see `events.ts`), so serialising
  // them is a cheap dependency that changes when the *values* do rather than on every render.
  // This is the second chance for a screen whose data arrives after focus was gained.
  const signature = properties === null ? null : JSON.stringify(properties);

  useEffect(() => {
    report();
  }, [report, signature]);
}
