/**
 * Occurrence timestamps for user event logs (docs/PROJECT_PLAN.md §4.1–§4.2).
 *
 * Every logged event stores four things about *when* it happened:
 *
 *   occurredAt                 the instant, UTC — gives ordering
 *   occurredLocalDate          the user's calendar day at that instant — gives day grouping
 *   occurredTz                 the IANA zone they were in — makes the above reconstructable
 *   occurredUtcOffsetMinutes   the offset then in force — disambiguates a repeated local hour
 *
 * Storing only the instant makes "today" ambiguous after travel or a DST change; storing only
 * local time loses ordering. Both are needed, and `occurredLocalDate` is computed **once, at
 * log time, in the user's zone** and never recomputed elsewhere. Risk R-02 in the project plan
 * names this the most likely source of silent data corruption in the product, because a
 * misfiled day corrupts every comparison the pattern engine later builds on it.
 *
 * This module is pure and has no platform dependencies beyond `Intl`.
 */

export type Occurrence = {
  /** ISO 8601 instant in UTC, e.g. `2026-08-24T02:00:00.000Z`. */
  occurredAt: string;
  /** `YYYY-MM-DD` as read on the user's calendar, in `occurredTz`. */
  occurredLocalDate: string;
  /** IANA zone name, e.g. `Europe/London`. */
  occurredTz: string;
  /** Minutes east of UTC at `occurredAt`, e.g. `60` for BST, `-240` for EDT. */
  occurredUtcOffsetMinutes: number;
};

type ZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new Error('Occurrence: invalid date.');
  }
}

function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new Error(`Occurrence: unknown time zone "${timeZone}".`);
  }
}

function requiredPart(parts: Record<string, string | undefined>, key: string): number {
  const value = parts[key];
  if (value === undefined) {
    throw new Error(`Occurrence: the platform's Intl implementation did not report "${key}".`);
  }
  return Number(value);
}

/** Wall-clock reading of `date` in `timeZone`, broken into numeric fields. */
function partsInZone(date: Date, timeZone: string): ZoneParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const collected: Record<string, string | undefined> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') collected[part.type] = part.value;
  }

  return {
    year: requiredPart(collected, 'year'),
    month: requiredPart(collected, 'month'),
    day: requiredPart(collected, 'day'),
    // Some engines render midnight as hour 24 under hour12: false.
    hour: requiredPart(collected, 'hour') % 24,
    minute: requiredPart(collected, 'minute'),
    second: requiredPart(collected, 'second'),
  };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * Minutes east of UTC in `timeZone` at `date` — positive east, negative west.
 *
 * Derived by reading the wall clock in the zone and asking how far it sits from the instant,
 * which is the only approach that stays correct across DST without a timezone database.
 */
export function utcOffsetMinutes(date: Date, timeZone: string): number {
  assertValidDate(date);
  assertValidTimeZone(timeZone);

  const parts = partsInZone(date, timeZone);
  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  // The wall clock carries no milliseconds, so compare against whole seconds or a log made at
  // .937 of a second would round to a bogus offset.
  const instantToWholeSecond = Math.floor(date.getTime() / 1000) * 1000;

  return Math.round((wallClockAsUtc - instantToWholeSecond) / 60_000);
}

/** The user's calendar day at `date`, as read in `timeZone`. Never the UTC day. */
export function localDateIn(date: Date, timeZone: string): string {
  assertValidDate(date);
  assertValidTimeZone(timeZone);

  const parts = partsInZone(date, timeZone);
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
}

/** Builds the four occurrence columns for a log made at `date` in `timeZone`. */
export function buildOccurrence(date: Date, timeZone: string): Occurrence {
  assertValidDate(date);
  assertValidTimeZone(timeZone);

  return {
    occurredAt: date.toISOString(),
    occurredLocalDate: localDateIn(date, timeZone),
    occurredTz: timeZone,
    occurredUtcOffsetMinutes: utcOffsetMinutes(date, timeZone),
  };
}

/**
 * The device's current IANA zone, falling back to UTC.
 *
 * The fallback is deliberate: a log filed under UTC is wrong by at most a day boundary and
 * stays analysable, whereas refusing to log because the platform is unhelpful would break the
 * product's first promise — that logging always works.
 */
export function resolveTimeZone(
  read: () => string | undefined = () => Intl.DateTimeFormat().resolvedOptions().timeZone
): string {
  let reported: string | undefined;
  try {
    reported = read();
  } catch {
    return 'UTC';
  }

  if (reported === undefined || reported === '') return 'UTC';

  try {
    assertValidTimeZone(reported);
  } catch {
    return 'UTC';
  }

  return reported;
}

/**
 * The wall-clock time a log was made, as read in the zone it was made in.
 *
 * Formatted from the *stored* zone rather than the device's current one, so a log made in
 * London still reads 21:30 after the user lands in New York. Re-rendering it in local time
 * would quietly rewrite their history.
 */
export function formatLocalTime(instant: string, timeZone: string): string {
  const date = new Date(instant);
  assertValidDate(date);

  const zone = (() => {
    try {
      assertValidTimeZone(timeZone);
      return timeZone;
    } catch {
      return 'UTC';
    }
  })();

  const parts = partsInZone(date, zone);
  return `${pad(parts.hour, 2)}:${pad(parts.minute, 2)}`;
}
