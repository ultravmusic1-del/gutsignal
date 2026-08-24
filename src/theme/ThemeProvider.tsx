import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { themes, type ColorSchemeName, type Theme } from './theme';

const ThemeContext = createContext<Theme>(themes.light);
const ReducedMotionContext = createContext<boolean>(false);

type Props = {
  children: ReactNode;
  /** Force a scheme. Used by tests and by the deliberately-dark welcome flow. */
  scheme?: ColorSchemeName;
};

export function ThemeProvider({ children, scheme }: Props) {
  const systemScheme = useColorScheme();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReducedMotion(enabled);
      })
      .catch(() => {
        // Accessibility settings are best-effort; motion simply stays enabled.
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) =>
      setReducedMotion(enabled)
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const theme = useMemo(
    () => themes[scheme ?? (systemScheme === 'dark' ? 'dark' : 'light')],
    [scheme, systemScheme]
  );

  return (
    <ThemeContext.Provider value={theme}>
      <ReducedMotionContext.Provider value={reducedMotion}>
        {children}
      </ReducedMotionContext.Provider>
    </ThemeContext.Provider>
  );
}

export const useTheme = (): Theme => useContext(ThemeContext);

/**
 * True when the user has asked the OS to reduce motion. Every animation must check this
 * and fall back to an instant state change (CLAUDE.md §36).
 */
export const useReducedMotion = (): boolean => useContext(ReducedMotionContext);
