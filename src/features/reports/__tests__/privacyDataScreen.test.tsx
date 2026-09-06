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

/**
 * Deletion is mocked here for the same reason the report is: this file is about the screen, and
 * the flow it drives is tested where it lives, in `features/account/__tests__/deleteAccount.test`.
 * What matters here is that the control cannot be reached without typing the word.
 */
const mockDelete = jest.fn();
const mockDeleteState: { isPending: boolean; isError: boolean; data: unknown } = {
  isPending: false,
  isError: false,
  data: undefined,
};

jest.mock('@/features/account/useDeleteAccount', () => ({
  useDeleteAccount: () => ({
    mutate: mockDelete,
    isPending: mockDeleteState.isPending,
    isError: mockDeleteState.isError,
    data: mockDeleteState.data,
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
  mockDelete.mockClear();
  mockDeleteState.isPending = false;
  mockDeleteState.isError = false;
  mockDeleteState.data = undefined;
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
  // §57: a row that leads nowhere is worse than no row. File export still needs two dependencies
  // that are not installed. Deletion is no longer in this category — it works.
  it('offers no export control', async () => {
    const view = await renderScreen();

    expect(view.queryByRole('button', { name: /export/i })).toBeNull();
  });

  it('says in words what is not built yet, rather than leaving a silence', async () => {
    const view = await renderScreen();

    expect(view.getByText(/NOT HERE YET/)).toBeTruthy();
    expect(view.getByText(/being built/i)).toBeTruthy();
  });
});

/**
 * Deleting an account (spec §97).
 *
 * The screen's job is to make the action deliberate and to say what it costs before it is taken.
 * Both are testable without a server, and both are the parts a person only meets once.
 */
describe('deleting an account', () => {
  const typeConfirmation = async (view: Awaited<ReturnType<typeof renderScreen>>, text: string) => {
    await act(async () => {
      fireEvent.changeText(view.getByLabelText(/Type DELETE to confirm/i), text);
    });
  };

  it('will not delete until the word is typed', async () => {
    const view = await renderScreen();

    await press(view, 'Delete account');
    expect(mockDelete).not.toHaveBeenCalled();

    // A near miss is still a miss.
    await typeConfirmation(view, 'delete my account');
    await press(view, 'Delete account');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes once the word is typed', async () => {
    const view = await renderScreen();

    await typeConfirmation(view, 'DELETE');
    await press(view, 'Delete account');

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  // §97 requires this said separately, and it is the one thing that cannot be said afterwards:
  // the account is gone, so there is no screen left to read it from.
  it('warns that deleting does not cancel an Apple subscription, before the control', async () => {
    const view = await renderScreen();

    expect(view.getByText(/does not automatically cancel an Apple subscription/i)).toBeTruthy();
  });

  it('says the deletion cannot be undone', async () => {
    const view = await renderScreen();

    expect(view.getByText(/cannot be undone/i)).toBeTruthy();
  });

  it('reports a failed deletion without claiming anything was removed', async () => {
    mockDeleteState.data = { ok: false, failedAt: 'server', message: 'Nothing has been removed.' };

    const view = await renderScreen();

    expect(view.getByText(/Nothing has been removed/i)).toBeTruthy();
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
