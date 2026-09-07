import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, EmptyState, Screen, Text } from '@/components/ui';
import type { WeeklyReview } from '@/domain/reports/weeklyReview';
import { encodeFindingId } from '@/domain/patterns/findingDetail';
import { FindingCard } from '@/features/insights/FindingCard';
import { useWeeklyReview } from '@/features/reports/useWeeklyReview';
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

        {review.depth === 'quiet' ? <QuietWeek /> : <WeekNumbers review={review} />}

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

function WeekNumbers({ review }: { review: WeeklyReview }) {
  const theme = useTheme();

  const { tracking, symptomDays } = review;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Card>
        <Text variant="cardTitle">What you recorded</Text>
        <View style={{ height: theme.spacing.sm }} />

        <Row label="Days with an entry" value={`${tracking.daysLogged} of ${tracking.totalDays}`} />
        <Row label="Entries" value={String(tracking.entries)} />
        <Row label="Days you said how you felt" value={String(tracking.daysReportedOn)} />

        {/*
          Named, never folded into a rate. §19: absence of a log is not absence of a symptom.
        */}
        {tracking.daysWithNothingRecorded > 0 ? (
          <Row
            label="Days with nothing recorded"
            value={String(tracking.daysWithNothingRecorded)}
            muted
          />
        ) : null}
      </Card>

      <Card>
        <Text variant="cardTitle">How the week read</Text>
        <View style={{ height: theme.spacing.sm }} />

        <Row
          label="Days you recorded a symptom"
          value={`${symptomDays.thisWeek} of ${tracking.daysReportedOn} reported on`}
        />

        {review.goodDays > 0 ? (
          <Row label="Days you recorded feeling good" value={String(review.goodDays)} />
        ) : null}

        {review.meanWorstSeverity === null ? null : (
          <Row
            label="Average worst severity on those days"
            value={`${review.meanWorstSeverity} of 10`}
          />
        )}

        {review.bowelEntries > 0 ? (
          <Row label="Bowel entries" value={String(review.bowelEntries)} />
        ) : null}

        <View style={{ height: theme.spacing.sm }} />
        <Comparison review={review} />
      </Card>

      {review.depth === 'thin' ? (
        <Text variant="caption" color="secondary">
          You said how you felt on {tracking.daysReportedOn}{' '}
          {tracking.daysReportedOn === 1 ? 'day' : 'days'} this week, so there is not much for the
          review to go on. Days without an entry are not counted as good days.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Last week, beside this week — or an honest explanation of why not.
 *
 * The wording is the whole point. "Two fewer days with a symptom recorded" is a fact about the
 * diary. "Two days better" would be a claim about the person, which seven days of self-report
 * cannot support.
 */
function Comparison({ review }: { review: WeeklyReview }) {
  const { symptomDays } = review;

  if (!symptomDays.comparable) {
    return (
      <Text variant="caption" color="secondary">
        Last week is not shown beside this one: the two weeks were not tracked closely enough for
        the difference to mean anything.
      </Text>
    );
  }

  if (symptomDays.change === 0) {
    return (
      <Text variant="caption" color="secondary">
        The same number of days as the week before.
      </Text>
    );
  }

  const size = Math.abs(symptomDays.change);
  const direction = symptomDays.change < 0 ? 'fewer' : 'more';

  return (
    <Text variant="caption" color="secondary">
      {size} {size === 1 ? 'day' : 'days'} {direction} with a symptom recorded than the week before
      ({symptomDays.lastWeek}).
    </Text>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  const theme = useTheme();

  return (
    <View
      // One accessibility element, so VoiceOver reads "Entries, 12" rather than two fragments.
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: 32,
      }}
    >
      <Text variant="body" color={muted ? 'secondary' : 'primary'} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="body" color={muted ? 'secondary' : 'primary'}>
        {value}
      </Text>
    </View>
  );
}
