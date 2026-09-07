import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { View } from 'react-native';

import { ToggleRow } from './ToggleRow';

/**
 * The reminder settings row.
 *
 * The `warning` slot is the interesting one: a reminder that falls inside quiet hours will never
 * be delivered, and rather than overruling the user's switch the row says so. An enabled toggle
 * that silently does nothing is the failure spec §75 is written against, so "on, with a warning"
 * is a state worth being able to look at.
 */
const meta = {
  title: 'UI/ToggleRow',
  component: ToggleRow,
  args: { label: 'Morning check-in', value: true, onValueChange: () => {} },
} satisfies Meta<typeof ToggleRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const On: Story = {};

export const Off: Story = { args: { value: false } };

export const WithDescription: Story = {
  args: { description: 'Quick gut check-in?' },
};

/** On, and will never fire. The whole reason this slot exists. */
export const Suppressed: Story = {
  args: {
    description: 'Quick gut check-in?',
    warning: 'This falls inside your quiet hours, so it will not be sent.',
  },
};

export const Disabled: Story = { args: { disabled: true, description: 'Quick gut check-in?' } };

/** The real Reminders screen, so the rows are read against each other. */
export const SettingsGroup: Story = {
  render: function SettingsGroupStory() {
    const [morning, setMorning] = useState(true);
    const [evening, setEvening] = useState(true);
    const [weekly, setWeekly] = useState(false);

    return (
      <View style={{ gap: 12 }}>
        <ToggleRow
          label="Morning check-in"
          description="Quick gut check-in?"
          warning="This falls inside your quiet hours, so it will not be sent."
          value={morning}
          onValueChange={setMorning}
        />
        <ToggleRow
          label="Evening check-in"
          description="Anything worth logging today?"
          value={evening}
          onValueChange={setEvening}
        />
        <ToggleRow
          label="Weekly review"
          description="A look back at your week."
          value={weekly}
          onValueChange={setWeekly}
        />
      </View>
    );
  },
};
