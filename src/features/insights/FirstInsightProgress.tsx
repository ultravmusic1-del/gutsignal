import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { firstInsightProgress, type FirstInsightAction } from '@/domain/patterns/progress';
import { useFirstInsightMilestone } from '@/features/insights/useFirstInsightMilestone';
import { useInsights } from '@/features/insights/useInsights';
import { useTheme } from '@/theme';

/**
 * What the diary is building toward, on the screen people actually open.
 *
 * Today used to carry a static "how GutSignal works" card that said the same thing on day one and
 * day ninety. This says where the user actually is — and, when there is finally something to look
 * at, says so and points at it.
 *
 * ## Cost
 *
 * It reads `useInsights`, which runs the pattern engine. That is deliberate rather than careless:
 * the query key and cache are shared with the Insights tab, so opening Today warms the tab and
 * opening the tab warms Today, and the engine is milliseconds at diary scale. Duplicating a
 * lighter-weight readiness calculation here would be faster and would drift, which is the more
 * expensive of the two problems (§37: measure before optimising).
 *
 * While the engine has not answered, this renders nothing at all rather than a skeleton. It is a
 * secondary card on a screen whose primary content — the day's entries — is already there, and a
 * placeholder that flashes for 30ms is worse than one that never appears.
 */

const ACTION: Record<FirstInsightAction, { label: string; route: string }> = {
  log: { label: 'Log something', route: '/log' },
  log_good_day: { label: 'Log a good day', route: '/log/wellbeing' },
  view_insights: { label: 'See what stands out', route: '/(tabs)/insights' },
};

export function FirstInsightProgress() {
  const theme = useTheme();
  const router = useRouter();
  const insights = useInsights();

  // Before the early return, because hooks run unconditionally — and because the crossing is
  // worth recording whether or not this particular card gets to render it.
  useFirstInsightMilestone(insights.isSuccess && insights.data.readiness.kind === 'ready');

  // No skeleton and no error state on purpose: this card is not what the user came for, and a
  // failure to compute it is already reported by the Insights screen itself.
  if (!insights.isSuccess) return null;

  const progress = firstInsightProgress({
    tracking: insights.data.tracking,
    readiness: insights.data.readiness,
  });

  const action = ACTION[progress.action];

  return (
    <Card>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="cardTitle">{progress.title}</Text>
          <Text variant="body" color="secondary">
            {progress.body}
          </Text>
        </View>

        {progress.ready ? null : (
          <View style={{ gap: theme.spacing.xxs }}>
            {progress.steps.map((step) => (
              <View
                key={step.key}
                accessible
                // Read as one thing, and the state is in the words rather than only in the mark —
                // §36 forbids colour or a glyph being the only signal.
                accessibilityLabel={`${step.label}: ${step.detail}. ${step.done ? 'Done' : 'Not yet'}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
              >
                <Text variant="caption" color={step.done ? 'positive' : 'tertiary'}>
                  {step.done ? '✓' : '○'}
                </Text>
                <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                  {step.label}
                </Text>
                <Text variant="caption" color="tertiary">
                  {step.detail}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Button
          label={action.label}
          variant={progress.ready ? 'primary' : 'secondary'}
          size="medium"
          haptic={false}
          onPress={() => router.push(action.route as '/log')}
        />
      </View>
    </Card>
  );
}
