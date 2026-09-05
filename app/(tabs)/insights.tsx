import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { Card, EmptyState, Screen, Text } from '@/components/ui';
import type { Finding } from '@/domain/pattern-engine/types';
import { encodeFindingId } from '@/domain/patterns/findingDetail';
import { readinessCopy } from '@/domain/patterns/insights';
import { PATTERN_STATUS_COPY, PATTERN_STATUSES } from '@/domain/patterns/status';
import { FindingCard } from '@/features/insights/FindingCard';
import { GutMap } from '@/features/insights/GutMap';
import { useInsights } from '@/features/insights/useInsights';
import { useTheme } from '@/theme';

/**
 * Insights — what recurs in the user's own records (spec §49).
 *
 * Two sections, deliberately few. "What stands out" leads with the substantiated findings;
 * "Worth investigating" holds early signals apart so they are not mistaken for conclusions.
 * Spec §49 warns against twenty charts at once, and the engine can generate dozens of results —
 * showing them all would bury the one that matters.
 *
 * **The empty state is the common case.** A new user sees it for weeks. It says what the engine
 * is waiting for rather than "nothing yet", and it never promises a finding will appear: it may
 * genuinely be that nothing in this diary relates to anything else.
 *
 * Gut Map, Trends, Experiments and Weekly review are also §49 sections. They are not here
 * because they need data or milestones that do not exist yet, and a heading over an empty box
 * is the placeholder this product does not ship.
 */
export default function InsightsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insights = useInsights();

  const openFinding = useCallback(
    (finding: Finding) => {
      router.push({
        pathname: '/pattern/[id]',
        params: { id: encodeFindingId(finding) },
      });
    },
    [router]
  );

  const header = (
    <View style={{ gap: theme.spacing.xxs }}>
      <Text variant="title">Insights</Text>
      <Text variant="caption" color="secondary">
        What recurs in your own records — never a diagnosis, and never a cause.
      </Text>
    </View>
  );

  if (insights.isPending) {
    return (
      <Screen scroll floatingNav>
        <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xl }}>
          {header}
          <Card>
            <Text variant="body" color="secondary">
              Looking through your logs…
            </Text>
          </Card>
        </View>
      </Screen>
    );
  }

  if (insights.isError) {
    return (
      <Screen scroll floatingNav>
        <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xl }}>
          {header}
          <EmptyState
            title="Your insights could not be worked out"
            body="Nothing has been lost — this is a problem reading from this device, not with your saved entries. Reopening the app usually clears it."
          />
        </View>
      </Screen>
    );
  }

  const { standsOut, emerging, gutMap, summary, readiness } = insights.data;
  const copy = readinessCopy(readiness);

  return (
    <Screen scroll floatingNav>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xl }}>
        {header}

        {readiness.kind === 'ready' ? (
          <>
            {standsOut.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="overline" color="secondary">
                  WHAT STANDS OUT
                </Text>
                {standsOut.map((finding) => (
                  <FindingCard
                    key={encodeFindingId(finding)}
                    finding={finding}
                    onPress={openFinding}
                  />
                ))}
              </View>
            ) : null}

            {emerging.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="overline" color="secondary">
                  WORTH INVESTIGATING
                </Text>
                <Text variant="caption" color="secondary">
                  Early differences, based on fewer observations. Worth watching rather than acting
                  on.
                </Text>
                {emerging.map((finding) => (
                  <FindingCard
                    key={encodeFindingId(finding)}
                    finding={finding}
                    onPress={openFinding}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <EmptyState title={copy.title} body={copy.body} hint={copy.hint} />
        )}

        {/* The Gut Map (spec §52) — the landscape rather than the highlights, and the only
            place a factor that came to nothing is visible at all. It carries the scale of the
            search in its subtitle, so a finding is read against everything else examined. */}
        {gutMap.length > 0 ? (
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ gap: theme.spacing.xxs }}>
              <Text variant="overline" color="secondary">
                YOUR GUT MAP
              </Text>
              <Text variant="caption" color="secondary">
                Everything GutSignal examined: {summary.factors}{' '}
                {summary.factors === 1 ? 'thing' : 'things'} you logged, across{' '}
                {summary.comparisons} {summary.comparisons === 1 ? 'comparison' : 'comparisons'}.
              </Text>
            </View>

            <GutMap groups={gutMap} onSelect={openFinding} />
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="secondary">
            WHAT THESE MEAN
          </Text>

          <Card>
            <View style={{ gap: theme.spacing.md }}>
              {PATTERN_STATUSES.map((status) => (
                <View key={status} style={{ gap: 2 }}>
                  <Text variant="cardTitle">{PATTERN_STATUS_COPY[status].label}</Text>
                  <Text variant="body" color="secondary">
                    {PATTERN_STATUS_COPY[status].description}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <Card elevation="flat">
            <Text variant="caption" color="secondary">
              These describe how consistently something appeared alongside your symptoms in your own
              logs. They are not diagnoses, and they do not establish that one factor caused
              another.
            </Text>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
