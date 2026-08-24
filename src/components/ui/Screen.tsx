import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Scrollable content. Use `false` for screens that manage their own list. */
  scroll?: boolean;
  /** Inverted charcoal background — welcome and onboarding hero screens. */
  inverse?: boolean;
  /** Removes the default horizontal gutter (full-bleed lists, charts). */
  bleed?: boolean;
  contentStyle?: ViewStyle;
};

/**
 * Screen container: background, safe areas and the standard horizontal gutter in one place,
 * so no screen re-invents insets.
 */
export function Screen({
  children,
  scroll = false,
  inverse = false,
  bleed = false,
  contentStyle,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const background = inverse ? theme.colors.surface.inverse : theme.colors.surface.primary;

  const content: ViewStyle = {
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingHorizontal: bleed ? 0 : theme.spacing.gutter,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[styles.fill, { backgroundColor: background }]}
        contentContainerStyle={[content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: background }, content, contentStyle]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
