import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Factor, Finding } from '@/domain/pattern-engine/types';
import { buildGutMap } from '@/domain/patterns/gutMap';
import type { PatternStatus } from '@/domain/patterns/status';
import { ThemeProvider } from '@/theme';

import { GutMap } from '../GutMap';

/**
 * The Gut Map's presentation rules (spec §52, `CLAUDE.md` §36).
 *
 * The grouping logic is tested in `gutMap.test.ts`. These tests cover the two things only the
 * component can get wrong: making the map read like a verdict, and putting a factor behind a row
 * that assistive technology cannot make sense of.
 */

const DAIRY: Factor = { key: 'meal_item:dairy', label: 'Dairy', source: 'meal_item' };
const SLEEP: Factor = { key: 'poor_sleep', label: 'Poorer sleep', source: 'context' };

function aFinding(factor: Factor, status: PatternStatus, confidence = 0.6): Finding {
  return {
    engineVersion: '1.0.0',
    factor,
    outcome: { kind: 'symptom_occurrence', symptomType: 'bloating' },
    analysisStart: '2026-06-01',
    analysisEnd: '2026-08-30',
    window: 'later_same_day',
    metrics: {
      exposedCount: 12,
      controlCount: 14,
      unknownCount: 3,
      exposedOutcomeRate: 0.5,
      controlOutcomeRate: 0.25,
      absoluteDifference: 0.25,
      relativeRisk: 2,
      exposedMeanSeverity: null,
      controlMeanSeverity: null,
      meanSeverityDifference: null,
      confidenceInterval: { low: 0.05, high: 0.45 },
    },
    consistency: { comparableWeeks: 6, agreeingWeeks: 5, agreementRate: 5 / 6 },
    confounders: [],
    trackingCompleteness: {
      totalDays: 90,
      daysWithAnyLog: 65,
      daysWithGoodState: 20,
      daysWithSymptom: 30,
      coverage: 65 / 90,
    },
    status,
    confidence,
    limitations: [],
    generatedAt: '2026-08-31T09:00:00.000Z',
  };
}

// The render must be awaited here, not by the caller: this version of RNTL only publishes
// `screen` once the render settles, so a helper that discards the result leaves it unset.
const renderMap = async (findings: Finding[], onSelect = jest.fn()) => {
  await render(
    <ThemeProvider scheme="light">
      <GutMap groups={buildGutMap(findings)} onSelect={onSelect} />
    </ThemeProvider>
  );
  return onSelect;
};

describe('GutMap', () => {
  it('names each group in words rather than leaving colour to carry it', async () => {
    await renderMap([
      aFinding(SLEEP, 'stronger_recurring_signal'),
      aFinding(DAIRY, 'no_clear_pattern'),
    ]);

    expect(screen.getByText('Stronger signals')).toBeTruthy();
    expect(screen.getByText('No clear pattern')).toBeTruthy();
  });

  // A factor that came to nothing is the whole reason this section exists — it is the only place
  // in the app where "we looked at dairy and found nothing" is visible.
  it('shows the factors that came to nothing', async () => {
    await renderMap([aFinding(DAIRY, 'no_clear_pattern')]);

    expect(screen.getByText('Dairy')).toBeTruthy();
  });

  it('renders nothing at all rather than empty headings', async () => {
    await renderMap([]);

    expect(screen.queryByText('Stronger signals')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens the finding behind a row when it is tapped', async () => {
    const finding = aFinding(DAIRY, 'moderate');
    const onSelect = await renderMap([finding]);

    fireEvent.press(screen.getByRole('button', { name: /Dairy/ }));

    expect(onSelect).toHaveBeenCalledWith(finding);
  });

  // A bare factor name read aloud says nothing about what tapping it does, or how much it rests on.
  it('describes a row as one phrase to assistive technology', async () => {
    await renderMap([
      aFinding(DAIRY, 'moderate', 0.7),
      aFinding(DAIRY, 'moderate', 0.6),
      aFinding(DAIRY, 'moderate', 0.5),
    ]);

    expect(screen.getByRole('button', { name: 'Dairy, 3 comparisons' })).toBeTruthy();
  });

  it('counts a single comparison in the singular', async () => {
    await renderMap([aFinding(SLEEP, 'emerging')]);

    expect(screen.getByRole('button', { name: 'Poorer sleep, 1 comparison' })).toBeTruthy();
  });

  // §52: "Do not make Gut Map look like medical diagnosis output."
  it('uses no diagnostic or risk language anywhere on screen', async () => {
    await renderMap([
      aFinding(SLEEP, 'stronger_recurring_signal'),
      aFinding(DAIRY, 'insufficient_data'),
    ]);

    for (const forbidden of [/risk/i, /trigger/i, /diagnos/i, /intoleran/i, /avoid/i, /warning/i]) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
  });
});
