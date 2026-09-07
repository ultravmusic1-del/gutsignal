import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { Button } from './Button';
import { Card } from './Card';
import { SectionHeader } from './SectionHeader';
import { Text } from './Text';

/**
 * The heading above a group of cards.
 *
 * The story to look at is `AsAPage`: a heading is judged by how well it separates one group from
 * the next, which cannot be assessed one heading at a time.
 */
const meta = {
  title: 'UI/SectionHeader',
  component: SectionHeader,
  args: { title: 'What stands out' },
} satisfies Meta<typeof SectionHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithOverline: Story = { args: { overline: 'Insights', title: 'What stands out' } };

export const WithDescription: Story = {
  args: {
    overline: 'Insights',
    title: 'Worth investigating',
    description:
      'Early differences, based on fewer observations. Worth watching rather than acting on.',
  },
};

export const WithAction: Story = {
  args: {
    overline: 'Your week',
    title: '31 Aug to 6 Sep',
    action: <Button label="Export" variant="ghost" size="medium" onPress={() => {}} />,
  },
};

/** No rule — the first heading on a screen, where a line above the fold reads as a stray mark. */
export const WithoutRule: Story = { args: { title: 'Insights', rule: false } };

export const LongContent: Story = {
  args: {
    overline: 'Everything GutSignal examined',
    title: 'Things you logged that came to nothing',
    description:
      'Fourteen factors across twenty-two comparisons. A factor here is one the engine looked at and found no consistent relationship for, which is a result rather than a gap.',
  },
};

/** Two sections in a row, which is the only way to judge whether they separate anything. */
export const AsAPage: Story = {
  args: { title: 'What stands out' },
  render: () => (
    <View style={{ gap: 28 }}>
      <View style={{ gap: 12 }}>
        <SectionHeader overline="Insights" title="What stands out" />
        <Card>
          <Text variant="body">A finding would sit here.</Text>
        </Card>
      </View>

      <View style={{ gap: 12 }}>
        <SectionHeader
          overline="Insights"
          title="Worth investigating"
          description="Early differences, based on fewer observations."
        />
        <Card>
          <Text variant="body">An emerging signal would sit here.</Text>
        </Card>
      </View>
    </View>
  ),
};
