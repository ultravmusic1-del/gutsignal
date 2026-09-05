/**
 * The one way to send an analytics event (`CLAUDE.md` §29, spec risk T5).
 *
 * Nothing in the app talks to an analytics provider. It calls `track`, which accepts only the
 * events declared in `events.ts` and only the properties those events declare. There is no
 * escape hatch, no `trackRaw`, and no property passthrough — adding one would defeat the entire
 * point of the file.
 *
 * **Two walls, not one.** TypeScript rejects an undeclared event or property at the call site;
 * Zod rejects it again at runtime, because types vanish at the boundary with untyped code and a
 * release blocker deserves a belt as well as braces.
 *
 * **Analytics may never break logging.** `CLAUDE.md` §54 puts reliable logging first and
 * analytics nowhere on the list, so nothing here throws in production: a bad event is dropped.
 * The developer warning names the offending keys and never their values — leaking a symptom into
 * a console log is the same defect as leaking it to a vendor, just with a smaller audience (§30).
 */

import { ANALYTICS_EVENT_SCHEMAS, type AnalyticsArgs, type AnalyticsEventName } from './events';

/**
 * Where validated events go.
 *
 * A provider is registered at boot when the owner supplies a key. Until then the sink is null and
 * `track` validates and discards — which is the honest default, and means every call site is
 * already correct on the day PostHog is wired in.
 */
export type AnalyticsSink = {
  capture: (event: AnalyticsEventName, properties: Record<string, unknown>) => void;
};

let sink: AnalyticsSink | null = null;

export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

/** For tests and for sign-out, where a stale identity must not outlive the session. */
export function resetAnalytics(): void {
  sink = null;
}

/**
 * What happened to an event.
 *
 * Returned rather than thrown so a caller may assert on it in a test, while a screen can ignore
 * it entirely.
 */
export type TrackResult = 'sent' | 'dropped_invalid' | 'no_sink' | 'sink_failed';

/**
 * Which keys a validation failure was about.
 *
 * An undeclared property is reported by Zod as an `unrecognized_keys` issue with an **empty
 * path** — the names live on the issue itself. That is precisely the case worth naming, since an
 * undeclared property is the one most likely to be carrying something it should not, so reading
 * only `path` would leave the most important warning blank.
 */
function offendingKeys(
  issues: { path: PropertyKey[]; code?: string; keys?: string[] }[]
): string[] {
  const named = issues.flatMap((issue) => [
    ...(issue.keys ?? []),
    ...(issue.path.length > 0 ? [issue.path.map(String).join('.')] : []),
  ]);

  return [...new Set(named)];
}

/**
 * Report a rejected event without reproducing it.
 *
 * Only the event name and the offending property **keys** — never a value. The whole reason an
 * event is rejected is that it may be carrying something that must not be copied anywhere, and a
 * console is somewhere.
 */
function warnRejected(event: AnalyticsEventName, keys: string[]): void {
  if (!__DEV__) return;

  const detail = keys.length > 0 ? ` Offending keys: ${keys.join(', ')}.` : '';

  // eslint-disable-next-line no-console -- a developer-only guard rail; stripped in production.
  console.warn(
    `[analytics] "${event}" did not match its declared shape and was dropped.${detail} ` +
      'Values are deliberately not shown. See src/services/analytics/events.ts.'
  );
}

export function track<E extends AnalyticsEventName>(
  event: E,
  ...args: AnalyticsArgs<E>
): TrackResult {
  const properties: unknown = args[0];

  const schema = ANALYTICS_EVENT_SCHEMAS[event];

  // An unknown event name can only arrive from untyped code, and is exactly what this guard is
  // for: `schema` would be undefined and `safeParse` would throw.
  if (schema === undefined) {
    warnRejected(event, []);
    return 'dropped_invalid';
  }

  const parsed = schema.safeParse(properties ?? {});

  if (!parsed.success) {
    warnRejected(event, offendingKeys(parsed.error.issues));
    return 'dropped_invalid';
  }

  if (sink === null) return 'no_sink';

  try {
    // The parsed value, never the caller's object. Zod's `.strict()` rejects unknown keys
    // outright, so nothing undeclared can survive this line even if a caller passed extras.
    sink.capture(event, parsed.data);
    return 'sent';
  } catch {
    // A vendor SDK that throws must not take a logging flow with it: `CLAUDE.md` §54 ranks
    // reliable logging first and analytics nowhere at all. The error is deliberately swallowed
    // rather than reported — it would carry a stack through code that was handling health data,
    // which is the §30 problem in a different costume.
    return 'sink_failed';
  }
}
