import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Finding } from '@/domain/pattern-engine/types';
import { ThemeProvider } from '@/theme';

import { FindingCard } from '../FindingCard';

/**
 * What a finding card is allowed to say (spec §17, §36, §50).
 *
 * The arithmetic behind these assertions lives in the engine and is tested there. What is tested
 * here is the promise the card makes to a person: association language only, the denominators on
 * screen beside the rates, the status readable as text rather than encoded in colour, and the
 * limitations visible without a tap.
 */

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider scheme="light">{ui}</ThemeProvider>);

function aFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    engineVersion: '1.0.0',
    factor: { key: 'meal_item:dairy', label: 'Dairy', source: 'meal_item' },
    outcome: { kind: 'symptom_occurrence', symptomType: 'bloating' },
    analysisStart: '2026-06-01',
    analysisEnd: '2026-08-30',
    window: 'later_same_day',
    metrics: {
      exposedCount: 12,
      controlCount: 18,
      unknownCount: 5,
      exposedOutcomeRate: 0.75,
      controlOutcomeRate: 0.25,
      absoluteDifference: 0.5,
      relativeRisk: 3,
      exposedMeanSeverity: null,
      controlMeanSeverity: null,
      meanSeverityDifference: null,
      confidenceInterval: { low: 0.2, high: 0.75 },
    },
    consistency: { comparableWeeks: 6, agreeingWeeks: 5, agreementRate: 5 / 6 },
    confounders: [],
    trackingCompleteness: {
      totalDays: 90,
      daysWithAnyLog: 60,
      daysWithGoodState: 20,
      daysWithSymptom: 30,
      coverage: 60 / 90,
    },
    status: 'moderate',
    confidence: 0.62,
    limitations: [],
    generatedAt: '2026-08-31T09:00:00.000Z',
    ...overrides,
  };
}

describe('FindingCard', () => {
  it('states the association without claiming a cause', async () => {
    await renderWithTheme(<FindingCard finding={aFinding()} />);

    expect(
      screen.getByText(/Bloating was recorded more often on days when you logged dairy/i)
    ).toBeTruthy();
    expect(screen.queryByText(/caused/i)).toBeNull();
    expect(screen.queryByText(/because of/i)).toBeNull();
  });

  it('says "less often" when the outcome was rarer on exposed days', async () => {
    const finding = aFinding({
      metrics: {
        ...aFinding().metrics,
        exposedOutcomeRate: 0.2,
        controlOutcomeRate: 0.6,
        absoluteDifference: -0.4,
      },
    });

    await renderWithTheme(<FindingCard finding={finding} />);

    expect(screen.getByText(/was recorded less often on days when you logged dairy/i)).toBeTruthy();
  });

  // The whole promise of this product is that the evidence is visible. A rate without its
  // denominator invites more confidence than it has earned, so both counts must be on the card.
  it('shows each rate with the number of days it came from', async () => {
    await renderWithTheme(<FindingCard finding={aFinding()} />);

    expect(screen.getByText(/75% of 12 days/i)).toBeTruthy();
    expect(screen.getByText(/25% of 18 days/i)).toBeTruthy();
  });

  it('says how many days had nothing recorded either way', async () => {
    await renderWithTheme(<FindingCard finding={aFinding()} />);

    expect(screen.getByText(/5 more days had nothing recorded/i)).toBeTruthy();
  });

  it('omits the unknown-days line when every day in the range was observed', async () => {
    const finding = aFinding({ metrics: { ...aFinding().metrics, unknownCount: 0 } });

    await renderWithTheme(<FindingCard finding={finding} />);

    expect(screen.queryByText(/nothing recorded/i)).toBeNull();
  });

  // §36: confidence must never be conveyed by colour alone.
  it('names the status in words', async () => {
    await renderWithTheme(<FindingCard finding={aFinding({ status: 'emerging' })} />);

    expect(screen.getByText('EMERGING SIGNAL')).toBeTruthy();
  });

  // Limitations shown inline, not behind a tap the user may never make.
  it('shows every limitation beside the claim', async () => {
    const finding = aFinding({
      limitations: [
        'Coffee and shorter sleep often occurred together in your logs.',
        'Based on a small number of days.',
      ],
    });

    await renderWithTheme(<FindingCard finding={finding} />);

    expect(screen.getByText(/often occurred together/i)).toBeTruthy();
    expect(screen.getByText(/small number of days/i)).toBeTruthy();
  });

  it('is not a button until something can be opened', async () => {
    await renderWithTheme(<FindingCard finding={aFinding()} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('exposes the status and headline to assistive technology when it is tappable', async () => {
    const onPress = jest.fn();
    const finding = aFinding();

    await renderWithTheme(<FindingCard finding={finding} onPress={onPress} />);

    const card = screen.getByRole('button', { name: /Moderate signal\. Bloating was recorded/i });
    fireEvent.press(card);

    expect(onPress).toHaveBeenCalledWith(finding);
  });
});

/**
 * An intensity is not a frequency, on this surface either.
 *
 * The card used to build its own headline and its own figures, so it described a severity
 * finding as something "recorded more often" and quantified it with the occurrence rate. It now
 * reads both from the same place the detail screen and the printed report do.
 */
describe('FindingCard — severity findings', () => {
  const aSeverityFinding = () => {
    const base = aFinding();
    return {
      ...base,
      outcome: { kind: 'symptom_severity' as const, symptomType: 'bloating' },
      metrics: {
        ...base.metrics,
        exposedMeanSeverity: 7.4,
        controlMeanSeverity: 3.1,
        meanSeverityDifference: 4.3,
      },
    };
  };

  it('describes intensity as higher, never as more often', async () => {
    await renderWithTheme(<FindingCard finding={aSeverityFinding()} />);

    expect(screen.getByText(/Bloating intensity was higher/i)).toBeTruthy();
    expect(screen.queryByText(/more often/i)).toBeNull();
  });

  it('shows the two averages rather than occurrence percentages', async () => {
    await renderWithTheme(<FindingCard finding={aSeverityFinding()} />);

    expect(screen.getByText(/7.4 out of 10 across 12 days/i)).toBeTruthy();
    expect(screen.getByText(/3.1 out of 10 across 18 days/i)).toBeTruthy();
    // 75% / 25% are the occurrence rates on this fixture and must not appear on an intensity card.
    expect(screen.queryByText(/75%/)).toBeNull();
    expect(screen.queryByText(/25%/)).toBeNull();
  });
});
