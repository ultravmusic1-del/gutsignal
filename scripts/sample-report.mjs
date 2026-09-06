/**
 * Writes a sample appointment report to look at.
 *
 * The report is the one artefact GutSignal produces that a person hands to someone else, and no
 * test can tell you whether it reads well — only a human can, ideally a clinician. Reading an HTML
 * string through test assertions is not the same as seeing the page, so this renders one from
 * synthetic data and opens it.
 *
 *   node scripts/sample-report.mjs
 *
 * The diary is invented and deliberately uneven: a month with gaps in it, symptoms on some days,
 * explicit good days on others, and a stretch where nothing was logged at all — because a report
 * that only looks right on a perfectly-kept diary is a report that has not been checked.
 *
 * It writes to the OS temp directory rather than the repo. A generated file under version control
 * goes stale the first time the renderer changes and then quietly misleads whoever opens it.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register } from 'node:module';

// Node 24 strips TypeScript types natively, but knows nothing of the `@/` alias that Jest gets
// from moduleNameMapper. The hook supplies it, and must be registered before any import of
// application source — which is why every import below is dynamic.
register('./alias-hooks.mjs', import.meta.url);

const { buildAppointmentReport } = await import('../src/domain/reports/appointmentReport.ts');
const { renderReportHtml } = await import('../src/domain/reports/reportHtml.ts');
const { analyse } = await import('../src/domain/pattern-engine/engine.ts');
const builders = await import('../src/domain/pattern-engine/fixtures/builders.ts');

const { makeMeal, makeSymptom, makeWellbeing, makeBowel, mergeLogs } = builders;

const day = (n) => `2026-06-${String(n).padStart(2, '0')}`;

/**
 * A month that looks like a real one: dairy on some days, symptoms following more often than not,
 * good days recorded, and a fortnight in the middle where the person stopped logging.
 */
const logs = mergeLogs(
  // Days 1–10: dairy on the odd days, symptoms mostly following.
  ...[1, 3, 5, 7, 9].map((d) => ({
    meals: [makeMeal(day(d), { items: ['milk', 'cereal'], id: `m-${d}` })],
  })),
  ...[1, 3, 5, 9].map((d) => ({
    symptoms: [makeSymptom(day(d), { severity: 5 + (d % 4), id: `s-${d}` })],
  })),
  ...[2, 4, 6, 8, 10].map((d) => ({
    meals: [makeMeal(day(d), { items: ['toast'], id: `m-${d}` })],
    wellbeing: [makeWellbeing(day(d), { id: `w-${d}` })],
  })),

  // Days 11–24: nothing at all. This is the gap the report must not read as wellness.

  // Days 25–30: logging resumes, including bowel entries.
  ...[25, 26, 27, 28, 29, 30].map((d) => ({
    bowel: [makeBowel(day(d), { bristolType: (d % 7) + 1, id: `b-${d}` })],
  })),
  ...[25, 27, 29].map((d) => ({
    symptoms: [makeSymptom(day(d), { type: 'cramping', severity: 4, id: `s2-${d}` })],
  })),
  ...[26, 28, 30].map((d) => ({ wellbeing: [makeWellbeing(day(d), { id: `w2-${d}` })] }))
);

const range = { start: day(1), end: day(30) };
const now = new Date('2026-07-01T09:00:00.000Z');

const report = buildAppointmentReport({
  logs,
  findings: analyse({ logs, range, now }),
  range,
  generatedAt: now,
});

const file = join(mkdtempSync(join(tmpdir(), 'gutsignal-report-')), 'sample-report.html');
writeFileSync(file, renderReportHtml(report), 'utf8');

console.log(`Sample report written to:\n  ${file}\n`);
console.log(
  `It covers ${report.tracking.totalDays} days: ${report.tracking.daysLogged} with an entry, ` +
    `${report.tracking.daysWithNothingRecorded} with nothing recorded, and ` +
    `${report.associations.comparisonsMade} comparisons made.`
);

try {
  execFileSync('cmd', ['/c', 'start', '', file], { stdio: 'ignore' });
} catch {
  console.log('\nOpen it yourself — this only auto-opens on Windows.');
}
