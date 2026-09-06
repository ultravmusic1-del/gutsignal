import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/theme';

import PrivacyAndDataScreen from '../../../../app/privacy-data';

/**
 * Privacy & data (spec §97), and the one behaviour worth pinning: a print sheet the user closed is
 * not an error.
 *
 * On iOS `printAsync` rejects when the window is dismissed without printing, and that rejection is
 * indistinguishable from a real failure — and far more common. Showing a red box to someone who
 * simply changed their mind is the failure this screen has to avoid.
 */

const mockMutate = jest.fn();
const mockState = { isPending: false, isError: false };

jest.mock('@/features/reports/useCreateReport', () => ({
  REPORT_PERIOD_DAYS: [30, 90],
  useCreateReport: () => ({
    mutate: mockMutate,
    isPending: mockState.isPending,
    isError: mockState.isError,
  }),
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeEach(() => {
  mockMutate.mockClear();
  mockState.isPending = false;
  mockState.isError = false;
});

const renderScreen = async () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider scheme="light">
        <PrivacyAndDataScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );

const press = async (view: Awaited<ReturnType<typeof renderScreen>>, name: string | RegExp) => {
  await act(async () => {
    fireEvent.press(view.getByRole('button', { name }));
  });
};

describe('creating a report', () => {
  it('defaults to the shorter period and creates a report for it', async () => {
    const view = await renderScreen();

    await press(view, 'Create report');

    expect(mockMutate).toHaveBeenCalledWith(30);
  });

  it('creates a report for the period the user chose', async () => {
    const view = await renderScreen();

    await press(view, 'Last 90 days');
    await press(view, 'Create report');

    expect(mockMutate).toHaveBeenCalledWith(90);
  });

  // Building a report reads the whole diary and runs the engine; on a long history that is not
  // instant, and a button that looks inert is a button people press twice.
  it('shows the button as busy while the report is being built', async () => {
    mockState.isPending = true;

    const view = await renderScreen();

    expect(view.getByRole('button', { name: 'Create report' })).toBeDisabled();
  });
});

describe('when something goes wrong', () => {
  it('says the entries are safe, because they are', async () => {
    mockState.isError = true;

    const view = await renderScreen();

    expect(view.getByText(/could not be built/i)).toBeTruthy();
    expect(view.getByText(/entries are safe on this device/i)).toBeTruthy();
  });

  // The point of the whole design: a dismissed sheet resolves as success, so nothing is shown.
  it('shows nothing at all when the report was simply not printed', async () => {
    const view = await renderScreen();

    await press(view, 'Create report');

    expect(view.queryByText(/could not be built/i)).toBeNull();
  });
});

describe('what is deliberately absent', () => {
  // §57: a row that leads nowhere is worse than no row. File export needs two dependencies that
  // are not installed, and deletion needs a server function that cannot be written yet.
  it('offers no export or delete control', async () => {
    const view = await renderScreen();

    expect(view.queryByRole('button', { name: /export/i })).toBeNull();
    expect(view.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('says in words what is not built yet, rather than leaving a silence', async () => {
    const view = await renderScreen();

    expect(view.getByText(/NOT HERE YET/)).toBeTruthy();
    expect(view.getByText(/being built/i)).toBeTruthy();
  });
});

describe('what the screen promises', () => {
  // The report leaves the app. Someone deciding whether to hand it to a clinician should be told
  // what it is before they make it, not only on the page itself.
  it('says the report does not diagnose before the user creates one', async () => {
    const view = await renderScreen();

    expect(view.getByText(/does not diagnose/i)).toBeTruthy();
  });
});
