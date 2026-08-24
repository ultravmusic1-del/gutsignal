import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Chip, EmptyState, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/** Timeline filters (spec §48). Kept here until the timeline query lands in Milestone 6. */
const FILTERS = ['All', 'Meals', 'Symptoms', 'Bowel', 'Wellbeing', 'Context', 'Journal'] as const;

type Filter = (typeof FILTERS)[number];

/**
 * Timeline — the chronological gut diary (spec §48).
 *
 * Milestone 2 delivers the shell: header, working filter row, and the designed empty state.
 * The virtualized, paginated list over local SQLite arrives in Milestone 6, once there are
 * logs to show.
 */
export default function TimelineScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>('All');

  return (
    <Screen scroll floatingNav bleed>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.xl }}>
        <View style={{ paddingHorizontal: theme.spacing.gutter }}>
          <Text variant="title">Timeline</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: theme.spacing.xs,
            paddingHorizontal: theme.spacing.gutter,
          }}
        >
          {FILTERS.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={filter === item}
              onPress={() => setFilter(item)}
            />
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: theme.spacing.gutter }}>
          <EmptyState
            title="Nothing logged yet"
            body="Your entries will appear here in the order they happened, grouped by day."
            hint={
              filter === 'All'
                ? undefined
                : `The ${filter} filter is active — clear it to see every entry.`
            }
          />
        </View>
      </View>
    </Screen>
  );
}
