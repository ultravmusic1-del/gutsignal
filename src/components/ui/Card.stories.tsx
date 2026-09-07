import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { Card } from './Card';
import { Text } from './Text';

/**
 * The surface almost everything in GutSignal sits on.
 *
 * The three elevations are not decorative: `card` is the default, `flat` is for lists where a
 * dozen shadows turn into noise, and `raised` is for the one thing on a screen that should lift.
 * Seeing them together is the only reliable way to notice when a screen has picked the wrong one.
 */
const meta = {
  title: 'UI/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

const Body = () => (
  <>
    <Text variant="cardTitle">Days with an entry</Text>
    <Text variant="body" color="secondary">
      5 of the last 7
    </Text>
  </>
);

export const Default: Story = {
  render: () => (
    <Card>
      <Body />
    </Card>
  ),
};

export const Flat: Story = {
  render: () => (
    <Card elevation="flat">
      <Body />
    </Card>
  ),
};

export const Raised: Story = {
  render: () => (
    <Card elevation="raised">
      <Body />
    </Card>
  ),
};

/** The charcoal detail panel from the reference design. */
export const Inverse: Story = {
  render: () => (
    <Card inverse>
      <Text variant="cardTitle" color="onInverse">
        Your weekly review is ready
      </Text>
      <Text variant="body" color="onInverseSecondary">
        A look back at the last seven days.
      </Text>
    </Card>
  ),
};

/** All three elevations stacked, which is where an inconsistent radius or shadow shows up. */
export const Elevations: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <Card elevation="flat">
        <Text variant="body">flat</Text>
      </Card>
      <Card elevation="card">
        <Text variant="body">card</Text>
      </Card>
      <Card elevation="raised">
        <Text variant="body">raised</Text>
      </Card>
    </View>
  ),
};
