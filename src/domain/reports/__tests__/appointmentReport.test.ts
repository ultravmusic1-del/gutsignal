import {
  makeBowel,
  makeSymptom,
  makeWellbeing,
  tombstone,
} from '@/domain/pattern-engine/fixtures/builders';
import type { DateRange, LogSet } from '@/domain/pattern-engine/observations';
import type { Finding } from '@/domain/pattern-engine/types';

import {
  buildAppointmentReport,
  REPORT_DISCLAIMER,
  type AppointmentReport,
} from '../appointmentReport';

/**
 * The report a person takes to an appointment (spec §70, §71).
 *
 * This is the only artefact that leaves the app and is read by someone who never saw the caveats on
 * screen, so most of these tests are about restraint rather than arithmetic: that a rate always
 * carries its denominator, that days with nothing recorded are counted separately from good days,
 * and that nothing on the page reads as a conclusion.
 */

const emptyLogs: LogSet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };

const RANGE: DateRange = { start: '2026-06-01', end: '2026-06-30' };
const GENERATED = new Date('2026-07-01T09:00:00.000Z');

const logsWith = (overrides: Partial<LogSet>): LogSet => ({ ...emptyLogs, ...overrides });

const report = (logs: LogSet, findings: Finding[] = []): AppointmentReport =>
  buildAppointmentReport({ logs, findings, range: RANGE, generatedAt: GENERATED });

const day = (n: number) => `2026-06-${String(n).padStart(2, '0')}`;

describe('the period', () => {
  it('names the span and both dates', () => {
    expect(report(emptyLogs).period.label).toBe('30 days · 1 Jun 2026 to 30 Jun 2026');
  });

  it('records when it was generated', () => {
    expect(report(emptyLogs).generatedAt).toBe('2026-07-01T09:00:00.000Z');
  });
});

describe('tracking completeness', () => {
  // §59, and the reason this section leads the report: a quiet fortnight means the person stopped
  // logging at least as often as it means they felt well.
  it('counts days with nothing recorded separately from good days', () => {
    const logs = logsWith({
      symptoms: [makeSymptom(day(1))],
      wellbeing: [makeWellbeing(day(2))],
    });

    const tracking = report(logs).tracking;

    expect(tracking.totalDays).toBe(30);
    expect(tracking.daysLogged).toBe(2);
    expect(tracking.daysRecordedAsGood).toBe(1);
    expect(tracking.daysWithNothingRecorded).toBe(28);
  });

  // A day of meals says what was eaten and nothing about how it went.
  it('separates days logged from days the person reported on', () => {
    const logs = logsWith({
      bowel: [makeBowel(day(1))],
      symptoms: [makeSymptom(day(2))],
    });

    const tracking = report(logs).tracking;

    expect(tracking.daysLogged).toBe(2);
    expect(tracking.daysReportedOn).toBe(1);
  });

  it('reports an untouched period honestly rather than as all-good', () => {
    const tracking = report(emptyLogs).tracking;

    expect(tracking.daysWithNothingRecorded).toBe(30);
    expect(tracking.daysRecordedAsGood).toBe(0);
  });
});

describe('symptoms', () => {
  // "40% of days" is a claim; "12 of the 30 days you reported on" is evidence.
  it('carries the denominator with the count, and names what it counts', () => {
    const logs = logsWith({
      symptoms: [makeSymptom(day(1)), makeSymptom(day(2))],
      wellbeing: [makeWellbeing(day(3)), makeWellbeing(day(4))],
    });

    expect(report(logs).symptoms.anySymptom).toEqual({
      count: 2,
      outOf: 4,
      basis: 'days you reported on',
    });
  });

  it('counts a symptom once per day however often it was recorded', () => {
    const logs = logsWith({
      symptoms: [
        makeSymptom(day(1), { id: 'a', hour: 9 }),
        makeSymptom(day(1), { id: 'b', hour: 18 }),
      ],
    });

    expect(report(logs).symptoms.bySymptom).toEqual([
      { symptom: 'bloating', label: 'Bloating', days: 1 },
    ]);
  });

  it('orders symptoms by how often they occurred', () => {
    const logs = logsWith({
      symptoms: [
        makeSymptom(day(1), { type: 'cramping', id: 'c1' }),
        makeSymptom(day(2), { type: 'bloating', id: 'b1' }),
        makeSymptom(day(3), { type: 'bloating', id: 'b2' }),
      ],
    });

    expect(report(logs).symptoms.bySymptom.map((entry) => entry.symptom)).toEqual([
      'bloating',
      'cramping',
    ]);
  });

  // The day's worst reading, matching the pattern engine and the trend chart.
  it('averages the worst reading of each symptom day', () => {
    const logs = logsWith({
      symptoms: [
        makeSymptom(day(1), { severity: 4, id: 'a' }),
        makeSymptom(day(1), { severity: 8, id: 'b' }),
        makeSymptom(day(2), { severity: 6, id: 'c' }),
      ],
    });

    expect(report(logs).symptoms.meanWorstSeverity).toBe(7);
    expect(report(logs).symptoms.severityDays).toBe(2);
  });

  // Zero would read as "no discomfort at all", which is a stronger claim than the diary makes.
  it('reports no severity at all rather than zero when nothing was recorded', () => {
    expect(report(emptyLogs).symptoms.meanWorstSeverity).toBeNull();
  });
});

describe('bowel movements', () => {
  it('counts entries and the days they fell on', () => {
    const logs = logsWith({
      bowel: [
        makeBowel(day(1), { id: 'a', hour: 8 }),
        makeBowel(day(1), { id: 'b', hour: 20 }),
        makeBowel(day(5), { id: 'c' }),
      ],
    });

    const bowel = report(logs).bowel;

    expect(bowel.entries).toBe(3);
    expect(bowel.daysWithAnEntry).toBe(2);
  });

  it('reports a weekly rate over the period', () => {
    const logs = logsWith({
      bowel: Array.from({ length: 30 }, (_, index) =>
        makeBowel(day(index + 1), { id: `b-${index}` })
      ),
    });

    expect(report(logs).bowel.perWeek).toBe(7);
  });

  // A distribution missing its empty bars is not a distribution, and the absences are what a
  // clinician reads.
  it('lists every Bristol type, including the ones with no entries', () => {
    const logs = logsWith({ bowel: [makeBowel(day(1), { bristolType: 6 })] });
    const bristol = report(logs).bowel.bristol;

    expect(bristol).toHaveLength(7);
    expect(bristol.map((entry) => entry.type)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(bristol.find((entry) => entry.type === 6)?.count).toBe(1);
    expect(bristol.find((entry) => entry.type === 1)?.count).toBe(0);
  });

  it('describes each type rather than leaving a bare number', () => {
    expect(report(emptyLogs).bowel.bristol[0]?.description.length).toBeGreaterThan(0);
  });
});

describe('deleted entries', () => {
  // A tombstone is how a deletion replicates. It is not part of the record shown to a clinician.
  it('are absent from every section', () => {
    const logs = logsWith({
      symptoms: [tombstone(makeSymptom(day(1)))],
      bowel: [tombstone(makeBowel(day(1)))],
    });

    const built = report(logs);

    expect(built.symptoms.anySymptom.count).toBe(0);
    expect(built.bowel.entries).toBe(0);
    expect(built.tracking.daysLogged).toBe(0);
  });
});

describe('what the report refuses to do', () => {
  // Spec §70 says avoid generic conclusions. The honest form is a page of observations rather than
  // a page of interpretations someone has to unpick.
  it('has no summary, headline or conclusion field', () => {
    const built = report(emptyLogs) as unknown as Record<string, unknown>;

    for (const forbidden of ['summary', 'headline', 'conclusion', 'diagnosis', 'assessment']) {
      expect(built[forbidden]).toBeUndefined();
    }
  });

  it('always carries the disclaimer, whatever else is on the page', () => {
    expect(report(emptyLogs).disclaimer).toBe(REPORT_DISCLAIMER);
  });

  it('says in the disclaimer that it neither diagnoses nor establishes cause', () => {
    expect(REPORT_DISCLAIMER).toMatch(/does not diagnose/i);
    expect(REPORT_DISCLAIMER).toMatch(/caused/i);
    expect(REPORT_DISCLAIMER).toMatch(/not a clinical measurement/i);
  });

  // A section that is missing and a section that is empty read identically on paper, and only one
  // of them is true.
  it('names the sections it cannot fill yet', () => {
    const notIncluded = report(emptyLogs).notIncluded.join(' ');

    expect(notIncluded).toMatch(/experiments/i);
    expect(notIncluded).toMatch(/medications/i);
  });
});

describe('determinism', () => {
  it('produces the same report twice from the same diary', () => {
    const logs = logsWith({
      symptoms: [makeSymptom(day(1)), makeSymptom(day(2), { type: 'cramping' })],
      bowel: [makeBowel(day(1))],
    });

    expect(report(logs)).toEqual(report(logs));
  });
});

describe('trends', () => {
  // Spec §70 asks for trends by name, and it was the one required section the report lacked.
  const fourWeeks = (): LogSet =>
    logsWith({
      symptoms: [1, 8, 15, 22].map((n) => makeSymptom(day(n), { id: `s-${n}`, severity: 5 })),
      wellbeing: [2, 9, 16, 23].map((n) => makeWellbeing(day(n), { id: `w-${n}` })),
    });

  it('includes weekly series once there are enough weeks to be a line', () => {
    const trends = report(fourWeeks()).trends;

    expect(trends.length).toBeGreaterThan(0);
    expect(trends.every((series) => series.hasTrend)).toBe(true);
  });

  // Two points make a line that reads as a direction while carrying none, and a printed page
  // cannot be asked questions.
  it('omits a series with too few weeks to say anything', () => {
    const logs = logsWith({ symptoms: [makeSymptom(day(1))] });

    expect(report(logs).trends.every((series) => series.hasTrend)).toBe(true);
  });

  // "Days you logged" is 0% for an unlogged week rather than absent, so it legitimately has a
  // trend even for an empty diary — and for an empty diary it is the only true thing to plot.
  it('plots only the logging series for an empty diary', () => {
    expect(report(emptyLogs).trends.map((series) => series.key)).toEqual(['logging_days']);
  });

  // The §59 distinction has to survive into the report, not just the engine. Buckets run back
  // from the end of the range, so days 17–23 are the untouched week here.
  it('leaves an unlogged week without a value rather than at zero', () => {
    const logs = logsWith({
      symptoms: [1, 5, 12, 26].map((n) => makeSymptom(day(n), { id: `s-${n}` })),
      wellbeing: [2, 6, 13, 27].map((n) => makeWellbeing(day(n), { id: `w-${n}` })),
    });

    const series = report(logs).trends.find((entry) => entry.key === 'symptom_days');

    expect(series).toBeDefined();
    expect(series?.points.filter((point) => point.value === null)).toHaveLength(1);
  });
});
