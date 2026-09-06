import { makeBowel, makeSymptom, makeWellbeing } from '@/domain/pattern-engine/fixtures/builders';
import type { DateRange, LogSet } from '@/domain/pattern-engine/observations';
import type { Finding } from '@/domain/pattern-engine/types';

import { buildAppointmentReport, REPORT_DISCLAIMER } from '../appointmentReport';
import { escapeHtml, renderReportHtml } from '../reportHtml';

/**
 * The report on paper (spec §71).
 *
 * Three things are worth pinning. Escaping, because a meal item is text a user typed and markup is
 * as unforgiving as a spreadsheet cell. The disclaimer and the absence of conclusions, because this
 * page is read by someone who never saw the app. And the structure, because a printed table with no
 * header row is unreadable and nobody notices until it is printed.
 */

const emptyLogs: LogSet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };
const RANGE: DateRange = { start: '2026-06-01', end: '2026-06-30' };
const GENERATED = new Date('2026-07-01T09:00:00.000Z');

const day = (n: number) => `2026-06-${String(n).padStart(2, '0')}`;

const html = (logs: LogSet = emptyLogs, findings: Finding[] = []) =>
  renderReportHtml(
    buildAppointmentReport({ logs, findings, range: RANGE, generatedAt: GENERATED })
  );

function aFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    engineVersion: '1.0.0',
    factor: { key: 'meal_item:dairy', label: 'Dairy', source: 'meal_item' },
    outcome: { kind: 'symptom_occurrence', symptomType: 'bloating' },
    analysisStart: '2026-06-01',
    analysisEnd: '2026-06-30',
    window: 'later_same_day',
    metrics: {
      exposedCount: 12,
      controlCount: 14,
      unknownCount: 4,
      exposedOutcomeRate: 0.5,
      controlOutcomeRate: 0.25,
      absoluteDifference: 0.25,
      relativeRisk: 2,
      exposedMeanSeverity: null,
      controlMeanSeverity: null,
      meanSeverityDifference: null,
      confidenceInterval: { low: 0.05, high: 0.45 },
    },
    consistency: { comparableWeeks: 4, agreeingWeeks: 3, agreementRate: 0.75 },
    confounders: [],
    trackingCompleteness: {
      totalDays: 30,
      daysWithAnyLog: 26,
      daysWithGoodState: 10,
      daysWithSymptom: 12,
      coverage: 26 / 30,
    },
    status: 'moderate',
    confidence: 0.6,
    limitations: [],
    generatedAt: '2026-07-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('escaping', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
  ])('escapes %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  // Ampersand must go first, or the entities it produces would be escaped again.
  it('does not double-escape', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });

  it('renders nothing for null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  // A meal item is text the user typed. It reaches markup exactly as it reaches a CSV cell.
  it('escapes a factor label that contains markup', () => {
    const finding = aFinding({
      factor: { key: 'x', label: '<script>alert(1)</script>', source: 'meal_item' },
    });

    const output = html(emptyLogs, [finding]);

    expect(output).not.toContain('<script>');
    expect(output).toContain('&lt;script&gt;');
  });

  // The failure that silently loses information rather than breaking anything visibly.
  it('keeps an ampersand in a name rather than mangling it', () => {
    const finding = aFinding({
      factor: { key: 'x', label: 'Fish & chips', source: 'meal_item' },
    });

    // Lower-cased because the sentence reads 'on days when you logged fish & chips' — what
    // matters is that the ampersand survived rather than mangling the name.
    expect(html(emptyLogs, [finding])).toContain('fish &amp; chips');
  });
});

describe('the document', () => {
  it('is a complete HTML document with a language and a charset', () => {
    const output = html();

    expect(output.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(output).toContain('<html lang="en">');
    expect(output).toContain('<meta charset="utf-8">');
  });

  it('names the period in the title and on the page', () => {
    const output = html();

    expect(output).toContain('<title>GutSignal record — 1 Jun 2026 to 30 Jun 2026</title>');
    expect(output).toContain('30 days · 1 Jun 2026 to 30 Jun 2026');
  });

  it('says when it was prepared', () => {
    expect(html()).toContain('Prepared 1 Jul 2026');
  });

  it('is deterministic', () => {
    const logs = { ...emptyLogs, symptoms: [makeSymptom(day(1))] };

    expect(html(logs)).toBe(html(logs));
  });
});

describe('print styling', () => {
  // §71: low ink. Dark fills and full-bleed colour are what a clinic printer handles worst.
  it('uses page margins and avoids splitting a section across a fold', () => {
    const output = html();

    expect(output).toContain('@page');
    expect(output).toContain('page-break-inside: avoid');
  });

  it('paints no dark backgrounds', () => {
    expect(html()).not.toMatch(/background(-color)?:\s*(#[0-9a-f]{3,6}|rgb|black)/i);
  });
});

describe('accessibility and structure', () => {
  it('has one first-level heading and a section heading for each part', () => {
    const output = html();

    expect(output.match(/<h1>/g)).toHaveLength(1);
    expect(output).toContain('<h2>How complete this record is</h2>');
    expect(output).toContain('<h2>Symptoms</h2>');
    expect(output).toContain('<h2>Bowel movements</h2>');
    expect(output).toContain('<h2>What was recorded together</h2>');
  });

  // A printed table whose columns are unlabelled is unreadable, and nobody notices until it is on
  // paper. Row headers are scoped so a screen reader on the HTML can follow it too.
  it('gives every table a header row and scoped row headers', () => {
    const output = html({ ...emptyLogs, symptoms: [makeSymptom(day(1))] });

    expect(output).toContain('<th scope="col">Symptom</th>');
    expect(output).toContain('<th scope="col">Bristol type</th>');
    expect(output).toContain('<th scope="row">');
  });
});

describe('what the page says', () => {
  it('shows counts with their denominators, not bare percentages', () => {
    const logs = {
      ...emptyLogs,
      symptoms: [makeSymptom(day(1)), makeSymptom(day(2))],
      wellbeing: [makeWellbeing(day(3)), makeWellbeing(day(4))],
    };

    expect(html(logs)).toContain('2 of the\n        4</strong> days you reported on');
  });

  // §59, restated on the page itself because a reader cannot be assumed to know it.
  it('explains that a gap is not a good day', () => {
    expect(html()).toMatch(/not the same as days that\s+went well/);
  });

  it('lists every Bristol type, including the ones never recorded', () => {
    const output = html({ ...emptyLogs, bowel: [makeBowel(day(1), { bristolType: 6 })] });

    expect(output).toContain('Separate hard lumps');
    expect(output).toContain('Entirely liquid');
    expect(output).toContain('Every type is listed, including those never recorded.');
  });

  it('names what it does not include rather than leaving a gap', () => {
    const output = html();

    expect(output).toContain('<h2>Not included</h2>');
    expect(output).toMatch(/Experiments/);
    expect(output).toMatch(/Medications/);
  });

  it('always carries the disclaimer', () => {
    expect(html()).toContain(escapeHtml(REPORT_DISCLAIMER));
  });
});

describe('findings on the page', () => {
  it('uses the same words the app uses, not a second vocabulary', () => {
    const output = html(emptyLogs, [aFinding()]);

    expect(output).toContain('Moderate signal');
    expect(output).toContain('Bloating was recorded more often on days when you logged dairy');
  });

  it('prints both rates with the days behind them', () => {
    const output = html(emptyLogs, [aFinding()]);

    expect(output).toMatch(/50% of\s+12 days when you logged dairy/);
    expect(output).toMatch(/25% of\s+14 days when you did not/);
  });

  it('gives confidence as a word rather than a number', () => {
    const output = html(emptyLogs, [aFinding()]);

    expect(output).toContain('Confidence: Moderate');
    expect(output).not.toContain('0.6');
  });

  it('carries every limitation onto the page', () => {
    const finding = aFinding({ limitations: ['This is based on 12 comparable days.'] });

    expect(html(emptyLogs, [finding])).toContain('This is based on 12 comparable days.');
  });

  // A clinician needs to know the scale of the search to judge the silence.
  it('says nothing stood out, and how much was compared, when there are no findings', () => {
    expect(html()).toMatch(/Nothing stood out in this period/);
  });
});

describe('what the page must never say', () => {
  // The whole reason the content model refuses conclusions: this is the page someone reads without
  // any of the app's context.
  // Patterns match *claims*, not topics. A bare /diagnos/ would fire on the disclaimer's own
  // 'It does not diagnose', which is required copy — the same trap safeLanguage.test.ts documents.
  it('contains no diagnostic or causal claim', () => {
    const output = html(
      { ...emptyLogs, symptoms: [makeSymptom(day(1))], bowel: [makeBowel(day(2))] },
      [aFinding()]
    );

    for (const forbidden of [
      /\bcauses your\b/i,
      /\bis a trigger\b/i,
      /\byou have (IBS|Crohn)/i,
      /\bintolerant\b/i,
      /\brecommend/i,
      /\bshould avoid\b/i,
    ]) {
      expect(output).not.toMatch(forbidden);
    }
  });

  it('has no summary or conclusion heading', () => {
    const output = html();

    expect(output).not.toMatch(/<h2>\s*(Summary|Conclusion|Assessment)/i);
  });
});

describe('the week-by-week table', () => {
  // Spec §70 asks for trends. A sparkline reads better on a screen and survives a photocopier
  // badly; a clinician can read numbers and point at one while asking about it.
  const fourWeeks = {
    ...emptyLogs,
    symptoms: [1, 5, 12, 26].map((n) => makeSymptom(day(n), { id: `s-${n}` })),
    wellbeing: [2, 6, 13, 27].map((n) => makeWellbeing(day(n), { id: `w-${n}` })),
  };

  it('appears once there is more than a pair of points', () => {
    const output = html(fourWeeks);

    expect(output).toContain('<h2>Week by week</h2>');
    expect(output).toContain('<th scope="col">Week ending</th>');
  });

  it('names each series in a column header', () => {
    expect(html(fourWeeks)).toContain('Days with symptoms');
  });

  // The §59 rule, all the way into a table cell: a column of zeroes reads as a good month.
  it('shows a dash for a week with nothing recorded, never a zero', () => {
    const output = html(fourWeeks);

    expect(output).toContain('—');
    expect(output).toMatch(/A dash means nothing was recorded that week/);
    expect(output).toMatch(/not the same as a week without\s+symptoms/);
  });

  it('explains what each column measures', () => {
    expect(html(fourWeeks)).toContain('Out of the days you reported on that week.');
  });

  // A section with one row of dashes is noise on a page meant to be concise.
  it('is absent entirely when there is nothing to plot', () => {
    expect(html({ ...emptyLogs, symptoms: [makeSymptom(day(1))] })).not.toContain(
      '<h2>Week by week</h2>'
    );
  });
});
