import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import {
  resetAnalytics,
  setAnalyticsSink,
  type AnalyticsSink,
} from '@/services/analytics/analytics';
import { ThemeProvider } from '@/theme';

import LogSheet from '../../../../app/log/index';

/**
 * What the log sheet reports, and — the part worth testing — what it does not.
 *
 * `log_sheet_dismissed` is meant to measure friction: someone opened the sheet and closed it
 * without picking anything. The obvious implementation reports on blur, which is wrong, because
 * choosing "Meal" blurs the sheet too and would count every successful log as an abandonment. So
 * dismissal is detected on **unmount without a choice**, and these tests pin that distinction.
 */

const captured: { event: string; properties: Record<string, unknown> }[] = [];

const sink: AnalyticsSink = {
  capture: (event, properties) => {
    captured.push({ event, properties });
  },
};

// All prefixed with `mock`: Jest hoists these factories above every other statement, and only
// lets them close over names it can recognise as test doubles.
const mockRouteParams: { entryPoint?: string } = {};
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockLogWellbeing = jest.fn(async () => 'ok');

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('@/features/logs/useSimpleLogs', () => ({
  useLogWellbeing: () => ({ mutateAsync: mockLogWellbeing }),
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeEach(() => {
  captured.length = 0;
  mockRouteParams.entryPoint = 'nav';
  mockPush.mockClear();
  mockBack.mockClear();
  mockLogWellbeing.mockClear();
  setAnalyticsSink(sink);
});

afterEach(() => resetAnalytics());

const renderSheet = async () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider scheme="light">
        <LogSheet />
      </ThemeProvider>
    </SafeAreaProvider>
  );

const events = () => captured.map((entry) => entry.event);

const pressAction = async (
  view: Awaited<ReturnType<typeof renderSheet>>,
  name: RegExp
): Promise<void> => {
  await act(async () => {
    fireEvent.press(view.getByRole('button', { name }));
  });
};

describe('opening', () => {
  it('reports the sheet opening, with where it was opened from', async () => {
    await renderSheet();

    expect(captured).toEqual([{ event: 'log_sheet_opened', properties: { entryPoint: 'nav' } }]);
  });

  // Route params are strings from a URL and can be anything at all.
  it('falls back to the control that exists when the parameter is nonsense', async () => {
    mockRouteParams.entryPoint = 'somewhere-else';

    await renderSheet();

    expect(captured[0]?.properties).toEqual({ entryPoint: 'nav' });
  });

  it('falls back when the parameter is missing entirely', async () => {
    delete mockRouteParams.entryPoint;

    await renderSheet();

    expect(captured[0]?.properties).toEqual({ entryPoint: 'nav' });
  });
});

describe('closing without choosing anything', () => {
  it('reports a dismissal', async () => {
    const view = await renderSheet();

    await act(async () => {
      view.unmount();
    });

    expect(events()).toEqual(['log_sheet_opened', 'log_sheet_dismissed']);
  });

  it('carries the same entry point it opened with', async () => {
    const view = await renderSheet();

    await act(async () => {
      view.unmount();
    });

    expect(captured[1]?.properties).toEqual({ entryPoint: 'nav' });
  });
});

describe('closing after choosing something', () => {
  // The failure a blur-based implementation would produce: every successful log counted as an
  // abandonment.
  it('does not report a dismissal after a logging screen was opened', async () => {
    const view = await renderSheet();

    await pressAction(view, /Meal/);
    expect(mockPush).toHaveBeenCalledWith('/log/meal');

    await act(async () => {
      view.unmount();
    });

    expect(events()).toEqual(['log_sheet_opened']);
  });

  it('does not report a dismissal after a one-tap entry was saved', async () => {
    const view = await renderSheet();

    await pressAction(view, /Feeling good/);
    expect(mockLogWellbeing).toHaveBeenCalled();

    await act(async () => {
      view.unmount();
    });

    expect(events()).toEqual(['log_sheet_opened']);
  });

  // Cancelling the meal form is abandonment one screen further in, not friction in this sheet.
  // Counting it here would attribute the drop-off to the wrong place.
  it('still counts as a choice even if the user came back and closed the sheet', async () => {
    const view = await renderSheet();

    await pressAction(view, /Bowel movement/);

    await act(async () => {
      view.unmount();
    });

    expect(events()).not.toContain('log_sheet_dismissed');
  });
});
