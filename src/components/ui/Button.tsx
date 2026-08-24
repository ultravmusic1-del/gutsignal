import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'ghostOnInverse' | 'onInverse';
export type ButtonSize = 'large' | 'medium';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Renders full-width. Default for `large`. */
  block?: boolean;
  /** Fires a light impact on press. Off for destructive/secondary actions by default. */
  haptic?: boolean;
  style?: ViewStyle;
};

/**
 * Pill button, per the UI reference: large, rounded, tactile.
 *
 * Accessibility: always ≥44pt tall, always exposes `button` role and a disabled/busy state,
 * and never communicates its state by colour alone (a loading button also stops accepting
 * presses and announces `busy`).
 */
export function Button({
  label,
  variant = 'primary',
  size = 'large',
  loading = false,
  block,
  haptic = variant === 'primary',
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled === true || loading;
  const fullWidth = block ?? size === 'large';

  const surface: Record<ButtonVariant, { bg: string; border?: string }> = {
    primary: { bg: theme.colors.accent.solid },
    secondary: { bg: theme.colors.surface.card, border: theme.colors.border.strong },
    ghost: { bg: 'transparent' },
    // A ghost button on a charcoal surface must not reuse the light-surface accent:
    // accent.text measures 2.70:1 on surface.inverse, well below AA.
    ghostOnInverse: { bg: 'transparent' },
    onInverse: { bg: theme.colors.surface.card },
  };

  const labelColor = {
    primary: 'onAccent',
    secondary: 'primary',
    ghost: 'accent',
    ghostOnInverse: 'accentOnInverse',
    onInverse: 'primary',
  } as const;

  const height = size === 'large' ? 56 : 44;
  const paddingHorizontal = size === 'large' ? theme.spacing.xl : theme.spacing.md;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={(event) => {
        if (haptic) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
            // Haptics are a nicety; a failure must never block the action.
          });
        }
        onPress?.(event);
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal,
          borderRadius: theme.radius.pill,
          backgroundColor: surface[variant].bg,
          borderWidth: surface[variant].border ? StyleSheet.hairlineWidth : 0,
          borderColor: surface[variant].border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.45 : pressed ? 0.82 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? theme.colors.text.onAccent : theme.colors.text.primary}
        />
      ) : (
        <View style={styles.content}>
          <Text variant="button" color={labelColor[variant]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
