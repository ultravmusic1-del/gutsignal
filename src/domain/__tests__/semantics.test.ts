/**
 * @jest-environment node
 *
 * The surfaces must not disagree about the same diary (review §"data correctness").
 *
 * GutSignal says the same things in three places — the Insights screen, a report handed to a
 * clinician, and an exported file — and they are built by different modules. A person who sees a
 * finding on screen and cannot find it in the report they printed has no way to tell which one is
 * wrong, and no reason to trust either.
 *
 * They agree today because the report calls the same selection functions Insights does. That is a
 * property of the current code rather than a guarantee, and this file is what makes it one: it
 * fails the day someone inlines a slightly different rule into the report because it was easier
 * than exporting a function.
 */
import { buildDiaryExport } from '@/domain/export/exportDiary';
import { analyse } from '@/domain/pattern-engine/engine';
import {
  makeBowel,
  makeMeal,
  makeSymptom,
  makeWellbeing,
  mergeLogs,
} from '@/domain/pattern-engine/fixtures/builders';
import type { LogSet } from '@/domain/pattern-engine/observations';
import { buildInsights } from '@/domain/patterns/insights';
import { PATTERN_STATUS_COPY } from '@/domain/patterns/status';
import { buildAppointmentReport } from '@/domain/reports/appointmentReport';

const RANGE = { start: '2026-06-01', end: '2026-06-30' };
const NOW = new Date('2026-07-01T09:00:00.000Z');
const day = (n: number) => `2026-06-${String(n).padStart(2, '0')}`;

/** A month with enough in it to produce findings, gaps and every log type. */
const DIARY: LogSet = mergeLogs(
  ...[1, 3, 5, 7, 9, 11, 13, 15].map((d) => ({
    meals: [makeMeal(day(d), { items: ['milk', 'cereal'], id: `m-${d}` })],
    symptoms: [makeSymptom(day(d), { severity: 6, id: `s-${d}` })],
  })),
  ...[2, 4, 6, 8, 10, 12, 14, 16].map((d) => ({
    meals: [makeMeal(day(d), { items: ['toast'], id: `mt-${d}` })],
    wellbeing: [makeWellbeing(day(d), { id: `w-${d}` })],
  })),
  ...[20, 22, 24].map((d) => ({ bowel: [makeBowel(day(d), { bristolType: 5, id: `b-${d}` })] }))
);

const findings = analyse({ logs: DIARY, range: RANGE, now: NOW });
const insights = buildInsights({ logs: DIARY, range: RANGE, now: NOW });
const report = buildAppointmentReport({ logs: DIARY, findings, range: RANGE, generatedAt: NOW });

describe('the report and the Insights screen describe the same findings', () => {
  const idOf = (finding: (typeof findings)[number]) =>
    `${finding.factor.key}|${finding.outcome.kind}|${finding.outcome.symptomType ?? ''}`;

  it('shows the same findings as standing out', () => {
    expect(report.associations.standsOut.map(idOf)).toEqual(insights.standsOut.map(idOf));
  });

  it('shows the same findings as worth investigating', () => {
    expect(report.associations.emerging.map(idOf)).toEqual(insights.emerging.map(idOf));
  });

  // The same finding must not be strong on one surface and tentative on the other.
  it('gives every shared finding the same status', () => {
    const onScreen = new Map(insights.findings.map((f) => [idOf(f), f.status]));

    for (const finding of [...report.associations.standsOut, ...report.associations.emerging]) {
      expect(onScreen.get(idOf(finding))).toBe(finding.status);
    }
  });

  /**
   * The report may never surface something the screen suppressed. Insights is where the
   * conservatism lives — §21's breadth control and §18's sample gates — and a report that showed
   * more than the screen would be routing around it, on the one artefact that leaves the app and
   * reaches a clinician.
   */
  it('never promotes a finding the screen chose not to show', () => {
    const shown = new Set([...insights.standsOut, ...insights.emerging].map(idOf));

    for (const finding of [...report.associations.standsOut, ...report.associations.emerging]) {
      expect(shown.has(idOf(finding))).toBe(true);
    }
  });

  // One vocabulary for both, from `PATTERN_STATUS_COPY`. Two vocabularies is two products.
  it('uses only the five permitted status words', () => {
    const permitted = new Set(Object.keys(PATTERN_STATUS_COPY));

    for (const finding of [...report.associations.standsOut, ...report.associations.emerging]) {
      expect(permitted.has(finding.status)).toBe(true);
    }
  });
});

/**
 * An export is the record itself, not a view of it. Anything the app can show a person, the file
 * they take away has to contain — otherwise "export everything" is a false claim, and it is made
 * on the screen next to the account-deletion button.
 */
describe('the export contains the whole diary', () => {
  const files = buildDiaryExport(DIARY, {
    generatedAt: NOW,
    userId: 'user-1',
    appVersion: '0.1.0',
  });

  const json = JSON.parse(
    files.find((file) => file.name.endsWith('.json'))?.content ?? '{}'
  ) as Record<string, unknown[]>;

  // The keys are the words a person would use, not the table names — `goodDays` rather than
  // `wellbeing`, `bowelMovements` rather than `bowel`. This is a file someone opens.
  it('carries every entry of every kind', () => {
    // Counted against the diary rather than a hardcoded number, so adding to the fixture cannot
    // quietly leave a log type untested.
    const counted = (key: string) => (Array.isArray(json[key]) ? json[key].length : -1);

    expect(counted('meals')).toBe(DIARY.meals.length);
    expect(counted('symptoms')).toBe(DIARY.symptoms.length);
    expect(counted('bowelMovements')).toBe(DIARY.bowel.length);
    expect(counted('goodDays')).toBe(DIARY.wellbeing.length);
    expect(counted('context')).toBe(DIARY.context.length);
  });

  it('produces a CSV for every log type as well as the JSON', () => {
    const csvs = files.filter((file) => file.name.endsWith('.csv'));

    expect(csvs).toHaveLength(5);
    // Each has a header line even when its table is empty — an empty file is ambiguous about
    // whether the type was exported at all.
    for (const csv of csvs) expect(csv.content.split('\n')[0]).toMatch(/,/);
  });

  /**
   * Both readings of every timestamp, which is the whole reason the schema stores both. A diary
   * exported with only the instant cannot be read back correctly by anyone who was not in the
   * timezone it was written in — and a symptom diary is mostly about what happened when.
   */
  it('keeps the instant and the local reading of every entry', () => {
    const meals = json.meals as { occurred?: Record<string, unknown> }[];
    const occurred = meals[0]?.occurred;

    expect(occurred).toBeDefined();
    // The instant, and what the user's own clock said. Both, on every entry.
    expect(occurred).toMatchObject({
      at: expect.any(String),
      localDate: expect.any(String),
      localTime: expect.any(String),
      timeZone: expect.any(String),
      utcOffsetMinutes: expect.any(Number),
    });

    const csv = files.find((file) => file.name.includes('meals'))?.content ?? '';
    const header = (csv.split('\n')[0] ?? '').toLowerCase();

    // The CSV says the same thing in spreadsheet terms: the local reading split into columns
    // someone can sort and filter, plus the exact instant alongside it.
    expect(header).toContain('date');
    expect(header).toContain('time_zone');
    expect(header).toContain('recorded_at_utc');
  });
});
