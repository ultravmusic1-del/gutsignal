import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type TextFieldProps = TextInputProps & {
  label: string;
  /** Validation or server error. Announced to screen readers, not just coloured red. */
  error?: string;
  hint?: string;
  /**
   * Hides the label visually, keeping it for assistive technology.
   *
   * For the one case where a visible label is genuinely redundant: a search field whose
   * placeholder already says what it searches. The label is never *removed* — an input a screen
   * reader announces as 'text field' and nothing else is unusable, and making the label optional
   * would let a call site do exactly that.
   */
  labelHidden?: boolean;
};

/**
 * Single-line text input.
 *
 * The error is rendered as text and wired into `accessibilityLabel`/`aria-invalid` rather
 * than being signalled by a red border alone — colour is never the only carrier of meaning
 * (CLAUDE.md §36).
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, labelHidden = false, style, ...rest },
  ref
) {
  const theme = useTheme();
  const hasError = Boolean(error);

  return (
    <View style={{ gap: theme.spacing.xxs }}>
      {labelHidden ? null : (
        <Text variant="caption" color="secondary">
          {label}
        </Text>
      )}

      <TextInput
        ref={ref}
        accessibilityLabel={label}
        aria-invalid={hasError}
        placeholderTextColor={theme.colors.text.tertiary}
        style={[
          {
            minHeight: 52,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.surface.card,
            borderWidth: 1,
            borderColor: hasError ? theme.colors.status.danger : theme.colors.border.subtle,
            color: theme.colors.text.primary,
            fontSize: theme.typography.body.fontSize,
          },
          style,
        ]}
        {...rest}
      />

      {error ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
