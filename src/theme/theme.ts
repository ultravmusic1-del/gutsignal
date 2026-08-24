import { colors, type ColorScheme } from './colors';
import { motion } from './motion';
import { radius } from './radius';
import { shadows } from './shadows';
import { spacing } from './spacing';
import { typography } from './typography';

export type ColorSchemeName = 'light' | 'dark';

export type Theme = {
  scheme: ColorSchemeName;
  colors: ColorScheme;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadows: typeof shadows;
  motion: typeof motion;
};

export const buildTheme = (scheme: ColorSchemeName): Theme => ({
  scheme,
  colors: colors[scheme],
  spacing,
  radius,
  typography,
  shadows,
  motion,
});

export const themes: Record<ColorSchemeName, Theme> = {
  light: buildTheme('light'),
  dark: buildTheme('dark'),
};
