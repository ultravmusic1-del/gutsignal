import {
  resetAnalytics,
  setAnalyticsSink,
  track,
  type AnalyticsSink,
  type TrackResult,
} from '../analytics';
import { ANALYTICS_EVENT_NAMES } from '../events';

/**
 * How `track` behaves at the boundary.
 *
 * Two things matter here and nothing else does: an event that carries something undeclared must
 * not reach the sink, and a failure must never propagate into the caller. `CLAUDE.md` §54 ranks
 * reliable logging first and analytics nowhere — a screen that crashes because a vendor call went
 * wrong has its priorities exactly inverted.
 */

const captured: { event: string; properties: Record<string, unknown> }[] = [];

/**
 * How a bad event actually arrives.
 *
 * TypeScript rejects every case below at a real call site, which is the first wall and the one
 * that matters most. These tests exercise the second wall, so they call through an untyped alias
 * — the shape of the problem in practice: untyped JavaScript, a stale event name left behind by a
 * rename, or a property object built dynamically.
 */
const untypedTrack = track as (event: string, properties?: unknown) => TrackResult;

const recordingSink: AnalyticsSink = {
  capture: (event, properties) => {
    captured.push({ event, properties });
  },
};

beforeEach(() => {
  captured.length = 0;
  resetAnalytics();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  resetAnalytics();
});

describe('sending a declared event', () => {
  it('reaches the sink with its properties', () => {
    setAnalyticsSink(recordingSink);

    expect(track('signed_in', { method: 'apple' })).toBe('sent');
    expect(captured).toEqual([{ event: 'signed_in', properties: { method: 'apple' } }]);
  });

  it('sends an event that takes no properties', () => {
    setAnalyticsSink(recordingSink);

    expect(track('app_opened')).toBe('sent');
    expect(captured[0]?.properties).toEqual({});
  });
});

describe('no sink registered', () => {
  // The state the app actually ships in until the owner supplies a key. Call sites must already
  // be correct, so `track` still validates — it simply has nowhere to send the result.
  it('validates and discards rather than failing', () => {
    expect(track('app_opened')).toBe('no_sink');
    expect(captured).toHaveLength(0);
  });

  it('still rejects a malformed event, so a bad call site is caught before a provider exists', () => {
    expect(untypedTrack('signed_in', { method: 'carrier_pigeon' })).toBe('dropped_invalid');
  });
});

describe('refusing what was not declared', () => {
  beforeEach(() => setAnalyticsSink(recordingSink));

  // The failure this whole module exists to prevent (§29, §58).
  it('drops an event carrying an undeclared property', () => {
    expect(untypedTrack('symptom_log_completed', { mode: 'created', severity: 8 })).toBe(
      'dropped_invalid'
    );
    expect(captured).toHaveLength(0);
  });

  it('drops an event with a value outside its declared vocabulary', () => {
    expect(untypedTrack('log_sheet_opened', { entryPoint: 'a-meal-of-dairy' })).toBe(
      'dropped_invalid'
    );
    expect(captured).toHaveLength(0);
  });

  it('drops an event that is not on the allowlist at all', () => {
    expect(untypedTrack('journal_written')).toBe('dropped_invalid');
    expect(captured).toHaveLength(0);
  });

  it('drops an event whose required property is missing', () => {
    expect(untypedTrack('signed_in')).toBe('dropped_invalid');
    expect(captured).toHaveLength(0);
  });

  // Zod's `.strict()` rejects extras outright, so this is really a guarantee that nothing
  // undeclared can survive even if a future schema were loosened.
  it('never forwards the caller object, only the parsed result', () => {
    track('log_deleted', { kind: 'meal' });

    expect(captured[0]?.properties).toEqual({ kind: 'meal' });
    expect(Object.keys(captured[0]?.properties ?? {})).toEqual(['kind']);
  });
});

describe('failing safely', () => {
  it('does not throw when the sink itself throws', () => {
    setAnalyticsSink({
      capture: () => {
        throw new Error('vendor is down');
      },
    });

    // Analytics must never be able to break a screen. A vendor SDK throwing inside a save handler
    // would take a logging flow down with it, which inverts CLAUDE.md §54 exactly.
    expect(track('app_opened')).toBe('sink_failed');
  });

  // The warning is a developer aid, and a console is somewhere health content must not be copied
  // to (§30). Naming the key is useful; echoing the value would defeat the point of rejecting it.
  it('names the offending key without reproducing its value', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    untypedTrack('symptom_log_completed', { mode: 'created', severity: 8 });

    const message = warn.mock.calls.map((call) => String(call[0])).join(' ');

    expect(message).toContain('severity');
    expect(message).not.toContain('8');
  });
});

describe('resetting', () => {
  it('stops sending once the sink is cleared, as it is on sign-out', () => {
    setAnalyticsSink(recordingSink);
    track('app_opened');

    resetAnalytics();

    expect(track('app_opened')).toBe('no_sink');
    expect(captured).toHaveLength(1);
  });
});

describe('every declared event', () => {
  // A schema that cannot be satisfied is a call site that will always be dropped, silently. This
  // catches one added with a typo or an impossible constraint.
  it.each(ANALYTICS_EVENT_NAMES)('%s is reachable with some valid input', (name) => {
    setAnalyticsSink(recordingSink);

    const attempts: Record<string, unknown>[] = [
      {},
      { method: 'apple' },
      { mode: 'created' },
      { entryPoint: 'today' },
      { kind: 'meal' },
      { state: 'empty' },
      { reason: 'network' },
      { step: 'goals' },
    ];

    const sent = attempts.some((properties) => untypedTrack(name, properties) === 'sent');

    expect(sent).toBe(true);
  });
});
