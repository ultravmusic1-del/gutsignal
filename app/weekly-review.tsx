import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, EmptyState, Screen, Text } from '@/components/ui';
import type { WeeklyReview } from '@/domain/reports/weeklyReview';
import { encodeFindingId } from '@/domain/patterns/findingDetail';
import { FindingCard } from '@/features/insights/FindingCard';
import { useWeeklyReview } from '@/features/reports/useWeeklyReview';
import { WeeklySummary } from '@/features/reports/WeeklySummary';
import { useTheme } from '@/theme';

/**
 * The weekly review (spec §9).
 *
 * Where the "Your weekly review is ready" reminder lands. Until this existed that notification
 * opened the app at whatever screen was last shown, which is a promise the app could not keep.
 *
 * ## The copy rules this screen lives under
 *
 * Nothing here narrates a direction. The week's numbers sit beside last week's when the two are
 * comparable, and the sentence says what was *recorded* rather than what happened — "you recorded
 * symptoms on two fewer days", never "you improved". Two weeks is not a trend, and a diary
 * measures reporting, not health (`CLAUDE.md` §17, §19, §21).
 *
 * Days with nothing recorded are named on the screen rather than folded into a denominator. A user
 * who logged twice and sees "symptoms on 2 of 7 days" would read five days of silence as five good
 * days, which is the exact misreading §19 forbids.
 */
export default function WeeklyReviewScreen() {
  const theme = useTheme();
  const review = useWeeklyReview();

  if (review.isLoading) {
    return (
      <Screen>
        <View style={{ paddingTop: theme.spacing.xxl }}>
          <Text variant="body" color="secondary">
            Looking back over your week…
          </Text>
        </View>
      </Screen>
    );
  }

  if (review.isError || review.data === undefined) {
    return (
      <Screen>
        <View style={{ paddingTop: theme.spacing.xxl, gap: theme.spacing.sm }}>
          <Text variant="title">Your week could not be loaded</Text>
          <Text variant="body" color="secondary">
            Your entries are safe on this device. Try again in a moment.
          </Text>
        </View>
      </Screen>
    );
  }

  return <Review review={review.data} />;
}

function Review({ review }: { review: WeeklyReview }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="overline" color="accent">
            YOUR WEEK
          </Text>
          <Text variant="title">{review.week.label}</Text>
        </View>

        {review.depth === 'quiet' ? <QuietWeek /> : <WeeklySummary review={review} />}

        {review.standsOut.length === 0 ? null : (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="cardTitle">What stands out</Text>
            {/*
              From the user's whole diary, not from this week. Seven days cannot support an
              association, and the review says so rather than implying these came out of the week.
            */}
            <Text variant="caption" color="secondary">
              From your diary as a whole, not from this week alone.
            </Text>
            {review.standsOut.map((finding) => (
              <FindingCard
                key={encodeFindingId(finding)}
                finding={finding}
                onPress={() =>
                  router.push({
                    pathname: '/pattern/[id]',
                    params: { id: encodeFindingId(finding) },
                  })
                }
              />
            ))}
          </View>
        )}

        <Text variant="caption" color="tertiary">
          These are counts from your own entries over seven days. GutSignal describes what you
          recorded; it does not diagnose, and a week is too short to establish that one thing caused
          another.
        </Text>
      </View>
    </Screen>
  );
}

/**
 * A week with nothing in it.
 *
 * Not an error and not framed as a failure. Showing zeroes here would be worse than saying
 * nothing: a row reading "symptoms on 0 days" is indistinguishable from a genuinely good week.
 */
function QuietWeek() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={{ gap: theme.spacing.md }}>
      <EmptyState
        title="Nothing recorded this week"
        body="There is nothing to look back on. Days without an entry are not counted as good days — GutSignal only describes what you recorded."
        hint="A few entries are enough for next week's review to have something to say."
      />
      <Button label="Log something" onPress={() => router.push('/log')} />
    </View>
  );
}
