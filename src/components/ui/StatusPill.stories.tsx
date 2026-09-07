import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { StatusPill } from './StatusPill';

/**
 * A small state marker.
 *
 * The label is required and the dot is not configurable, because §36 forbids colour carrying a
 * state on its own — a pill that could be built without its word would be a pill that eventually
 * is.
 */
const meta = {
  title: 'UI/StatusPill',
  component: StatusPill,
  args: { label: 'Not sent yet' },
} satisfies Meta<typeof StatusPill>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};

export const Positive: Story = { args: { label: 'Sent', tone: 'positive' } };

export const Caution: Story = { args: { label: 'Waiting for a connection', tone: 'caution' } };

export const Danger: Story = { args: { label: 'Sign in again', tone: 'danger' } };

export const Accent: Story = { args: { label: 'Stronger signal', tone: 'accent' } };

/**
 * Every tone together.
 *
 * The check here is that they read as one family and that none of them shouts — a saturated pill
 * is louder than almost anything it will sit beside, and in a health diary that is weight the
 * state has not earned.
 */
export const AllTones: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <StatusPill label="Sent" tone="positive" />
      <StatusPill label="Not sent yet" />
      <StatusPill label="Waiting for a connection" tone="caution" />
      <StatusPill label="Sign in again" tone="danger" />
      <StatusPill label="Stronger signal" tone="accent" />
    </View>
  ),
};
