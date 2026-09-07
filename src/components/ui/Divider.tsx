import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <View
      // Cross-platform: React Native maps aria-hidden to accessibilityElementsHidden on iOS and
      // importantForAccessibility on Android, and react-native-web maps it to the DOM attribute.
      // The platform-specific pair is passed through verbatim on web, where React warns on it.
      aria-hidden
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.border.subtle,
        marginLeft: inset,
      }}
    />
  );
}
