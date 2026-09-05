/**
 * Observation windows (spec §56).
 *
 * A window answers "how long after eating something do we look for an outcome?" These are
 * **analysis windows, not medical claims.** Nothing here asserts a validated physiological
 * latency, and no user-facing copy derived from them may imply one — the spec is explicit about
 * that, and it is the kind of quiet overreach that turns a diary into a diagnostic claim.
 *
 * They are versioned. If a window's bounds change, findings computed under the old bounds are
 * not comparable to new ones, so `WINDOWS_VERSION` moves and `ENGINE_VERSION` moves with it.
 */

import type { ObservationWindowKey } from './types';

export const WINDOWS_VERSION = '1.0.0';

export type ObservationWindow = {
  key: ObservationWindowKey;
  /** How the window is described to the user. Descriptive, never causal. */
  label: string;
  /** Hours after the exposure at which the window opens, inclusive. */
  fromHours: number;
  /** Hours after the exposure at which it closes, exclusive. */
  toHours: number;
};

export const OBSERVATION_WINDOWS: Record<ObservationWindowKey, ObservationWindow> = {
  shortly_after: {
    key: 'shortly_after',
    label: 'Shortly after',
    fromHours: 0,
    toHours: 4,
  },
  later_same_day: {
    key: 'later_same_day',
    label: 'Later the same day',
    fromHours: 4,
    toHours: 12,
  },
  next_morning: {
    key: 'next_morning',
    label: 'The next morning',
    fromHours: 12,
    toHours: 24,
  },
  next_day: {
    key: 'next_day',
    label: 'The next day',
    fromHours: 24,
    toHours: 48,
  },
};

export const OBSERVATION_WINDOW_KEYS = Object.keys(OBSERVATION_WINDOWS) as ObservationWindowKey[];

/** The window used when nothing else is specified. Wide enough to catch same-day outcomes. */
export const DEFAULT_WINDOW: ObservationWindowKey = 'later_same_day';

/**
 * Whether `outcomeAt` falls inside the window opened by `exposedAt`.
 *
 * Half-open — `[from, to)` — so adjacent windows tile without overlapping and a single outcome
 * can never be counted twice for the same exposure.
 */
export function isWithinWindow(
  exposedAt: string,
  outcomeAt: string,
  window: ObservationWindow
): boolean {
  const exposed = Date.parse(exposedAt);
  const outcome = Date.parse(outcomeAt);

  if (Number.isNaN(exposed) || Number.isNaN(outcome)) return false;

  const elapsedHours = (outcome - exposed) / 3_600_000;

  return elapsedHours >= window.fromHours && elapsedHours < window.toHours;
}

/**
 * The window a given gap falls into, or null when it falls outside all of them.
 *
 * Used when attributing an outcome to the most recent exposure rather than testing a specific
 * window.
 */
export function windowForGap(elapsedHours: number): ObservationWindowKey | null {
  for (const key of OBSERVATION_WINDOW_KEYS) {
    const window = OBSERVATION_WINDOWS[key];
    if (elapsedHours >= window.fromHours && elapsedHours < window.toHours) return key;
  }

  return null;
}

/** How a window reads in a sentence. Descriptive; never states a mechanism or a latency. */
export function windowLabel(key: ObservationWindowKey): string {
  return OBSERVATION_WINDOWS[key].label;
}
