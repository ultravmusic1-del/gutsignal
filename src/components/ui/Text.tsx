import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme';
import type { TypeStyle, TypographyToken } from '@/theme';

type ColorToken =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'onInverse'
  | 'onInverseSecondary'
  | 'onAccent'
  | 'accent'
  | 'accentOnInverse'
  | 'positive'
  | 'caution'
  | 'danger';

export type TextProps = RNTextProps & {
  variant?: TypographyToken;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
};

/**
 * The only Text component in the app.
 *
 * Using it directly (rather than RN's Text) is what keeps typography and colour on tokens —
 * and it keeps Dynamic Type working, because scaling stays on and the per-variant cap comes
 * from the typography token rather than from whatever a call site remembers to pass.
 */
export function Text({ variant = 'body', color = 'primary', align, style, ...rest }: TextProps) {
  const theme = useTheme();
  const { maxFontSizeMultiplier, ...typeStyle }: TypeStyle = theme.typography[variant];

  const palette: Record<ColorToken, string> = {
    primary: theme.colors.text.primary,
    secondary: theme.colors.text.secondary,
    tertiary: theme.colors.text.tertiary,
    onInverse: theme.colors.text.onInverse,
    onInverseSecondary: theme.colors.text.onInverseSecondary,
    onAccent: theme.colors.text.onAccent,
    accent: theme.colors.accent.text,
    accentOnInverse: theme.colors.accent.onInverse,
    positive: theme.colors.status.positive,
    caution: theme.colors.status.caution,
    danger: theme.colors.status.danger,
  };

  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typeStyle, { color: palette[color], textAlign: align }, style]}
      {...rest}
    />
  );
}
