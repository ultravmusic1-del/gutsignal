import { View } from 'react-native';

import { Card, Screen, Text } from '@/components/ui';
import { greetingForHour } from '@/domain/time/greeting';
import { useTheme } from '@/theme';

/**
 * Today — the daily dashboard (spec §33).
 *
 * Milestone 2 delivers the shell and its empty state. The quick-log tiles, GutSignal Score
 * and context row arrive with logging (M5) and scoring (M8): rendering them now with invented
 * numbers would be exactly the fake-data placeholder the spec forbids.
 */
export default function TodayScreen() {
  const theme = useTheme();
  const greeting = greetingForHour(new Date().getHours());

  return (
    <Screen scroll floatingNav>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="body" color="secondary">
            {greeting}
          </Text>
          <Text variant="title">How&apos;s your gut today?</Text>
        </View>

        <Card>
          <Text variant="cardTitle">Nothing logged today</Text>
          <View style={{ height: theme.spacing.xxs }} />
          <Text variant="body" color="secondary">
            Your day starts empty. Anything you record — a meal, a symptom, a bowel movement, or
            simply that you feel good — becomes part of what GutSignal can compare later.
          </Text>
          <View style={{ height: theme.spacing.sm }} />
          <Text variant="caption" color="tertiary">
            Use the + button to add an entry.
          </Text>
        </Card>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="secondary">
            HOW GUTSIGNAL WORKS
          </Text>

          <Card>
            <View style={{ gap: theme.spacing.md }}>
              <View style={{ gap: 2 }}>
                <Text variant="cardTitle">Log normally</Text>
                <Text variant="body" color="secondary">
                  Food, symptoms and bowel patterns — in seconds, not forms.
                </Text>
              </View>

              <View style={{ gap: 2 }}>
                <Text variant="cardTitle">Find repeating signals</Text>
                <Text variant="body" color="secondary">
                  GutSignal compares what you record over time and looks for associations that
                  recur.
                </Text>
              </View>

              <View style={{ gap: 2 }}>
                <Text variant="cardTitle">Test assumptions</Text>
                <Text variant="body" color="secondary">
                  Explore the factors you already suspect, without jumping to conclusions.
                </Text>
              </View>
            </View>
          </Card>

          <Card elevation="flat">
            <Text variant="caption" color="secondary">
              GutSignal identifies associations in your data. It does not diagnose conditions or
              prove that one factor caused a symptom.
            </Text>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
