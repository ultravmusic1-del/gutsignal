import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/theme';

export type TabDestination = {
  key: string;
  label: string;
  icon: IconName;
};

export type FloatingTabBarProps = {
  destinations: TabDestination[];
  activeKey: string;
  onSelect: (key: string) => void;
  onLogPress: () => void;
};

/**
 * Floating navigation, taken from the reference: a dark rounded container hovering over the
 * content rather than a full-width bar welded to the bottom edge.
 *
 * The one deliberate divergence from "just copy the reference": the log action is a SEPARATE
 * circular control beside the pill, not a fifth icon inside it. Navigation destinations and
 * a global create action are different things, and the spec (§18) is explicit that Log must
 * not masquerade as a tab.
 *
 * Accessibility: the pill exposes `tablist`/`tab` semantics with a selected state, so
 * VoiceOver announces "Insights, tab, 3 of 4, selected" rather than four unlabelled icons.
 */
export function FloatingTabBar({
  destinations,
  activeKey,
  onSelect,
  onLogPress,
}: FloatingTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const tap = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}
    >
      <View
        accessibilityRole="tablist"
        style={[
          styles.pill,
          {
            backgroundColor: theme.colors.surface.inverse,
            borderRadius: theme.radius.pill,
            paddingHorizontal: theme.spacing.xs,
          },
          theme.shadows.floating,
        ]}
      >
        {destinations.map((destination) => {
          const selected = destination.key === activeKey;

          return (
            <Pressable
              key={destination.key}
              accessibilityRole="tab"
              accessibilityLabel={destination.label}
              accessibilityState={{ selected }}
              onPress={() => {
                tap();
                onSelect(destination.key);
              }}
              style={({ pressed }) => [
                styles.tab,
                {
                  borderRadius: theme.radius.pill,
                  backgroundColor: selected ? theme.colors.accent.solid : 'transparent',
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Icon
                name={destination.icon}
                size={22}
                color={selected ? theme.colors.text.onAccent : theme.colors.text.onInverseSecondary}
              />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log an entry"
        accessibilityHint="Opens meal, symptom, bowel and wellbeing logging"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onLogPress();
        }}
        style={({ pressed }) => [
          styles.logButton,
          {
            backgroundColor: theme.colors.accent.solid,
            borderRadius: theme.radius.pill,
            opacity: pressed ? 0.85 : 1,
          },
          theme.shadows.floating,
        ]}
      >
        <Icon name="plus" size={26} color={theme.colors.text.onAccent} />
      </Pressable>
    </View>
  );
}

/** Height the tab bar occupies, so screens can pad their scroll content past it. */
export const FLOATING_TAB_BAR_HEIGHT = 64;

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    gap: 4,
  },
  tab: {
    width: 52,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logButton: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Exported for the layout and for tests. */
export const TAB_DESTINATIONS: TabDestination[] = [
  { key: 'today', label: 'Today', icon: 'today' },
  { key: 'timeline', label: 'Timeline', icon: 'timeline' },
  { key: 'insights', label: 'Insights', icon: 'insights' },
  { key: 'you', label: 'You', icon: 'you' },
];

/** Re-exported so screens can label sections consistently with navigation. */
export const tabLabel = (key: string): string =>
  TAB_DESTINATIONS.find((d) => d.key === key)?.label ?? key;
