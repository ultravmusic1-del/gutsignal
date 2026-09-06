/**
 * The one way to report a crash (`CLAUDE.md` §30).
 *
 * Same shape as the analytics wall, for the same reason: nothing in the app talks to a monitoring
 * vendor, it calls `captureError`, and everything that leaves goes through `scrubEvent` on the way
 * out. There is no `captureRaw`.
 *
 * **The operation is an enum, the message is not.** That asymmetry is deliberate. A crash report
 * is only useful if it carries a real error, so free text has to travel — but *which* part of the
 * app failed is knowable in advance, and a fixed vocabulary there means the most useful field in
 * the report is also the one that cannot leak anything.
 *
 * No SDK is imported and none is needed. Until the owner supplies a DSN the sink is null and
 * `captureError` scrubs and discards, which means every call site is already correct on the day
 * Sentry is wired in — and the scrubbing is exercised by the tests either way.
 */

import { scrubEvent, type ReportableEvent } from './scrub';

/**
 * Where in the app a failure happened.
 *
 * Fixed, because a free-form operation name would be built from whatever the caller had to hand,
 * and this is the field a triage dashboard groups by.
 *
 * Only the two that are actually reported. An unused entry is a vocabulary nobody has thought
 * about yet, and adding one when a call site needs it is a single line — which is the right moment
 * to decide what it should be called.
 */
export const MONITORED_OPERATIONS = ['app_render', 'app_boot'] as const;

export type MonitoredOperation = (typeof MONITORED_OPERATIONS)[number];

export type MonitoringSink = {
  capture: (event: ReportableEvent) => void;
};

let sink: MonitoringSink | null = null;

export function setMonitoringSink(next: MonitoringSink | null): void {
  sink = next;
}

/** For tests, and for sign-out, where a user id must not outlive the session. */
export function resetMonitoring(): void {
  sink = null;
  currentUserId = null;
}

let currentUserId: string | null = null;

/**
 * Ties reports to an account without collecting anything about the person.
 *
 * The id and nothing else — `scrubEvent` drops email, username and IP even if a vendor SDK adds
 * them later, so this is the only channel by which a report can be attributed at all.
 */
export function identifyForMonitoring(userId: string | null): void {
  currentUserId = userId;
}

export type CaptureResult = 'sent' | 'no_sink';

/**
 * Reports a caught error.
 *
 * Never throws. A monitoring vendor failing must not take down the screen that was already
 * handling a failure — that is how one bug becomes a blank app (`CLAUDE.md` §54).
 */
export function captureError(operation: MonitoredOperation, error: unknown): CaptureResult {
  const event = scrubEvent({
    exception: [describe(error)],
    tags: { operation },
    ...(currentUserId === null ? {} : { user: { id: currentUserId } }),
  });

  if (sink === null) return 'no_sink';

  try {
    sink.capture(event);
    return 'sent';
  } catch {
    return 'no_sink';
  }
}

/**
 * An unknown throw, described.
 *
 * A stack is deliberately not collected here. It is the SDK's job, it is the part most likely to
 * embed a string that was being formatted at the time, and reading `error.stack` ourselves would
 * mean scrubbing it ourselves — a job better done once, by `beforeSend`, over everything the SDK
 * assembles.
 */
function describe(error: unknown): { type?: string; value?: string } {
  if (error instanceof Error) {
    return { type: error.name, value: error.message };
  }

  if (typeof error === 'string') return { type: 'String', value: error };

  return { type: typeof error };
}
