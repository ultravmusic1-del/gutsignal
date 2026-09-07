import { View } from 'react-native';

import { Card, Screen, Text } from '@/components/ui';
import { greetingForHour } from '@/domain/time/greeting';
import { FirstInsightProgress } from '@/features/insights/FirstInsightProgress';
import { QuickLogTiles } from '@/features/logs/QuickLogTiles';
import { TodayEntries } from '@/features/logs/TodayEntries';
import { useLoggedToday } from '@/features/logs/useLoggedToday';
import { todayLocalDate } from '@/features/logs/useSymptomLogs';
import { useTheme } from '@/theme';

/**
 * Today — the daily dashboard (spec §33).
 *
 * Everything here reads local storage, so the day is correct with no connection.
 *
 * The screen is ordered by how soon it stops being useful. The quick-log tiles are for the person
 * who opened the app to record something and wants to leave; the day's entries are for the person
 * checking what they already logged; the progress card is for the person wondering whether any of
 * this is going anywhere. The explainer last, because it is read once.
 *
 * The GutSignal Score is still absent, and stays absent until it means something. A number on this
 * screen would be the first thing anyone looked at, and it would need to be defensible before it
 * could be prominent — inventing one now is the fake-data placeholder the spec forbids.
 */
export default function TodayScreen() {
  const theme = useTheme();
  const greeting = greetingForHour(new Date().getHours());
  const loggedToday = useLoggedToday(todayLocalDate());

  return (
    <Screen scroll floatingNav>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="body" color="secondary">
            {greeting}
          </Text>
          <Text variant="title">How&apos;s your gut today?</Text>
        </View>

        {/* One tap to the most likely entry. The floating + still reaches everything; this
            removes a tap from the common case (spec §33). */}
        <QuickLogTiles loggedToday={loggedToday} hour={new Date().getHours()} />

        <TodayEntries />

        {/* Where this diary has got to, and the single most useful next thing. Replaces nothing —
            it sits above the explainer, which stays for the people who have not read it yet. */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="secondary">
            WHAT THIS IS BUILDING
          </Text>
          <FirstInsightProgress />
        </View>

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
