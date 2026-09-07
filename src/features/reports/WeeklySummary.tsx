import { Children } from 'react';
import { View } from 'react-native';

import { Card, Metric, SectionHeader, StatusPill, Text } from '@/components/ui';
import type { WeeklyReview } from '@/domain/reports/weeklyReview';
import { useTheme } from '@/theme';

/**
 * The week's numbers.
 *
 * Extracted from the screen so it can be worked on in Storybook against a real `WeeklyReview` —
 * the screen itself needs a session and a populated database, which makes it the hardest surface
 * in the app to look at and therefore the one most likely to go unexamined.
 *
 * ## What changed, and why
 *
 * This was a stack of label/value rows: "Days with an entry … 5 of 7". Readable, and completely
 * flat — the week's tracking, a footnote and a caveat all carried the same weight, so the screen
 * gave the eye nowhere to land and read as a settings page about a week rather than a look at one.
 *
 * The numbers are now numbers. That is the whole change, and it is deliberately the *only* change:
 * every string, threshold and honesty rule is untouched. Days with nothing recorded are still
 * named rather than folded into a rate (§19), the comparison still refuses itself when the two
 * weeks are not comparable, and nothing narrates a direction (§17, §21).
 *
 * One thing the new treatment adds rather than restyles: "days with nothing recorded" now carries
 * a `caution` tone. It is the number most likely to be misread as good news, and giving it a
 * visual weight equal to the others was quietly letting it pass as one.
 */
export function WeeklySummary({ review }: { review: WeeklyReview }) {
  const theme = useTheme();

  const { tracking, symptomDays } = review;

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader
          overline="What you recorded"
          title="Your tracking"
          action={review.depth === 'thin' ? <StatusPill label="Thin week" tone="caution" /> : null}
        />

        <Card>
          <MetricGrid>
            <Metric
              label="Days with an entry"
              value={String(tracking.daysLogged)}
              unit={`of ${tracking.totalDays}`}
            />
            <Metric label="Entries" value={String(tracking.entries)} tone="muted" />
            <Metric
              label="Days you said how you felt"
              value={String(tracking.daysReportedOn)}
              unit={`of ${tracking.totalDays}`}
            />
            {tracking.daysWithNothingRecorded > 0 ? (
              <Metric
                label="Days with nothing recorded"
                value={String(tracking.daysWithNothingRecorded)}
                tone="caution"
                basis="not counted as good days"
              />
            ) : null}
          </MetricGrid>
        </Card>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader overline="How the week read" title="Symptoms and good days" />

        <Card>
          <MetricGrid>
            <Metric
              label="Days you recorded a symptom"
              value={String(symptomDays.thisWeek)}
              unit={`of ${tracking.daysReportedOn}`}
              basis="of the days you reported on"
            />

            {review.goodDays > 0 ? (
              <Metric
                label="Days you recorded feeling good"
                value={String(review.goodDays)}
                tone="positive"
              />
            ) : null}

            {review.meanWorstSeverity === null ? null : (
              <Metric
                label="Average worst severity"
                value={String(review.meanWorstSeverity)}
                unit="of 10"
                basis="on the days you recorded one"
              />
            )}

            {review.bowelEntries > 0 ? (
              <Metric label="Bowel entries" value={String(review.bowelEntries)} tone="muted" />
            ) : null}
          </MetricGrid>

          <View style={{ height: theme.spacing.md }} />
          <Comparison review={review} />
        </Card>
      </View>

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
 * Two columns on a phone.
 *
 * The cell is sized here rather than at each call site. Left to size themselves, metrics with long
 * labels claimed a whole row while short ones paired up, so the same card rendered as two columns,
 * then one, then one — which reads as a layout bug rather than as a grid.
 *
 * `flexBasis` at just under half with `flexGrow` is what makes it degrade properly: two columns
 * while they fit, one column at a large Dynamic Type size, and never a cell squeezed so narrow
 * that a number wraps.
 */
function MetricGrid({ children }: { children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: theme.spacing.lg,
        columnGap: theme.spacing.md,
      }}
    >
      {Children.map(children, (child) =>
        child === null || child === undefined || child === false ? null : (
          <View style={{ flexBasis: '44%', flexGrow: 1, minWidth: 128 }}>{child}</View>
        )
      )}
    </View>
  );
}

/**
 * Last week beside this week — or an honest explanation of why not.
 *
 * The wording is unchanged from the original screen, and it is the part that matters: "two fewer
 * days with a symptom recorded" is a fact about a diary; "two days better" would be a claim about
 * a person that seven days of self-report cannot support.
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
