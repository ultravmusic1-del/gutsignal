import type { Meta, StoryObj } from '@storybook/react';

import { EmptyState } from './EmptyState';

/**
 * The state a new user sees for weeks.
 *
 * §32 forbids promising that an insight will appear after N days, and §17 forbids anything
 * diagnostic — so the copy is as constrained as the layout. These are the real strings from
 * `readinessCopy`, not invented ones, because the wording is the component's hardest part.
 */
const meta = {
  title: 'UI/EmptyState',
  component: EmptyState,
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoLogsYet: Story = {
  args: {
    title: 'Nothing to compare yet',
    body: 'GutSignal looks for things that show up together in your own records. Once there are a couple of weeks of entries, it can start comparing them.',
    hint: 'Use the + button to log a meal or how you are feeling.',
  },
};

/** The most common blocker, and the least guessable one. */
export const NeedsGoodDays: Story = {
  args: {
    title: 'One thing would unlock this',
    body: 'You have recorded symptoms on 9 days, but no days where you felt fine. Comparing needs both — without the good days there is nothing to weigh the difficult ones against.',
    hint: 'On a day that goes well, tap + and choose "Feeling good". It takes one tap.',
  },
};

/** "We looked and found nothing" is a result, and must not read as a failure. */
export const LookedAndFoundNothing: Story = {
  args: {
    title: 'Nothing stands out yet',
    body: 'GutSignal compared 14 combinations in this period and found no consistent relationship. That is a real result, not a gap — sometimes there genuinely is not a pattern to find.',
    hint: 'Keep logging. Patterns that are real tend to show up as there is more to compare.',
  },
};

/** Without the optional third line, which is the shape most call sites use. */
export const WithoutHint: Story = {
  args: {
    title: 'No entries match that search',
    body: 'Nothing in your diary matches what you typed. Clearing the search brings everything back.',
  },
};
