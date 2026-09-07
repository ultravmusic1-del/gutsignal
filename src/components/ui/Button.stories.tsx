import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { Button } from './Button';

/**
 * Every variant is a real one from the app: `primary` is the log action, `secondary` is
 * "Privacy & data" and "Reminders", `ghost` is a text action, and the two `*OnInverse` variants
 * exist because the welcome flow and the floating nav sit on a charcoal surface where the normal
 * accent measures 2.70:1 and fails AA.
 */
const meta = {
  title: 'UI/Button',
  component: Button,
  args: { label: 'Log a meal', onPress: () => {} },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'ghostOnInverse', 'onInverse'],
    },
    size: { control: 'radio', options: ['large', 'medium'] },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = { args: { variant: 'secondary', label: 'Privacy & data' } };

export const Ghost: Story = { args: { variant: 'ghost', label: 'I already have an account' } };

/** Loading also stops accepting presses and announces `busy` — not merely a spinner. */
export const Loading: Story = { args: { loading: true, label: 'Saving your entry' } };

export const Disabled: Story = { args: { disabled: true } };

export const Medium: Story = { args: { size: 'medium', label: 'Open' } };

/**
 * A label that cannot fit.
 *
 * The button is `numberOfLines={1}`, so this is the state that shows whether it truncates
 * gracefully or pushes the pill out of the layout.
 */
export const LongContent: Story = {
  args: { label: 'Delete every entry stored on this device and start again' },
};

/** The whole set at once, which is how inconsistency between variants becomes visible. */
export const AllVariants: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <Button label="Primary" onPress={() => {}} />
      <Button label="Secondary" variant="secondary" onPress={() => {}} />
      <Button label="Ghost" variant="ghost" onPress={() => {}} />
      <Button label="Loading" loading onPress={() => {}} />
      <Button label="Disabled" disabled onPress={() => {}} />
    </View>
  ),
};
