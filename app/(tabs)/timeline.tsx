import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, ScrollView, SectionList, View } from 'react-native';

import { Chip, EmptyState, Screen, Text, TextField } from '@/components/ui';
import {
  TIMELINE_FILTERS,
  editRouteFor,
  groupByLocalDate,
  type LogEntry,
  type TimelineFilterKey,
} from '@/domain/logs/entry';
import { formatDayHeading } from '@/domain/time/occurrence';
import { useSettledEvent } from '@/features/analytics/useSettledEvent';
import { todayLocalDate } from '@/features/logs/useSymptomLogs';
import { TimelineEntryRow } from '@/features/timeline/TimelineEntryRow';
import { useDeleteEntry, useTimeline, useTimelineCount } from '@/features/timeline/useTimeline';
import { useTimelineFilters } from '@/state/timelineFilters';
import { track } from '@/services/analytics/analytics';
import { useTheme } from '@/theme';

/**
 * Timeline — the chronological gut diary (spec §48).
 *
 * Virtualized with `SectionList`, paged from local storage by keyset cursor, and grouped by the
 * local calendar day each entry was filed under. Everything renders from SQLite, so a year of
 * history scrolls identically with no connection.
 *
 * The filter and search live in a store rather than in this screen, so browsing state survives
 * opening an entry and coming back — which is what filtering is usually *for*.
 */
export default function TimelineScreen() {
  const theme = useTheme();
  const router = useRouter();

  const { filter, search, setFilter, setSearch } = useTimelineFilters();
  const selected = TIMELINE_FILTERS.find((option) => option.key === filter) ?? TIMELINE_FILTERS[0];

  // Reported when the typing settles, never per keystroke, and the text itself never leaves the
  // hook — the event is property-free because a search string is something a person typed about
  // their own health (§29).
  useSettledEvent('timeline_searched', search);

  const changeFilter = (key: TimelineFilterKey) => {
    // Re-tapping the chip you are already on is not a filter change, and counting it would make
    // the number a measure of fidgeting.
    if (key !== filter) track('timeline_filtered');
    setFilter(key);
  };

  const timeline = useTimeline({ kind: selected.kind, search });
  const totalEntries = useTimelineCount();
  const deleteEntry = useDeleteEntry();

  const today = todayLocalDate();

  const sections = useMemo(() => {
    const entries = (timeline.data ?? []).flatMap((page) => page.entries);
    return groupByLocalDate(entries).map((day) => ({
      title: formatDayHeading(day.localDate, today),
      localDate: day.localDate,
      data: day.entries,
    }));
  }, [timeline.data, today]);

  const onEdit = useCallback(
    (entry: LogEntry) => router.push(editRouteFor(entry) as '/log/symptom'),
    [router]
  );

  const onDelete = useCallback(
    (entry: LogEntry) => deleteEntry.mutate({ kind: entry.kind, id: entry.id }),
    [deleteEntry]
  );

  const renderItem = useCallback(
    ({ item }: { item: LogEntry }) => (
      <View style={{ paddingHorizontal: theme.spacing.gutter, paddingBottom: theme.spacing.xs }}>
        <TimelineEntryRow entry={item} onEdit={onEdit} onDelete={onDelete} />
      </View>
    ),
    [onEdit, onDelete, theme.spacing.gutter, theme.spacing.xs]
  );

  const isFiltering = selected.kind !== null || search.trim() !== '';
  const hasAnyEntries = (totalEntries.data ?? 0) > 0;

  const header = (
    <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.xl }}>
      <View style={{ paddingHorizontal: theme.spacing.gutter }}>
        <Text variant="title">Timeline</Text>
      </View>

      <View style={{ paddingHorizontal: theme.spacing.gutter }}>
        <TextField
          label="Search"
          hint="Meals, items and anything you noted"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: theme.spacing.xs,
          paddingHorizontal: theme.spacing.gutter,
        }}
      >
        {TIMELINE_FILTERS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            selected={filter === option.key}
            onPress={() => changeFilter(option.key)}
          />
        ))}
      </ScrollView>
    </View>
  );

  const emptyState = timeline.isPending ? (
    <View style={{ paddingHorizontal: theme.spacing.gutter, paddingTop: theme.spacing.xl }}>
      <Text variant="body" color="secondary">
        Loading your diary…
      </Text>
    </View>
  ) : timeline.isError ? (
    <View style={{ paddingHorizontal: theme.spacing.gutter, paddingTop: theme.spacing.xl }}>
      <EmptyState
        title="Your diary could not be read"
        body="Nothing has been lost — this is a problem reading from this device, not with your saved entries. Reopening the app usually clears it."
      />
    </View>
  ) : (
    <View style={{ paddingHorizontal: theme.spacing.gutter, paddingTop: theme.spacing.xl }}>
      {/* Two different situations that need completely different words. */}
      {isFiltering && hasAnyEntries ? (
        <EmptyState
          title="Nothing matches"
          body="No entries match this filter and search. Clearing them brings your whole diary back."
        />
      ) : (
        <EmptyState
          title="Nothing logged yet"
          body="Your entries will appear here in the order they happened, grouped by day."
          hint="Use the + button to add your first one."
        />
      )}
    </View>
  );

  return (
    <Screen floatingNav bleed>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={emptyState}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View
            style={{
              paddingHorizontal: theme.spacing.gutter,
              paddingTop: theme.spacing.lg,
              paddingBottom: theme.spacing.sm,
              backgroundColor: theme.colors.surface.primary,
            }}
          >
            <Text variant="overline" color="secondary">
              {section.title.toUpperCase()}
            </Text>
          </View>
        )}
        // Pages are fetched as the user approaches the end rather than all at once, which is
        // what keeps a multi-year diary from ever being loaded into memory (CLAUDE.md §37).
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (timeline.hasNextPage && !timeline.isFetchingNextPage) void timeline.fetchNextPage();
        }}
        ListFooterComponent={
          timeline.isFetchingNextPage ? (
            <View style={{ paddingVertical: theme.spacing.lg }}>
              <ActivityIndicator accessibilityLabel="Loading more entries" />
            </View>
          ) : (
            <View style={{ height: theme.spacing.xxl }} />
          )
        }
        // Modest windowing: entries are short and uniform, so a small buffer keeps memory flat
        // without the blank cells an aggressive setting causes while scrolling fast.
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews
      />
    </Screen>
  );
}
