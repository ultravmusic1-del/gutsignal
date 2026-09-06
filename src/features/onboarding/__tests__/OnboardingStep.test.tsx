import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { Text } from 'react-native';

import { ONBOARDING_STEPS } from '@/domain/onboarding/steps';
import {
  resetAnalytics,
  setAnalyticsSink,
  type AnalyticsSink,
} from '@/services/analytics/analytics';
import { ThemeProvider } from '@/theme';

import { OnboardingStep } from '../OnboardingStep';

/**
 * The onboarding funnel, reported from the one frame every step shares.
 *
 * Six screens use this component, so reporting here is what stops the funnel drifting as steps
 * are added or reordered. That makes this the seam worth a test: if it stops reporting, the whole
 * funnel goes quiet at once and nothing else fails.
 */

const captured: { event: string; properties: Record<string, unknown> }[] = [];

const sink: AnalyticsSink = {
  capture: (event, properties) => captured.push({ event, properties }),
};

beforeEach(() => {
  captured.length = 0;
  setAnalyticsSink(sink);
});

afterEach(() => resetAnalytics());

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const renderStep = async (
  step: (typeof ONBOARDING_STEPS)[number],
  onPrimary = jest.fn(),
  onSecondary = jest.fn()
) => {
  const view = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider scheme="light">
        <OnboardingStep
          step={step}
          title="A question"
          onPrimary={onPrimary}
          secondaryLabel="Skip"
          onSecondary={onSecondary}
        >
          <Text>body</Text>
        </OnboardingStep>
      </ThemeProvider>
    </SafeAreaProvider>
  );

  return { view, onPrimary, onSecondary };
};

const press = async (view: Awaited<ReturnType<typeof renderStep>>['view'], name: string) => {
  await act(async () => {
    fireEvent.press(view.getByRole('button', { name }));
  });
};

describe('reporting a completed step', () => {
  it.each(ONBOARDING_STEPS)('names the %s step', async (step) => {
    const { view } = await renderStep(step);

    await press(view, 'Continue');

    expect(captured).toEqual([{ event: 'onboarding_step_completed', properties: { step } }]);
  });

  it('still does what the screen asked for', async () => {
    const { view, onPrimary } = await renderStep('goals');

    await press(view, 'Continue');

    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('reports nothing until the step is actually completed', async () => {
    await renderStep('goals');

    expect(captured).toEqual([]);
  });
});

describe('what is deliberately not counted', () => {
  // Skipping does move someone past a step, but calling it "completed" would misdescribe what
  // they did. A skip deserves its own event rather than being folded into this one.
  it('does not count a skip as a completion', async () => {
    const { view } = await renderStep('symptoms');

    await press(view, 'Skip');

    expect(captured).toEqual([]);
  });
});
