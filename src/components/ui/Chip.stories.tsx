import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip } from './Chip';

/**
 * Chips carry the timeline filters and the multi-select answers in onboarding.
 *
 * Selection is announced through `accessibilityState.selected` as well as shown by fill, so the
 * state to check here is not only "does it look selected" but "is the unselected one still
 * clearly a control" (CLAUDE.md §36).
 */
const meta = {
  title: 'UI/Chip',
  component: Chip,
  args: { label: 'Bloating', onPress: () => {} },
} satisfies Meta<typeof Chip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

/** On the charcoal surfaces of the welcome flow and the floating nav. */
export const OnInverse: Story = { args: { onInverse: true, selected: true } };

/** A custom factor in the user's own words, which is where the width stops being predictable. */
export const LongContent: Story = { args: { label: 'Oat milk in the afternoon' } };

/**
 * The real filter row from the Timeline, including a long custom factor.
 *
 * Wrapping is the thing worth looking at: a filter row that pushes off the edge at a large
 * Dynamic Type size is the failure this story exists to make visible.
 */
export const FilterRow: Story = {
  render: function FilterRowStory() {
    const [selected, setSelected] = useState('All');
    const options = ['All', 'Meals', 'Symptoms', 'Bowel', 'Feeling good', 'Stress and context'];

    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => (
          <Chip
            key={option}
            label={option}
            selected={selected === option}
            onPress={() => setSelected(option)}
          />
        ))}
      </View>
    );
  },
};

/** The symptom multi-select from onboarding, at the size a real answer reaches. */
export const SymptomSelection: Story = {
  render: function SymptomSelectionStory() {
    const [chosen, setChosen] = useState<string[]>(['Bloating', 'Cramping']);
    const symptoms = [
      'Bloating',
      'Abdominal pain',
      'Cramping',
      'Loose stool',
      'Constipation',
      'Urgency',
      'Nausea',
      'Reflux',
      'Excess gas',
    ];

    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {symptoms.map((symptom) => (
          <Chip
            key={symptom}
            label={symptom}
            selected={chosen.includes(symptom)}
            onPress={() =>
              setChosen((current) =>
                current.includes(symptom)
                  ? current.filter((item) => item !== symptom)
                  : [...current, symptom]
              )
            }
          />
        ))}
      </View>
    );
  },
};
