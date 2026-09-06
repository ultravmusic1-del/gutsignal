import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, DevSettings } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/theme';

import BootGate from '../../../app/index';

/**
 * The boot failure screen, and the destructive action it hides behind `__DEV__`.
 *
 * The recovery button exists because a half-applied local schema is not something restarting
 * fixes — the version table claims a migration ran while its tables are absent, so every launch
 * fails identically. It deletes local logs, so the two things worth pinning are that it appears
 * only where it is meant to, and that it never runs without confirmation.
 */

const mockBoot = {
  state: 'configuration_error' as string,
  problems: ['Local database'],
  failureKind: 'storage' as 'storage' | 'environment',
};

jest.mock('@/boot/useAppBoot', () => ({
  useAppBoot: () => mockBoot,
}));

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ initialised: true, session: null }),
}));

jest.mock('@/features/profile/useProfile', () => ({
  useProfile: () => ({ isPending: false, data: undefined }),
}));

const mockDeleteLocalDatabase = jest.fn(async () => undefined);

jest.mock('@/services/db/database', () => ({
  deleteLocalDatabase: () => mockDeleteLocalDatabase(),
}));

/** Spied rather than module-mocked: the named export is what the screen actually calls. */
const mockReload = jest.spyOn(DevSettings, 'reload').mockImplementation(() => undefined);

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider scheme="light">
        <BootGate />
      </ThemeProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  mockBoot.state = 'configuration_error';
  mockBoot.failureKind = 'storage';
  mockDeleteLocalDatabase.mockClear();
  mockReload.mockClear();
});

describe('the boot failure screen', () => {
  it('explains a storage failure without claiming anything was deleted', async () => {
    const { getByText } = await renderScreen();

    getByText("GutSignal can't start");
    getByText(/Nothing you have logged has been deleted/);
  });

  it('offers local recovery when the failure is storage', async () => {
    const { getByLabelText } = await renderScreen();

    expect(getByLabelText('Delete local data and restart')).toBeTruthy();
  });

  /**
   * A misconfigured build has nothing to recover from, and offering to delete a diary in answer to
   * a missing environment variable would be actively harmful.
   */
  it('does not offer it when the failure is configuration', async () => {
    mockBoot.failureKind = 'environment';

    const { queryByLabelText } = await renderScreen();

    expect(queryByLabelText('Delete local data and restart')).toBeNull();
  });

  it('deletes nothing until the confirmation is accepted', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByLabelText } = await renderScreen();
    fireEvent.press(getByLabelText('Delete local data and restart'));

    expect(alert).toHaveBeenCalled();
    expect(mockDeleteLocalDatabase).not.toHaveBeenCalled();

    alert.mockRestore();
  });

  it('deletes and reloads once the confirmation is accepted', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) =>
        buttons?.find((button) => button.style === 'destructive')?.onPress?.()
      );

    const { getByLabelText } = await renderScreen();
    fireEvent.press(getByLabelText('Delete local data and restart'));

    await waitFor(() => expect(mockDeleteLocalDatabase).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockReload).toHaveBeenCalledTimes(1));

    alert.mockRestore();
  });

  /**
   * The one thing that must never reach a real user. `__DEV__` is a global the bundler replaces,
   * so this is the only place its effect can be checked.
   */
  it('is hidden entirely in a release build', async () => {
    const dev = __DEV__;
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

    try {
      const { queryByLabelText } = await renderScreen();
      expect(queryByLabelText('Delete local data and restart')).toBeNull();
    } finally {
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = dev;
    }
  });
});
