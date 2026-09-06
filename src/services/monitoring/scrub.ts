/**
 * What a crash report is allowed to contain (`CLAUDE.md` §30).
 *
 * A crash report is the one place in this app where free text is genuinely valuable — a stack and
 * a message are how a bug gets found — and also the place where health content most easily
 * escapes. An error thrown while saving a symptom can quote the row. A validation failure can echo
 * a note. §30 is explicit: no health records, journals, AI prompts, photos or auth tokens.
 *
 * So the design is deliberately lopsided, and the asymmetry is the point:
 *
 * - **Structured fields are allowlisted**, exactly like the analytics wall. Request bodies,
 *   headers and arbitrary `extra` are dropped whole rather than inspected, because a scrubber that
 *   has to understand a payload to clean it will one day meet a payload it does not understand.
 *   This part is a guarantee.
 * - **Free text is redacted by pattern.** This part is **not** a guarantee, and must never be
 *   described as one. It catches the shapes that carry identity and secrets — tokens, emails,
 *   ids, long quoted values — and it will not catch a bare sentence someone interpolated into an
 *   error message. The defence against that is not writing such messages, which is why
 *   `summariseError` in the outbox and the analytics warning both name keys rather than values.
 *
 * Shaped as a `beforeSend` (spec risk T5) so a Sentry SDK can be handed this function directly
 * when the owner supplies a DSN. Nothing here imports an SDK, and nothing needs one to be tested.
 */

export const REDACTED = '[redacted]';

/**
 * The subset of a monitoring event this app will ever produce or forward.
 *
 * Structural rather than imported from a vendor: the seam has to exist before the SDK does, and a
 * type this file owns cannot silently gain a field that carries a request body.
 */
export type ReportableEvent = {
  message?: string;
  exception?: { type?: string; value?: string }[];
  breadcrumbs?: { category?: string; message?: string; data?: Record<string, unknown> }[];
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
  user?: { id?: string; email?: string; username?: string; ip_address?: string };
  request?: { url?: string; headers?: Record<string, string>; data?: unknown };
};

/** Long enough for a real stack message, short enough that a pasted payload cannot ride along. */
export const MAX_TEXT_LENGTH = 300;

/** Quoted runs longer than this are values; shorter ones are identifiers worth keeping. */
const MAX_KEPT_QUOTE = 40;

/**
 * Patterns that carry identity or secrets wherever they appear.
 *
 * Ordered most specific first: a JWT would otherwise be partly eaten by the long-token rule and
 * become unrecognisable in a report, which helps nobody.
 */
const REDACTIONS: RegExp[] = [
  // JSON Web Tokens — three base64url segments. An auth token in a report is §30's worst case.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g,
  // Bearer/apikey headers that reached a message by way of a stringified request.
  /\b(?:bearer|apikey|api[-_]?key|authorization)\s*[:=]?\s*[A-Za-z0-9._~+/=-]{8,}/gi,
  // Email addresses.
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // UUIDs — every row id and user id in this app.
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  // Any other long opaque token.
  /\b[A-Za-z0-9_-]{32,}\b/g,
  // A quoted run long enough to be a value rather than a column or constraint name.
  new RegExp(`"[^"]{${MAX_KEPT_QUOTE + 1},}"|'[^']{${MAX_KEPT_QUOTE + 1},}'`, 'g'),
];

/**
 * Redacts the shapes that carry identity, then truncates.
 *
 * **Best effort, and only that.** It cannot recognise "user said the curry made them ill" as
 * health content, because nothing can. It exists to stop the mechanical leaks — a token, an
 * address, an id, a pasted row — not to make free text safe.
 */
export function redactText(text: string): string {
  const redacted = REDACTIONS.reduce(
    (current, pattern) => current.replace(pattern, REDACTED),
    text
  );

  return redacted.length > MAX_TEXT_LENGTH
    ? `${redacted.slice(0, MAX_TEXT_LENGTH)}… ${REDACTED}`
    : redacted;
}

/**
 * A report, reduced to what may leave the device.
 *
 * Written as an allowlist: the returned object is built field by field rather than by deleting
 * from the input, so a field added to `ReportableEvent` later is dropped by default instead of
 * forwarded by default. That ordering is the whole safety property.
 */
export function scrubEvent(event: ReportableEvent): ReportableEvent {
  const scrubbed: ReportableEvent = {};

  if (event.message !== undefined) scrubbed.message = redactText(event.message);

  if (event.exception !== undefined) {
    scrubbed.exception = event.exception.map((entry) => ({
      ...(entry.type === undefined ? {} : { type: entry.type }),
      ...(entry.value === undefined ? {} : { value: redactText(entry.value) }),
    }));
  }

  if (event.breadcrumbs !== undefined) {
    // `data` goes entirely. A breadcrumb's payload is whatever the code that logged it happened to
    // have to hand, which in this app is a log row more often than not.
    scrubbed.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...(crumb.category === undefined ? {} : { category: crumb.category }),
      ...(crumb.message === undefined ? {} : { message: redactText(crumb.message) }),
    }));
  }

  // Tags are enum-ish by construction here (operation names, build channel), but a value could
  // still be built from something user-supplied, so they are redacted rather than trusted.
  if (event.tags !== undefined) {
    scrubbed.tags = Object.fromEntries(
      Object.entries(event.tags).map(([key, value]) => [key, redactText(value)])
    );
  }

  // The id alone: enough to tie a crash to a support conversation, and nothing that identifies a
  // person by itself. Email, username and IP are exactly the personal data §28 asks us not to
  // collect for a purpose that does not need it.
  if (event.user?.id !== undefined) scrubbed.user = { id: event.user.id };

  // The path without the query string (§28 forbids personal data in query strings, and a URL we
  // built could still carry an id). Headers and body are never forwarded at all: one holds the
  // auth token, the other holds the log being written.
  if (event.request?.url !== undefined) scrubbed.request = { url: stripQuery(event.request.url) };

  // `extra` is deliberately absent. Anything worth reporting should arrive as a typed field, not
  // as a bag whose contents nobody reviews.
  return scrubbed;
}

function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}
