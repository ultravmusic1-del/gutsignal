import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { Card } from './Card';
import { Metric } from './Metric';

/**
 * The number-forward treatment.
 *
 * The story that matters most is `Grid`: metrics are almost never read alone, and tabular figures
 * plus a shared label position are what make a column of them scan as a set rather than as four
 * separate cards that happen to be nearby.
 */
const meta = {
  title: 'UI/Metric',
  component: Metric,
  args: { label: 'Days with an entry', value: '5', unit: 'of 7' },
} satisfies Meta<typeof Metric>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The basis is the point — a rate without its denominator overstates a diary. */
export const WithBasis: Story = {
  args: {
    label: 'Days you recorded a symptom',
    value: '3',
    unit: 'of 5',
    basis: 'out of the days you said how you felt',
  },
};

export const Percentage: Story = {
  args: {
    label: 'Tracking completeness',
    value: '78.3',
    unit: '%',
    basis: 'over the last 90 days',
  },
};

export const Severity: Story = {
  args: { label: 'Average worst severity', value: '6.4', unit: 'of 10', basis: 'on symptom days' },
};

/** Nothing recorded. Zero is a real answer and must not look like a broken component. */
export const Zero: Story = {
  args: {
    label: 'Days you recorded feeling good',
    value: '0',
    basis: 'nothing recorded this week',
  },
};

export const Positive: Story = {
  args: { label: 'Days you felt fine', value: '4', unit: 'of 7', tone: 'positive' },
};

export const Caution: Story = {
  args: { label: 'Days with nothing recorded', value: '5', unit: 'of 7', tone: 'caution' },
};

/** Muted, for the number that is context rather than headline. */
export const Muted: Story = {
  args: { label: 'Entries', value: '18', tone: 'muted' },
};

/** A number wide enough to test that it shrinks rather than clipping. */
export const LongContent: Story = {
  args: { label: 'Live passenger volume equivalent', value: '142,580', unit: 'entries' },
};

/**
 * How they actually appear: a grid inside a card.
 *
 * Two columns is the most a 393pt screen takes without the numbers colliding, and this is where a
 * mis-set letter-spacing or a non-tabular figure shows up immediately.
 */
export const Grid: Story = {
  render: () => (
    <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 24, columnGap: 16 }}>
        <Metric
          label="Days with an entry"
          value="5"
          unit="of 7"
          style={{ flex: 1, minWidth: 120 }}
        />
        <Metric label="Entries" value="18" tone="muted" style={{ flex: 1, minWidth: 120 }} />
        <Metric
          label="Days you recorded a symptom"
          value="3"
          unit="of 5"
          style={{ flex: 1, minWidth: 120 }}
        />
        <Metric
          label="Average worst severity"
          value="6.4"
          unit="of 10"
          style={{ flex: 1, minWidth: 120 }}
        />
      </View>
    </Card>
  ),
};
