import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme';

import { Button } from '../Button';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider scheme="light">{ui}</ThemeProvider>);

describe('Button', () => {
  it('exposes a button role and its label to assistive technology', async () => {
    await renderWithTheme(<Button label="Get started" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Get started' })).toBeTruthy();
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button label="Log my first entry" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Log my first entry' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while loading, and announces itself as busy', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button label="Saving" loading onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Saving' });
    fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    expect(button.props.accessibilityState).toMatchObject({ busy: true });
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button label="Continue" disabled onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('meets the minimum touch target height in both sizes', async () => {
    await renderWithTheme(
      <>
        <Button label="Large" size="large" />
        <Button label="Medium" size="medium" />
      </>
    );

    for (const name of ['Large', 'Medium']) {
      const style = screen.getByRole('button', { name }).props.style;
      const flattened = Array.isArray(style) ? Object.assign({}, ...style.flat()) : style;
      expect(flattened.height).toBeGreaterThanOrEqual(44);
    }
  });
});
