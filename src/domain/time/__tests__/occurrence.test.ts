import {
  buildOccurrence,
  formatDayHeading,
  formatLocalTime,
  previousLocalDate,
  resolveTimeZone,
  utcOffsetMinutes,
} from '../occurrence';

/**
 * Timezone behaviour is risk R-02 in docs/PROJECT_PLAN.md: the most likely source of silent
 * data corruption in this product. `occurred_local_date` decides which day a log belongs to,
 * and every pattern-engine window is built on it, so it is tested harder than anything else
 * in this slice.
 */
describe('utcOffsetMinutes', () => {
  it('is zero for UTC', () => {
    expect(utcOffsetMinutes(new Date('2026-08-24T12:00:00Z'), 'UTC')).toBe(0);
  });

  it('reports British Summer Time as +60', () => {
    expect(utcOffsetMinutes(new Date('2026-08-24T12:00:00Z'), 'Europe/London')).toBe(60);
  });

  it('reports Greenwich Mean Time as 0 in winter', () => {
    expect(utcOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Europe/London')).toBe(0);
  });

  it('reports negative offsets west of Greenwich', () => {
    expect(utcOffsetMinutes(new Date('2026-08-24T12:00:00Z'), 'America/New_York')).toBe(-240);
    expect(utcOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-300);
  });

  it('handles half-hour and three-quarter-hour zones', () => {
    expect(utcOffsetMinutes(new Date('2026-08-24T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
    expect(utcOffsetMinutes(new Date('2026-08-24T12:00:00Z'), 'Asia/Kathmandu')).toBe(345);
  });

  it('is unaffected by sub-second precision', () => {
    expect(utcOffsetMinutes(new Date('2026-08-24T12:00:00.937Z'), 'Asia/Kolkata')).toBe(330);
  });
});

describe('buildOccurrence — local date', () => {
  it('uses the local calendar day, not the UTC day', () => {
    // 02:00 UTC is still the previous evening in New York. Grouping by UTC date would file
    // this log under the wrong day and silently corrupt every comparison built on it.
    const occurrence = buildOccurrence(new Date('2026-08-24T02:00:00Z'), 'America/New_York');

    expect(occurrence.occurredLocalDate).toBe('2026-08-23');
    expect(occurrence.occurredUtcOffsetMinutes).toBe(-240);
  });

  it('keeps a 23:59 log on the day it was logged', () => {
    const occurrence = buildOccurrence(new Date('2026-08-24T22:59:00Z'), 'Europe/London');

    expect(occurrence.occurredLocalDate).toBe('2026-08-24'); // 23:59 BST
  });

  it('rolls to the next day one minute later', () => {
    const occurrence = buildOccurrence(new Date('2026-08-24T23:01:00Z'), 'Europe/London');

    expect(occurrence.occurredLocalDate).toBe('2026-08-25'); // 00:01 BST
  });

  it('files an early-hours log ahead of the UTC day east of Greenwich', () => {
    // 20:30 UTC is already the next morning in Auckland.
    const occurrence = buildOccurrence(new Date('2026-08-24T20:30:00Z'), 'Pacific/Auckland');

    expect(occurrence.occurredLocalDate).toBe('2026-08-25');
  });
});

describe('buildOccurrence — daylight saving transitions', () => {
  it('crosses the spring-forward boundary', () => {
    // Europe/London springs forward at 01:00 UTC on 2026-03-29.
    const before = buildOccurrence(new Date('2026-03-29T00:30:00Z'), 'Europe/London');
    const after = buildOccurrence(new Date('2026-03-29T01:30:00Z'), 'Europe/London');

    expect(before.occurredUtcOffsetMinutes).toBe(0);
    expect(after.occurredUtcOffsetMinutes).toBe(60);
    expect(before.occurredLocalDate).toBe('2026-03-29');
    expect(after.occurredLocalDate).toBe('2026-03-29');
  });

  it('crosses the autumn fall-back boundary', () => {
    // Europe/London falls back at 01:00 UTC on 2026-10-25. The local clock reads 01:30 twice;
    // the offset is what disambiguates them, which is exactly why it is stored.
    const first = buildOccurrence(new Date('2026-10-25T00:30:00Z'), 'Europe/London');
    const second = buildOccurrence(new Date('2026-10-25T01:30:00Z'), 'Europe/London');

    expect(first.occurredUtcOffsetMinutes).toBe(60);
    expect(second.occurredUtcOffsetMinutes).toBe(0);
    expect(first.occurredAt).not.toBe(second.occurredAt);
  });

  it('files a fall-back-night log on the correct local day', () => {
    const occurrence = buildOccurrence(new Date('2026-10-24T23:30:00Z'), 'Europe/London');

    expect(occurrence.occurredLocalDate).toBe('2026-10-25'); // 00:30 BST
  });
});

describe('buildOccurrence — travel', () => {
  it('records the zone the user was in at the moment of logging', () => {
    // The same instant, logged from two zones, is two different local days. Both are correct;
    // the stored zone is what makes the difference reconstructable later.
    const instant = new Date('2026-08-24T02:00:00Z');

    const london = buildOccurrence(instant, 'Europe/London');
    const newYork = buildOccurrence(instant, 'America/New_York');

    expect(london.occurredAt).toBe(newYork.occurredAt);
    expect(london.occurredLocalDate).toBe('2026-08-24');
    expect(newYork.occurredLocalDate).toBe('2026-08-23');
    expect(london.occurredTz).toBe('Europe/London');
    expect(newYork.occurredTz).toBe('America/New_York');
  });
});

describe('buildOccurrence — instant', () => {
  it('stores the instant as a UTC ISO 8601 string', () => {
    const occurrence = buildOccurrence(new Date('2026-08-24T02:00:00Z'), 'America/New_York');

    expect(occurrence.occurredAt).toBe('2026-08-24T02:00:00.000Z');
  });

  it('rejects an invalid date rather than storing NaN', () => {
    expect(() => buildOccurrence(new Date('nonsense'), 'UTC')).toThrow(/invalid date/i);
  });

  it('rejects an unknown time zone rather than silently falling back', () => {
    expect(() => buildOccurrence(new Date('2026-08-24T02:00:00Z'), 'Mars/Olympus')).toThrow(
      /time zone/i
    );
  });
});

describe('resolveTimeZone', () => {
  it('returns an IANA zone name', () => {
    expect(resolveTimeZone()).toMatch(/^[A-Za-z]+(\/[A-Za-z_+-]+)*$/);
  });

  it('falls back to UTC when the platform reports nothing usable', () => {
    expect(resolveTimeZone(() => undefined)).toBe('UTC');
    expect(resolveTimeZone(() => '')).toBe('UTC');
  });
});

describe('formatLocalTime', () => {
  it('reads the clock in the zone the log was made in', () => {
    expect(formatLocalTime('2026-08-24T20:30:00Z', 'Europe/London')).toBe('21:30');
    expect(formatLocalTime('2026-08-24T20:30:00Z', 'America/New_York')).toBe('16:30');
  });

  it('does not rewrite history when the user travels', () => {
    // The same log, rendered on a phone that has since moved zones, still reads the time the
    // user actually experienced.
    const loggedInLondon = formatLocalTime('2026-08-24T20:30:00Z', 'Europe/London');
    expect(loggedInLondon).toBe('21:30');
  });

  it('pads to a stable width', () => {
    expect(formatLocalTime('2026-08-24T08:05:00Z', 'UTC')).toBe('08:05');
    expect(formatLocalTime('2026-08-24T00:00:00Z', 'UTC')).toBe('00:00');
  });

  it('falls back to UTC rather than failing to render a stored log', () => {
    expect(formatLocalTime('2026-08-24T08:05:00Z', 'Mars/Olympus')).toBe('08:05');
  });
});

describe('formatDayHeading', () => {
  it('names today and yesterday', () => {
    expect(formatDayHeading('2026-08-24', '2026-08-24')).toBe('Today');
    expect(formatDayHeading('2026-08-23', '2026-08-24')).toBe('Yesterday');
  });

  it('crosses a month boundary correctly', () => {
    expect(formatDayHeading('2026-07-31', '2026-08-01')).toBe('Yesterday');
  });

  it('crosses a year boundary correctly', () => {
    expect(formatDayHeading('2025-12-31', '2026-01-01')).toBe('Yesterday');
  });

  it('handles a leap day', () => {
    expect(formatDayHeading('2028-02-29', '2028-03-01')).toBe('Yesterday');
  });

  it('spells out any other day', () => {
    expect(formatDayHeading('2026-08-20', '2026-08-24')).toBe('Thu 20 Aug');
  });

  it('never invents a heading for an unparseable date', () => {
    expect(formatDayHeading('not-a-date', '2026-08-24')).toBe('not-a-date');
  });
});

describe('previousLocalDate', () => {
  it('steps back one calendar day', () => {
    expect(previousLocalDate('2026-08-24')).toBe('2026-08-23');
    expect(previousLocalDate('2026-03-01')).toBe('2026-02-28');
    expect(previousLocalDate('2028-03-01')).toBe('2028-02-29');
    expect(previousLocalDate('2026-01-01')).toBe('2025-12-31');
  });
});
