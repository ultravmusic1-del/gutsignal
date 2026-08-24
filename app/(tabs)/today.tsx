import { View } from 'react-native';

import { Card, Screen, Text } from '@/components/ui';
import { greetingForHour } from '@/domain/time/greeting';
import { TodayEntries } from '@/features/logs/TodayEntries';
import { useTheme } from '@/theme';

/**
 * Today — the daily dashboard (spec §33).
 *
 * Meals and symptoms are real as of Milestone 5 and read from local storage, so the day is
 * correct with no connection. The quick-log tiles and GutSignal Score arrive with the
 * remaining log types and the engine (M8): rendering them now with invented numbers would be
 * exactly the fake-data placeholder the spec forbids.
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

        <TodayEntries />

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
