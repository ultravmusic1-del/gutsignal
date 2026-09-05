import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { Finding } from '@/domain/pattern-engine/types';
import { encodeFindingId } from '@/domain/patterns/findingDetail';
import { ThemeProvider } from '@/theme';

import PatternDetailScreen from '../../../../app/pattern/[id]';

/**
 * The pattern detail screen (spec §51).
 *
 * The sentences it prints are tested in `findingDetail.test.ts`. What is tested here is the part
 * only the screen does: resolving an id back to a finding, and behaving properly when that fails.
 *
 * That failure is not an edge case. Findings are recomputed from local logs on every visit, so
 * editing or deleting an entry can legitimately make one stop existing between tapping a card and
 * the screen rendering.
 */

const routeParams = { id: '' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => routeParams,
}));

const insightsState: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  findings: Finding[];
} = { isPending: false, isError: false, isSuccess: true, findings: [] };

jest.mock('@/features/insights/useInsights', () => ({
  useInsights: () => ({
    isPending: insightsState.isPending,
    isError: insightsState.isError,
    isSuccess: insightsState.isSuccess,
    data: { findings: insightsState.findings },
  }),
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const renderWithTheme = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider scheme="light">
        <PatternDetailScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );

function aFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    engineVersion: '1.0.0',
    factor: { key: 'meal_item:dairy', label: 'Dairy', source: 'meal_item' },
    outcome: { kind: 'symptom_occurrence', symptomType: 'bloating' },
    analysisStart: '2026-06-01',
    analysisEnd: '2026-08-30',
    window: 'later_same_day',
    metrics: {
      exposedCount: 18,
      controlCount: 22,
      unknownCount: 7,
      exposedOutcomeRate: 0.46,
      controlOutcomeRate: 0.27,
      absoluteDifference: 0.19,
      relativeRisk: 0.46 / 0.27,
      exposedMeanSeverity: null,
      controlMeanSeverity: null,
      meanSeverityDifference: null,
      confidenceInterval: { low: 0.02, high: 0.36 },
    },
    consistency: { comparableWeeks: 8, agreeingWeeks: 6, agreementRate: 0.75 },
    confounders: [],
    trackingCompleteness: {
      totalDays: 90,
      daysWithAnyLog: 70,
      daysWithGoodState: 25,
      daysWithSymptom: 35,
      coverage: 70 / 90,
    },
    status: 'moderate',
    confidence: 0.61,
    limitations: [],
    generatedAt: '2026-08-31T09:00:00.000Z',
    ...overrides,
  };
}

function showing(findings: Finding[], id: string) {
  insightsState.isPending = false;
  insightsState.isError = false;
  insightsState.isSuccess = true;
  insightsState.findings = findings;
  routeParams.id = id;
}

describe('PatternDetailScreen', () => {
  it('shows the finding the id points at', async () => {
    const finding = aFinding();
    showing([finding], encodeFindingId(finding));

    await renderWithTheme();

    expect(screen.getByText('Dairy')).toBeTruthy();
    expect(screen.getByText(/Moderate signal · 18 days recorded with it/)).toBeTruthy();
    expect(screen.getByText(/Bloating was recorded more often/)).toBeTruthy();
  });

  it('shows both rates with the days behind them', async () => {
    const finding = aFinding();
    showing([finding], encodeFindingId(finding));

    await renderWithTheme();

    expect(screen.getByText('46%')).toBeTruthy();
    expect(screen.getByText('27%')).toBeTruthy();
    expect(screen.getByText('18 days')).toBeTruthy();
    expect(screen.getByText('22 days')).toBeTruthy();
  });

  // Collapsed, but never absent — spec §51 calls transparency a feature, so the control that
  // reveals it has to be a real one.
  it('offers the working behind an expandable control, collapsed at first', async () => {
    const finding = aFinding();
    showing([finding], encodeFindingId(finding));

    await renderWithTheme();

    const toggle = screen.getByRole('button', { name: 'How this was calculated' });

    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByText('Days compared')).toBeNull();
  });

  it('shows every limitation without needing a tap', async () => {
    const finding = aFinding({
      limitations: ['This is based on 9 comparable days in the smaller group, which is not many.'],
    });
    showing([finding], encodeFindingId(finding));

    await renderWithTheme();

    expect(screen.getByText(/9 comparable days/)).toBeTruthy();
  });

  it('names each factor that travelled with this one', async () => {
    const finding = aFinding({
      confounders: [
        { factor: { key: 'poor_sleep', label: 'Poorer sleep', source: 'context' }, overlap: 0.71 },
      ],
    });
    showing([finding], encodeFindingId(finding));

    await renderWithTheme();

    expect(screen.getByText(/Poorer sleep often occurred on the same days/)).toBeTruthy();
  });

  // Experiments are Milestone 11. Until they exist there must be no button pretending otherwise.
  it('offers no control that does not work yet', async () => {
    const finding = aFinding();
    showing([finding], encodeFindingId(finding));

    await renderWithTheme();

    expect(screen.queryByText(/start an experiment/i)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('explains itself when the finding no longer exists', async () => {
    showing([aFinding()], 'meal_item%3Agone|symptom_occurrence||next_day');

    await renderWithTheme();

    expect(screen.getByText('This pattern is no longer here')).toBeTruthy();
    expect(screen.getByText(/worked out from your logs/)).toBeTruthy();
  });

  it('does not blame the user data when the query itself failed', async () => {
    showing([], 'anything');
    insightsState.isError = true;
    insightsState.isSuccess = false;

    await renderWithTheme();

    expect(screen.getByText('This could not be worked out')).toBeTruthy();
    expect(screen.getByText(/Nothing has been lost/)).toBeTruthy();
  });

  it('says it is working rather than showing an empty page while loading', async () => {
    showing([], 'anything');
    insightsState.isPending = true;
    insightsState.isSuccess = false;

    await renderWithTheme();

    expect(screen.getByText('Looking through your logs…')).toBeTruthy();
  });
});
