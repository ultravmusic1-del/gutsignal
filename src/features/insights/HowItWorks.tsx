import { View } from 'react-native';

import { Card, SectionHeader, Text } from '@/components/ui';
import { useInsights } from '@/features/insights/useInsights';
import { useTheme } from '@/theme';

/**
 * How GutSignal works — for someone who has not used it yet.
 *
 * ## Why this is conditional now
 *
 * It used to sit permanently at the bottom of Today. On day one that is genuinely useful: a new
 * user has an empty screen and no idea what the app is going to do with what they log. By day ten
 * it is three paragraphs of marketing under the thing they actually opened the app for, and it
 * pushes the day's entries and their progress further up the scroll every single time.
 *
 * So it appears while the diary is empty and retires once it is not. Nothing is hidden: the same
 * explanation is on the Insights screen's readiness copy, which is where someone wondering "what
 * is this building towards" would look.
 *
 * The non-diagnostic line is the exception and is **not** conditional — it stays on Today
 * permanently, below. A disclaimer that disappears once the user is engaged is a disclaimer shown
 * to the people least likely to need it (`CLAUDE.md` §17, §56).
 */
export function HowItWorks() {
  const theme = useTheme();
  const insights = useInsights();

  // Shown only for a diary with nothing in it. While the engine has not answered, nothing renders
  // rather than a card that appears a beat late and shoves the screen down.
  if (!insights.isSuccess || insights.data.tracking.daysLogged > 0) return null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader overline="New here" title="How GutSignal works" />

      <Card>
        <View style={{ gap: theme.spacing.md }}>
          <Step
            title="Log normally"
            body="Food, symptoms and bowel patterns — in seconds, not forms."
          />
          <Step
            title="Find repeating signals"
            body="GutSignal compares what you record over time and looks for associations that recur."
          />
          <Step
            title="Test assumptions"
            body="Explore the factors you already suspect, without jumping to conclusions."
          />
        </View>
      </Card>
    </View>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="cardTitle">{title}</Text>
      <Text variant="body" color="secondary">
        {body}
      </Text>
    </View>
  );
}
