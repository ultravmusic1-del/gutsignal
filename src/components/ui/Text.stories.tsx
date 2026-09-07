import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { Text } from './Text';

/**
 * The type scale, in one place.
 *
 * This is the story most worth having: §35 puts every size, weight and colour in
 * `src/theme/typography.ts`, and the only way to notice that two variants have drifted into
 * near-identical sizes — or that a colour token is unreadable on the surface it is used on — is to
 * see the whole ramp at once.
 */
const meta = {
  title: 'Design system/Typography',
  component: Text,
} satisfies Meta<typeof Text>;

export default meta;

type Story = StoryObj<typeof meta>;

const VARIANTS = [
  'display',
  'title',
  'cardTitle',
  'body',
  'button',
  'caption',
  'overline',
] as const;

export const Scale: Story = {
  render: () => (
    <View style={{ gap: 16 }}>
      {VARIANTS.map((variant) => (
        <View key={variant} style={{ gap: 2 }}>
          <Text variant="caption" color="tertiary">
            {variant}
          </Text>
          <Text variant={variant}>Stop guessing what affects your gut</Text>
        </View>
      ))}
    </View>
  ),
};

/**
 * Every colour token on the default surface.
 *
 * `onInverse*` and `accentOnInverse` are deliberately included here even though they will look
 * wrong: that is the point. If one of them is legible on this background, it is being used for
 * something other than what it is named for.
 */
export const Colours: Story = {
  render: () => (
    <View style={{ gap: 8 }}>
      {(
        [
          'primary',
          'secondary',
          'tertiary',
          'accent',
          'positive',
          'caution',
          'danger',
          'onInverse',
          'onInverseSecondary',
          'accentOnInverse',
        ] as const
      ).map((color) => (
        <Text key={color} variant="body" color={color}>
          {color} — symptoms were recorded on 3 of 5 days
        </Text>
      ))}
    </View>
  ),
};

/**
 * Long body copy at the width it actually gets.
 *
 * GutSignal's copy is deliberately careful and therefore long — "GutSignal cannot determine
 * whether you have lactose intolerance" is a whole sentence the product is required to say. Line
 * length and wrapping matter more here than in an app that can be terse.
 */
export const LongContent: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <Text variant="title">Nothing stands out yet</Text>
      <Text variant="body" color="secondary">
        GutSignal compared 14 combinations in this period and found no consistent relationship. That
        is a real result, not a gap — sometimes there genuinely is not a pattern to find.
      </Text>
      <Text variant="caption" color="tertiary">
        GutSignal describes what you recorded. It does not diagnose, and it does not establish that
        one thing caused another.
      </Text>
    </View>
  ),
};
