import { fireEvent, render, screen } from '@testing-library/react-native';

import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/theme';

import { FloatingTabBar, TAB_DESTINATIONS } from '../FloatingTabBar';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const setup = async (activeKey = 'today') => {
  const onSelect = jest.fn();
  const onLogPress = jest.fn();

  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider scheme="light">
        <FloatingTabBar
          destinations={TAB_DESTINATIONS}
          activeKey={activeKey}
          onSelect={onSelect}
          onLogPress={onLogPress}
        />
      </ThemeProvider>
    </SafeAreaProvider>
  );

  return { onSelect, onLogPress };
};

describe('FloatingTabBar', () => {
  it('exposes exactly the four primary destinations as tabs', async () => {
    await setup();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Timeline' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Insights' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'You' })).toBeTruthy();
  });

  it('does NOT expose logging as a fifth tab', async () => {
    await setup();

    // The spec is explicit (§18): Log is a global action, not a navigation destination.
    const tabNames = screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel);
    expect(tabNames).not.toContain('Log an entry');

    // It exists — as a button, beside the tab list.
    expect(screen.getByRole('button', { name: 'Log an entry' })).toBeTruthy();
  });

  it('marks the active destination as selected', async () => {
    await setup('insights');

    expect(screen.getByRole('tab', { name: 'Insights' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByRole('tab', { name: 'Today' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('reports the selected destination key', async () => {
    const { onSelect } = await setup();

    fireEvent.press(screen.getByRole('tab', { name: 'Timeline' }));

    expect(onSelect).toHaveBeenCalledWith('timeline');
  });

  it('opens logging without changing the selected tab', async () => {
    const { onSelect, onLogPress } = await setup();

    fireEvent.press(screen.getByRole('button', { name: 'Log an entry' }));

    expect(onLogPress).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('gives every control an accessible label, since the bar is icon-only', async () => {
    await setup();

    for (const node of [...screen.getAllByRole('tab'), screen.getByRole('button')]) {
      expect(node.props.accessibilityLabel).toBeTruthy();
    }
  });
});
