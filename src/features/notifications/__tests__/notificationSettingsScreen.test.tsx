import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import {
  defaultPreferences,
  type NotificationPreferences,
} from '@/domain/notifications/preferences';
import { planReminders } from '@/domain/notifications/schedule';
import { ThemeProvider } from '@/theme';

import NotificationSettingsScreen from '../../../../app/notifications';

/**
 * Milestone 14's acceptance: the user controls every reminder, and quiet hours work.
 *
 * Three things carry that, and each is here. Every reminder has a control. A reminder that quiet
 * hours will silence says so, rather than sitting there enabled and inert. And the OS permission
 * prompt is never opened except by someone pressing the button that says it will be.
 */

const mockState: {
  preferences: NotificationPreferences;
  permission: 'granted' | 'denied' | 'undetermined';
} = {
  preferences: defaultPreferences('balanced'),
  permission: 'granted',
};

/** Mock-prefixed so the hoisted `jest.mock` factory is allowed to call it. */
function mockPlanFor() {
  return planReminders(mockState.preferences);
}

const mockUpdate = jest.fn();
const mockRequestPermission = jest.fn();

jest.mock('@/features/notifications/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    preferences: mockState.preferences,
    isLoading: false,
    permission: mockState.permission,
    isPermissionLoading: false,
    plan: mockPlanFor(),
    update: mockUpdate,
    isSaving: false,
    saveFailed: false,
    requestPermission: mockRequestPermission,
    isRequestingPermission: false,
  }),
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider scheme="light">
        <NotificationSettingsScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  mockState.preferences = defaultPreferences('balanced');
  mockState.permission = 'granted';
  mockUpdate.mockClear();
  mockRequestPermission.mockClear();
});

describe('the reminders screen', () => {
  it('offers a control for every reminder the app can send', async () => {
    const { getByLabelText } = await renderScreen();

    expect(getByLabelText('Morning check-in')).toBeTruthy();
    expect(getByLabelText('Evening check-in')).toBeTruthy();
    expect(getByLabelText('Weekly review')).toBeTruthy();
    expect(getByLabelText('Quiet hours')).toBeTruthy();
  });

  it('saves a toggle the user changes', async () => {
    const { getByLabelText } = await renderScreen();

    fireEvent(getByLabelText('Morning check-in'), 'valueChange', false);

    expect(mockUpdate).toHaveBeenCalledWith({ morningCheckIn: false });
  });

  it('hides a reminder time when its reminder is off', async () => {
    mockState.preferences = { ...defaultPreferences('balanced'), morningCheckIn: false };

    const { queryByLabelText } = await renderScreen();

    expect(queryByLabelText(/Morning check-in time is/)).toBeNull();
  });

  it('steps a time by the hour', async () => {
    const { getByLabelText } = await renderScreen();

    fireEvent.press(getByLabelText('Morning check-in time: one hour later'));

    expect(mockUpdate).toHaveBeenCalledWith({ morningAt: { hour: 10, minute: 0 } });
  });

  /**
   * The failure §75 is written against: a switch that is on and does nothing.
   */
  it('says when a reminder falls inside quiet hours', async () => {
    mockState.preferences = {
      ...defaultPreferences('balanced'),
      morningAt: { hour: 6, minute: 0 },
    };

    const { getByLabelText, getByText } = await renderScreen();

    getByText(/falls inside your quiet hours/);
    // The toggle is not overruled — the user's choice stands and is merely explained.
    expect(getByLabelText('Morning check-in').props.accessibilityState.checked).toBe(true);
  });

  it('says nothing about quiet hours when nothing is suppressed', async () => {
    const { queryByText } = await renderScreen();

    expect(queryByText(/falls inside your quiet hours/)).toBeNull();
  });

  /**
   * iOS grants one prompt per install (spec §74), so it is spent deliberately or not at all.
   */
  it('explains what reminders are before offering the OS prompt', async () => {
    mockState.permission = 'undetermined';

    const { getByText, getByLabelText } = await renderScreen();

    // The card's own heading, not the footer note that happens to use similar words.
    getByText('Turn on reminders');
    getByText(/say nothing about your entries/);
    expect(mockRequestPermission).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('Allow notifications'));

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  /**
   * A second prompt does nothing on iOS, so offering one would be a button that silently fails.
   */
  it('sends a user who already refused to iOS Settings instead of prompting again', async () => {
    mockState.permission = 'denied';
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);

    const { getByLabelText, queryByLabelText } = await renderScreen();

    expect(queryByLabelText('Allow notifications')).toBeNull();

    fireEvent.press(getByLabelText('Open iOS Settings'));

    expect(openSettings).toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();

    openSettings.mockRestore();
  });

  it('offers no permission card once permission is granted', async () => {
    const { queryByLabelText } = await renderScreen();

    expect(queryByLabelText('Allow notifications')).toBeNull();
    expect(queryByLabelText('Open iOS Settings')).toBeNull();
  });
});
