/**
 * The appointment report as printable HTML (spec §71).
 *
 * `appointmentReport.ts` decided what may be said; this decides how it looks on paper. Everything
 * §71 asks for turns out to point the same way — legible, printable, concise, accessible,
 * professional, **low ink** — and low ink is the constraint that does the most work: no dark fills,
 * no full-bleed colour, no boxes. Rules and whitespace instead, which is also what makes a page
 * photocopy and fax legibly, and a clinic printer is not a Retina display.
 *
 * **Every interpolated value is escaped.** A meal item is text the user typed, and it lands in
 * markup here exactly as it lands in a spreadsheet cell in `domain/export/csv.ts` — the same class
 * of problem, and it gets the same treatment rather than trust. The output is printed rather than
 * browsed, so the realistic damage is a mangled page rather than script execution, but a report
 * that silently loses a meal name because it contained an ampersand is a report that lies.
 *
 * Pure: a string in, a string out, no `Date.now()`. The PDF step is somebody else's problem.
 */

import type { Finding } from '@/domain/pattern-engine/types';
import type { TrendSeries } from '@/domain/patterns/trends';
import {
  confidenceWord,
  exposurePhrases,
  formatLocalDate,
  observationSentence,
  thingsToConsider,
} from '@/domain/patterns/findingDetail';
import { PATTERN_STATUS_COPY } from '@/domain/patterns/status';

import type { AppointmentReport } from './appointmentReport';

/**
 * Text, safe to place in markup.
 *
 * All five, not the three people remember: `&` must go first or it would double-escape the others,
 * and the quotes matter because a value could later be interpolated into an attribute.
 */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const percent = (part: number, whole: number) =>
  whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;

/**
 * Print styling, inline because the file is handed to a renderer with no stylesheet of its own.
 *
 * Deliberately austere. `@page` margins keep it inside a clinic printer's unprintable edge, and
 * `page-break-inside: avoid` stops a section splitting across a fold — a Bristol table broken over
 * two pages is a table nobody reads.
 */
const STYLE = `
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 11pt; line-height: 1.45; color: #111; margin: 0;
  }
  h1 { font-size: 17pt; margin: 0 0 2mm; }
  h2 {
    font-size: 12pt; margin: 8mm 0 2mm; padding-bottom: 1mm;
    border-bottom: 1px solid #999;
  }
  p { margin: 0 0 2mm; }
  section { page-break-inside: avoid; }
  .meta { color: #444; font-size: 9.5pt; margin: 0 0 1mm; }
  .note { color: #444; font-size: 9.5pt; }
  table { border-collapse: collapse; width: 100%; margin: 2mm 0; }
  th, td { text-align: left; padding: 1.5mm 2mm; border-bottom: 1px solid #ddd; }
  th { font-weight: 600; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  .finding { margin: 0 0 4mm; }
  .finding .status { font-size: 9.5pt; letter-spacing: 0.04em; text-transform: uppercase; }
  .disclaimer {
    margin-top: 8mm; padding-top: 3mm; border-top: 1px solid #999;
    font-size: 9.5pt; color: #333;
  }
`;

function trackingSection(report: AppointmentReport): string {
  const { tracking } = report;

  const rows: [string, number, string][] = [
    ['Days in this period', tracking.totalDays, ''],
    ['Days with any entry', tracking.daysLogged, percent(tracking.daysLogged, tracking.totalDays)],
    [
      'Days you said how you felt',
      tracking.daysReportedOn,
      percent(tracking.daysReportedOn, tracking.totalDays),
    ],
    ['Days with symptoms recorded', tracking.daysWithSymptoms, ''],
    ['Days recorded as good', tracking.daysRecordedAsGood, ''],
    ['Days with nothing recorded', tracking.daysWithNothingRecorded, ''],
  ];

  return `
    <section>
      <h2>How complete this record is</h2>
      <table>
        <tbody>
          ${rows
            .map(
              ([label, value, share]) => `<tr>
                <th scope="row">${escapeHtml(label)}</th>
                <td class="n">${escapeHtml(value)}</td>
                <td class="n">${escapeHtml(share)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <p class="note">
        Days with nothing recorded are counted on their own. They are not the same as days that
        went well — a gap usually means nothing was logged, not that nothing happened.
      </p>
    </section>`;
}

function symptomSection(report: AppointmentReport): string {
  const { symptoms } = report;
  const { anySymptom } = symptoms;

  const severity =
    symptoms.meanWorstSeverity === null
      ? '<p>No symptom intensity was recorded in this period.</p>'
      : `<p>Average intensity on days with symptoms:
           <strong>${escapeHtml(symptoms.meanWorstSeverity)} out of 10</strong>,
           across ${escapeHtml(symptoms.severityDays)}
           ${symptoms.severityDays === 1 ? 'day' : 'days'}. Each day counts once, at its
           strongest reading.</p>`;

  const breakdown =
    symptoms.bySymptom.length === 0
      ? '<p>No symptoms were recorded in this period.</p>'
      : `<table>
          <thead>
            <tr><th scope="col">Symptom</th><th scope="col" class="n">Days recorded</th></tr>
          </thead>
          <tbody>
            ${symptoms.bySymptom
              .map(
                (entry) => `<tr>
                  <th scope="row">${escapeHtml(entry.label)}</th>
                  <td class="n">${escapeHtml(entry.days)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`;

  return `
    <section>
      <h2>Symptoms</h2>
      <p>
        Symptoms on <strong>${escapeHtml(anySymptom.count)} of the
        ${escapeHtml(anySymptom.outOf)}</strong> ${escapeHtml(anySymptom.basis)}.
      </p>
      ${severity}
      ${breakdown}
    </section>`;
}

function bowelSection(report: AppointmentReport): string {
  const { bowel } = report;

  const rate =
    bowel.perWeek === null
      ? ''
      : `<p><strong>${escapeHtml(bowel.entries)}</strong> recorded in total —
           about <strong>${escapeHtml(bowel.perWeek)} a week</strong>, on
           ${escapeHtml(bowel.daysWithAnEntry)}
           ${bowel.daysWithAnEntry === 1 ? 'day' : 'days'}.</p>`;

  return `
    <section>
      <h2>Bowel movements</h2>
      ${rate}
      <table>
        <thead>
          <tr>
            <th scope="col">Bristol type</th>
            <th scope="col">Description</th>
            <th scope="col" class="n">Recorded</th>
          </tr>
        </thead>
        <tbody>
          ${bowel.bristol
            .map(
              (entry) => `<tr>
                <th scope="row">${escapeHtml(entry.type)}</th>
                <td>${escapeHtml(entry.description)}</td>
                <td class="n">${escapeHtml(entry.count)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <p class="note">Every type is listed, including those never recorded.</p>
    </section>`;
}

/**
 * One finding, in the same words the app uses.
 *
 * `findingDetail` is already the §17 boundary; writing a second vocabulary for print is how two
 * surfaces come to describe the same finding differently, and the printed one is the one nobody
 * can correct afterwards.
 */
function findingHtml(finding: Finding): string {
  const { present, absent } = exposurePhrases(finding.factor);
  const metrics = finding.metrics;
  const considerations = thingsToConsider(finding);

  return `
    <div class="finding">
      <p class="status">${escapeHtml(PATTERN_STATUS_COPY[finding.status].label)}</p>
      <p>${escapeHtml(observationSentence(finding))}</p>
      <p class="note">
        ${escapeHtml(Math.round(metrics.exposedOutcomeRate * 100))}% of
        ${escapeHtml(metrics.exposedCount)} ${escapeHtml(present)}, against
        ${escapeHtml(Math.round(metrics.controlOutcomeRate * 100))}% of
        ${escapeHtml(metrics.controlCount)} ${escapeHtml(absent)}.
        Confidence: ${escapeHtml(confidenceWord(finding.confidence))}.
      </p>
      ${considerations.map((line) => `<p class="note">${escapeHtml(line)}</p>`).join('')}
      ${finding.limitations.map((line) => `<p class="note">${escapeHtml(line)}</p>`).join('')}
    </div>`;
}

/**
 * Trends, as a table rather than a chart (spec §70).
 *
 * A sparkline would look better on a screen and is the obvious thing to reach for. On paper it is
 * the wrong choice: a printed report is photocopied, faxed and read at arm's length, and a
 * two-centimetre line of dots survives none of that. A clinician can read numbers, cannot
 * misinterpret them, and can point at one while asking about it.
 *
 * **A week with nothing recorded shows a dash, never a zero.** Everywhere else in this codebase
 * that distinction is enforced in the data (§59); here it has to survive into a cell, because a
 * column of zeroes reads as a good month.
 */
function trendsSection(report: AppointmentReport): string {
  // The section is about how symptoms moved, with logging shown alongside as context. When
  // *only* the logging series has a trend there is nothing about health to see, and the tracking
  // table above has already said how much was logged — so a page of zeroes would be length
  // without information, which §71 asks concise reports not to be. The model keeps the honest
  // data either way; this is a decision about what earns a page.
  const aboutHealth = report.trends.filter((series) => series.key !== 'logging_days');
  if (aboutHealth.length === 0) return '';

  // Every series shares the same weekly buckets, so one column per series and one row per week
  // reads as a calendar rather than as several unrelated charts.
  const weeks = report.trends[0]?.points ?? [];

  const cell = (series: TrendSeries, index: number): string => {
    const point = series.points[index];
    if (point === undefined || point.value === null) return '—';

    return series.unit === 'severity'
      ? point.value.toFixed(1)
      : `${Math.round(point.value * 100)}%`;
  };

  return `
    <section>
      <h2>Week by week</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Week ending</th>
            ${report.trends
              .map((series) => `<th scope="col" class="n">${escapeHtml(series.label)}</th>`)
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${weeks
            .map(
              (week, index) => `<tr>
                <th scope="row">${escapeHtml(formatLocalDate(week.end))}</th>
                ${report.trends
                  .map((series) => `<td class="n">${escapeHtml(cell(series, index))}</td>`)
                  .join('')}
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <p class="note">
        A dash means nothing was recorded that week, which is not the same as a week without
        symptoms. ${escapeHtml(
          report.trends.map((series) => `${series.label}: ${series.description}`).join(' ')
        )}
      </p>
    </section>`;
}

function associationsSection(report: AppointmentReport): string {
  const { associations } = report;
  const { standsOut, emerging } = associations;

  const nothing =
    standsOut.length === 0 && emerging.length === 0
      ? `<p>Nothing stood out in this period. GutSignal compared
           ${escapeHtml(associations.comparisonsMade)}
           ${associations.comparisonsMade === 1 ? 'combination' : 'combinations'}
           and found no consistent relationship — which is a result, not a gap.</p>`
      : '';

  return `
    <section>
      <h2>What was recorded together</h2>
      ${nothing}
      ${standsOut.map(findingHtml).join('')}
      ${
        emerging.length === 0
          ? ''
          : `<p class="note">Early signals, based on fewer observations. Worth watching rather than
               acting on.</p>
             ${emerging.map(findingHtml).join('')}`
      }
      ${
        standsOut.length + emerging.length === 0
          ? ''
          : `<p class="note">GutSignal compared ${escapeHtml(associations.comparisonsMade)}
               ${associations.comparisonsMade === 1 ? 'combination' : 'combinations'} in total.</p>`
      }
    </section>`;
}

/** The whole report, as one self-contained document. */
export function renderReportHtml(report: AppointmentReport): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GutSignal record — ${escapeHtml(formatLocalDate(report.period.start))} to ${escapeHtml(formatLocalDate(report.period.end))}</title>
<style>${STYLE}</style>
</head>
<body>
  <h1>GutSignal record</h1>
  <p class="meta">${escapeHtml(report.period.label)}</p>
  <p class="meta">Prepared ${escapeHtml(formatLocalDate(report.generatedAt.slice(0, 10)))}</p>

  ${trackingSection(report)}
  ${symptomSection(report)}
  ${bowelSection(report)}
  ${trendsSection(report)}
  ${associationsSection(report)}

  <section>
    <h2>Not included</h2>
    <ul>
      ${report.notIncluded.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>
  </section>

  <p class="disclaimer">${escapeHtml(report.disclaimer)}</p>
</body>
</html>`;
}
