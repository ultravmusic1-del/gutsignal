import { buildOccurrence } from '@/domain/time/occurrence';

import { analyse } from '../engine';
import { makeMeal, makeSymptom, makeWellbeing, mergeLogs } from '../fixtures/builders';
import { buildDays, trackingCompleteness, type LogSet } from '../observations';

/**
 * Timezones, end to end (risk R-02, spec §59).
 *
 * `occurrence.test.ts` proves `buildOccurrence` files an instant under the right local date, and
 * `observations.test.ts` proves the engine groups by that date. Both can be right while the app is
 * wrong, because nothing joins them: the write path derives a local date and the read path trusts
 * it, so a disagreement between the two is invisible to either test.
 *
 * These therefore build their logs the way the app does — from a real instant and a real zone,
 * through `buildOccurrence` — and then run the engine over the result. A day boundary is the unit
 * the entire pattern engine counts in, so getting one wrong does not raise an error. It produces a
 * confident finding about the wrong days.
 */

/** A log written the way the app writes one: from an instant and the zone the user was in. */
function loggedAt(instant: string, timeZone: string) {
  const occurrence = buildOccurrence(new Date(instant), timeZone);

  return {
    localDate: occurrence.occurredLocalDate,
    at: occurrence.occurredAt,
    tz: occurrence.occurredTz,
    offsetMinutes: occurrence.occurredUtcOffsetMinutes,
  };
}

const daysWithSymptoms = (logs: LogSet, range: { start: string; end: string }) =>
  buildDays(logs, range).filter((day) => day.symptoms.length > 0);

describe('the same instant in two zones is two different days', () => {
  // 22:00 UTC is already the 16th in Bahrain (+3) and still the 15th in London.
  const INSTANT = '2026-03-15T22:00:00.000Z';

  it('files an instant under the local day the user was actually living in', () => {
    expect(loggedAt(INSTANT, 'Asia/Bahrain').localDate).toBe('2026-03-16');
    expect(loggedAt(INSTANT, 'Europe/London').localDate).toBe('2026-03-15');
  });

  it('groups two such logs into different days rather than merging them', () => {
    const bahrain = loggedAt(INSTANT, 'Asia/Bahrain');
    const london = loggedAt(INSTANT, 'Europe/London');

    const logs = mergeLogs(
      { symptoms: [makeSymptom(bahrain.localDate, { id: 's-bh', ...bahrain })] },
      { symptoms: [makeSymptom(london.localDate, { id: 's-ldn', ...london })] }
    );

    expect(
      daysWithSymptoms(logs, { start: '2026-03-14', end: '2026-03-17' }).map((day) => day.localDate)
    ).toEqual(['2026-03-15', '2026-03-16']);
  });
});

/**
 * Travel: the user flies Bahrain to London mid-diary, so the offset changes underneath them.
 *
 * The rule being protected is that an entry belongs to the day it was made in, in the place it was
 * made. Re-deriving a local date later from the instant and the user's *current* zone would shift
 * every pre-flight entry by three hours — enough to move a late-evening log onto the previous day
 * and quietly change what the engine compares.
 */
describe('travelling between zones', () => {
  const RANGE = { start: '2026-06-01', end: '2026-06-10' };

  /**
   * Every instant here is chosen so its **UTC date differs from its local date** — late evening in
   * UTC is already tomorrow in Bahrain, and 23:30 UTC is tomorrow in British Summer Time.
   *
   * That is not incidental. An earlier draft of this file used mid-evening instants where the two
   * dates happened to agree, and the tests passed while grouping by the UTC date would also have
   * passed. A test that cannot fail is not evidence, so the times were chosen to make the two
   * readings disagree on every single day.
   */
  // Bahrain is UTC+3 all year: 21:30 UTC is 00:30 the next morning.
  const beforeFlight = ['05-31', '06-01', '06-02', '06-03', '06-04'].map((day) =>
    loggedAt(`2026-${day}T21:30:00.000Z`, 'Asia/Bahrain')
  );
  // London in June is UTC+1: 23:30 UTC is 00:30 the next morning.
  const afterFlight = ['06-05', '06-06', '06-07', '06-08', '06-09'].map((day) =>
    loggedAt(`2026-${day}T23:30:00.000Z`, 'Europe/London')
  );

  const logs = mergeLogs(
    ...beforeFlight.map((occurrence, i) => ({
      symptoms: [makeSymptom(occurrence.localDate, { id: `bh-${i}`, ...occurrence })],
    })),
    ...afterFlight.map((occurrence, i) => ({
      symptoms: [makeSymptom(occurrence.localDate, { id: `ldn-${i}`, ...occurrence })],
    }))
  );

  const EXPECTED_DAYS = [
    '2026-06-01',
    '2026-06-02',
    '2026-06-03',
    '2026-06-04',
    '2026-06-05',
    '2026-06-06',
    '2026-06-07',
    '2026-06-08',
    '2026-06-09',
    '2026-06-10',
  ];

  // Asserted through `buildDays`, not by reading the field back off the occurrence. Reading the
  // field only proves `buildOccurrence` computed it; grouping is what the engine actually does
  // with it, and the join between the two is the thing that has never been tested.
  it('keeps every entry on the day it was made, in the place it was made', () => {
    expect(daysWithSymptoms(logs, RANGE).map((day) => day.localDate)).toEqual(EXPECTED_DAYS);
  });

  // Each instant falls on the previous UTC day, so grouping by the instant would shift the whole
  // diary back one day and push the first entry out of the range entirely.
  it('does not group by the instant, which would move every entry', () => {
    const utcDates = [...beforeFlight, ...afterFlight].map((o) => o.at.slice(0, 10));

    expect(utcDates).not.toEqual(EXPECTED_DAYS);
    expect(utcDates.every((utcDate, i) => utcDate !== EXPECTED_DAYS[i])).toBe(true);
  });

  it('produces ten distinct days across the move, not nine and not eleven', () => {
    const days = daysWithSymptoms(logs, RANGE);

    expect(days).toHaveLength(10);
    expect(new Set(days.map((day) => day.localDate)).size).toBe(10);
  });

  it('counts every one of them as a day the user reported on', () => {
    expect(trackingCompleteness(buildDays(logs, RANGE))).toMatchObject({
      totalDays: 10,
      daysWithSymptom: 10,
    });
  });

  // Each entry keeps the offset that applied at the moment, which is what makes the day
  // reconstructable later without knowing where the user lives now.
  it('records the offset that applied at the time, not one shared offset', () => {
    expect(beforeFlight[0]!.offsetMinutes).toBe(180);
    expect(afterFlight[0]!.offsetMinutes).toBe(60);
  });
});

/**
 * Daylight saving. One local day is 23 hours long and another is 25, and neither is a special case
 * anywhere in the engine — which is the point. A day is whatever the user's own calendar called it.
 */
describe('daylight saving transitions', () => {
  it('treats the 23-hour spring-forward day as exactly one day', () => {
    // London springs forward at 01:00 UTC on 2026-03-29.
    const before = loggedAt('2026-03-29T00:30:00.000Z', 'Europe/London');
    const after = loggedAt('2026-03-29T09:00:00.000Z', 'Europe/London');

    expect(before.localDate).toBe('2026-03-29');
    expect(after.localDate).toBe('2026-03-29');

    const logs = mergeLogs(
      { symptoms: [makeSymptom(before.localDate, { id: 'dst-a', ...before })] },
      { symptoms: [makeSymptom(after.localDate, { id: 'dst-b', ...after })] }
    );

    const days = daysWithSymptoms(logs, { start: '2026-03-28', end: '2026-03-30' });

    expect(days).toHaveLength(1);
    expect(days[0]!.symptoms).toHaveLength(2);
  });

  /**
   * The day British Summer Time begins is also the day the UTC and local dates start disagreeing
   * in the evening. An entry at 23:30 UTC belongs to the *next* local day, and grouping by the
   * instant would file it a day early — on a diary that spans a DST change, that error appears
   * partway through and moves half the record relative to the other half.
   */
  it('rolls the local day at the new offset once summer time has begun', () => {
    const lateEvening = loggedAt('2026-03-29T23:30:00.000Z', 'Europe/London');

    expect(lateEvening.offsetMinutes).toBe(60);
    expect(lateEvening.localDate).toBe('2026-03-30');
    expect(lateEvening.at.slice(0, 10)).toBe('2026-03-29');

    const logs = mergeLogs({
      symptoms: [makeSymptom(lateEvening.localDate, { id: 'bst', ...lateEvening })],
    });

    expect(
      daysWithSymptoms(logs, { start: '2026-03-28', end: '2026-03-31' }).map((day) => day.localDate)
    ).toEqual(['2026-03-30']);
  });

  /**
   * The fall-back night runs 01:00–02:00 local twice. Two logs an hour apart in UTC therefore show
   * the same wall-clock time, and the recorded offset is the only thing that tells them apart.
   * Both still belong to the same local day.
   */
  it('files both halves of the repeated fall-back hour on the same day', () => {
    const firstPass = loggedAt('2026-10-25T00:30:00.000Z', 'Europe/London');
    const secondPass = loggedAt('2026-10-25T01:30:00.000Z', 'Europe/London');

    expect(firstPass.localDate).toBe('2026-10-25');
    expect(secondPass.localDate).toBe('2026-10-25');
    // British Summer Time, then Greenwich Mean Time: the same wall clock, an hour apart.
    expect(firstPass.offsetMinutes).toBe(60);
    expect(secondPass.offsetMinutes).toBe(0);
  });
});

/**
 * The rule the whole engine rests on (§59), asserted where a user would feel it rather than at the
 * function implementing it: a day with only a meal on it says nothing about symptoms, and must
 * never be counted as a day that went well.
 */
describe('a day nobody reported on stays unknown, across a zone change', () => {
  const RANGE = { start: '2026-06-01', end: '2026-06-06' };

  it('counts a meal-only day as neither good nor bad', () => {
    const mealOnly = loggedAt('2026-06-02T18:00:00.000Z', 'Asia/Bahrain');
    const reportedGood = loggedAt('2026-06-03T20:00:00.000Z', 'Europe/London');

    const logs = mergeLogs(
      { meals: [makeMeal(mealOnly.localDate, { items: ['dairy'], id: 'm-1', ...mealOnly })] },
      { wellbeing: [makeWellbeing(reportedGood.localDate, { id: 'w-1', ...reportedGood })] }
    );

    const completeness = trackingCompleteness(buildDays(logs, RANGE));

    // Two days carry something, but only one says anything about how the user felt.
    expect(completeness.daysWithAnyLog).toBe(2);
    expect(completeness.daysWithGoodState).toBe(1);
    expect(completeness.daysWithSymptom).toBe(0);
  });

  // And the engine says nothing rather than inventing a control group out of the silence.
  it('refuses to claim a strong signal when there are no control days at all', () => {
    const logs = mergeLogs(
      ...['01', '02', '03', '04', '05'].map((day) => {
        const occurrence = loggedAt(`2026-06-${day}T18:00:00.000Z`, 'Asia/Bahrain');

        return {
          meals: [
            makeMeal(occurrence.localDate, { items: ['dairy'], id: `m-${day}`, ...occurrence }),
          ],
          symptoms: [makeSymptom(occurrence.localDate, { id: `s-${day}`, ...occurrence })],
        };
      })
    );

    const findings = analyse({ logs, range: RANGE, now: new Date('2026-06-07T00:00:00.000Z') });

    expect(findings.every((finding) => finding.status !== 'stronger_recurring_signal')).toBe(true);
  });
});
