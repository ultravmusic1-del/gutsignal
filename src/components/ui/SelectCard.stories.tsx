import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { View } from 'react-native';

import { SelectCard } from './SelectCard';

/**
 * The large option cards onboarding is built from.
 *
 * Selection is carried three ways — accessibility state, a tick, and the fill — because confidence
 * and state must never rest on colour alone (§36). The story worth looking at is `TrackingStyle`,
 * where the descriptions are different lengths and the cards have to stay aligned anyway.
 */
const meta = {
  title: 'UI/SelectCard',
  component: SelectCard,
  args: { label: 'Balanced', selected: false, onPress: () => {} },
} satisfies Meta<typeof SelectCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

export const WithDescription: Story = {
  args: {
    label: 'Detailed',
    description: 'I want deeper tracking.',
    selected: true,
  },
};

export const Checkbox: Story = {
  args: { label: 'Understand my symptoms', mode: 'checkbox', selected: true },
};

/** The real tracking-style question, with descriptions of uneven length. */
export const TrackingStyle: Story = {
  render: function TrackingStyleStory() {
    const [chosen, setChosen] = useState('balanced');
    const options = [
      { key: 'minimal', label: 'Minimal', description: 'Just the essentials, quickly.' },
      {
        key: 'balanced',
        label: 'Balanced',
        description: 'A bit of detail where it helps, without the app becoming a chore.',
      },
      { key: 'detailed', label: 'Detailed', description: 'I want deeper tracking.' },
    ];

    return (
      <View style={{ gap: 12 }}>
        {options.map((option) => (
          <SelectCard
            key={option.key}
            label={option.label}
            description={option.description}
            selected={chosen === option.key}
            onPress={() => setChosen(option.key)}
          />
        ))}
      </View>
    );
  },
};
