import type { Meta, StoryObj } from '@storybook/react';

import type { WeeklyReview } from '@/domain/reports/weeklyReview';

import { WeeklySummary } from './WeeklySummary';

/**
 * The week's numbers, in the states a real diary produces.
 *
 * The screen behind this needs a session and a populated database, which makes it the hardest
 * surface in the app to actually look at — and therefore the one where a layout problem would sit
 * unnoticed longest. These stories are how it gets looked at.
 */

const base: WeeklyReview = {
  week: { start: '2026-08-31', end: '2026-09-06', label: '31 August to 6 September' },
  previousWeek: { start: '2026-08-24', end: '2026-08-30' },
  generatedAt: '2026-09-07T09:00:00.000Z',
  depth: 'enough',
  tracking: {
    daysLogged: 6,
    totalDays: 7,
    daysReportedOn: 5,
    daysWithNothingRecorded: 1,
    entries: 18,
  },
  symptomDays: { thisWeek: 3, lastWeek: 5, change: -2, comparable: true },
  goodDays: 2,
  meanWorstSeverity: 6.4,
  bowelEntries: 9,
  standsOut: [],
  emerging: [],
};

const meta = {
  title: 'Reports/WeeklySummary',
  component: WeeklySummary,
  args: { review: base },
} satisfies Meta<typeof WeeklySummary>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A well-tracked week: every metric present, and last week worth showing beside it. */
export const WellTracked: Story = {};

/**
 * The comparison refusing itself.
 *
 * Six tracked days against one is not an improvement, it is a change in how much of the diary got
 * filled in — and the screen says so rather than showing a number that sounds like a finding.
 */
export const NotComparable: Story = {
  args: {
    review: {
      ...base,
      symptomDays: { ...base.symptomDays, comparable: false },
    },
  },
};

/** Barely reported on. The header carries a "Thin week" pill and the caveat sits below. */
export const ThinWeek: Story = {
  args: {
    review: {
      ...base,
      depth: 'thin',
      tracking: {
        ...base.tracking,
        daysLogged: 3,
        daysReportedOn: 1,
        daysWithNothingRecorded: 4,
        entries: 4,
      },
      symptomDays: { thisWeek: 1, lastWeek: 5, change: -4, comparable: false },
      goodDays: 0,
      meanWorstSeverity: 8,
      bowelEntries: 2,
    },
  },
};

/**
 * A perfect week of tracking.
 *
 * Worth its own story because it is the one case where "days with nothing recorded" is absent
 * entirely — and a grid that only looks right with four cells in it is a grid with a bug.
 */
export const EveryDayLogged: Story = {
  args: {
    review: {
      ...base,
      tracking: {
        ...base.tracking,
        daysLogged: 7,
        daysReportedOn: 7,
        daysWithNothingRecorded: 0,
        entries: 31,
      },
      symptomDays: { thisWeek: 2, lastWeek: 2, change: 0, comparable: true },
      goodDays: 5,
    },
  },
};

/** No symptoms at all, and none last week either. Nothing should read as missing. */
export const NoSymptoms: Story = {
  args: {
    review: {
      ...base,
      symptomDays: { thisWeek: 0, lastWeek: 0, change: 0, comparable: true },
      goodDays: 5,
      meanWorstSeverity: null,
    },
  },
};

/** Wide values, to check the two-column grid gives way rather than colliding. */
export const LongContent: Story = {
  args: {
    review: {
      ...base,
      tracking: { ...base.tracking, entries: 128, daysLogged: 7 },
      meanWorstSeverity: 10,
      bowelEntries: 42,
    },
  },
};
