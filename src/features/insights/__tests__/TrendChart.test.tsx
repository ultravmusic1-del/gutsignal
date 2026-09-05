import { render, screen } from '@testing-library/react-native';

import { makeSymptom, makeWellbeing } from '@/domain/pattern-engine/fixtures/builders';
import type { LogSet } from '@/domain/pattern-engine/observations';
import { buildTrends, type TrendSeries } from '@/domain/patterns/trends';
import { ThemeProvider } from '@/theme';

import { TrendChart } from '../TrendChart';

/**
 * The chart's honesty rules, checked at the point they can actually be broken.
 *
 * `trends.test.ts` proves a week with nothing logged has a `null` value. That guarantee is worth
 * nothing if the chart renders `null` as a bar at zero, so the two things tested here are that a
 * gap stays a gap and that a blind reader is told about it — a missing bar conveys nothing on its
 * own (`CLAUDE.md` §36).
 */

const emptyLogs: LogSet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };

// Weeks 1 and 3 reported on, week 2 not logged at all — the gap this chart exists to handle.
const patchyDiary: LogSet = {
  ...emptyLogs,
  symptoms: [makeSymptom('2026-06-01', { severity: 6 })],
  wellbeing: [makeWellbeing('2026-06-02'), makeWellbeing('2026-06-16')],
};

const seriesFrom = (logs: LogSet, key: string): TrendSeries => {
  const series = buildTrends({
    logs,
    range: { start: '2026-06-01', end: '2026-06-21' },
  }).find((candidate) => candidate.key === key);

  if (series === undefined) throw new Error(`no series ${key}`);
  return series;
};

// Awaited inside the helper: this version of RNTL only publishes `screen` once render settles.
const renderChart = async (series: TrendSeries) => {
  await render(
    <ThemeProvider scheme="light">
      <TrendChart series={series} />
    </ThemeProvider>
  );
};

describe('TrendChart', () => {
  it('names the series and says what the number means', async () => {
    await renderChart(seriesFrom(patchyDiary, 'symptom_days'));

    expect(screen.getByText('Days with symptoms')).toBeTruthy();
    expect(screen.getByText('Out of the days you reported on that week.')).toBeTruthy();
  });

  // The point of the whole component. A missing week must not be drawn, and must be explained.
  it('explains the weeks it did not draw', async () => {
    await renderChart(seriesFrom(patchyDiary, 'symptom_days'));

    expect(screen.getByText(/1 week has no bar/)).toBeTruthy();
    expect(screen.getByText(/not the same as nothing happening/)).toBeTruthy();
  });

  it('says nothing about gaps when there are none', async () => {
    await renderChart(seriesFrom(patchyDiary, 'logging_days'));

    expect(screen.queryByText(/no bar/)).toBeNull();
  });

  // §36: a chart conveying its data only by shape is unusable to a screen reader, and absence is
  // precisely what shape conveys worst.
  it('reads every week aloud, including the ones with nothing recorded', async () => {
    await renderChart(seriesFrom(patchyDiary, 'symptom_days'));

    const label = screen.getByLabelText(/Days with symptoms/).props.accessibilityLabel as string;

    expect(label).toContain('week ending 7 Jun 2026, 50%');
    expect(label).toContain('week ending 14 Jun 2026, not recorded');
    expect(label).toContain('week ending 21 Jun 2026, 0%');
  });

  it('reads a severity in its own units rather than as a percentage', async () => {
    const logs: LogSet = {
      ...emptyLogs,
      symptoms: [
        makeSymptom('2026-06-01', { severity: 6, id: 'a' }),
        makeSymptom('2026-06-09', { severity: 8, id: 'b' }),
        makeSymptom('2026-06-16', { severity: 4, id: 'c' }),
      ],
    };

    await renderChart(seriesFrom(logs, 'symptom_severity'));

    const label = screen.getByLabelText(/How strong they felt/).props.accessibilityLabel as string;

    expect(label).toContain('6.0');
    expect(label).not.toContain('%');
  });

  it('shows the period the chart covers', async () => {
    await renderChart(seriesFrom(patchyDiary, 'symptom_days'));

    expect(screen.getByText('1 Jun 2026')).toBeTruthy();
    expect(screen.getByText('21 Jun 2026')).toBeTruthy();
  });
});
