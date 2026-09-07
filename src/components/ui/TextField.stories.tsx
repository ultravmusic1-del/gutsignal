import type { Meta, StoryObj } from '@storybook/react';

import { TextField } from './TextField';

/**
 * The one input in the app, used for email, notes and the deletion confirmation.
 *
 * The error state is the one to check: §36 requires the message to be text wired into the
 * accessibility label rather than a red border, so an error story that only looks red is a
 * component that has regressed.
 */
const meta = {
  title: 'UI/TextField',
  component: TextField,
  args: { label: 'Email' },
} satisfies Meta<typeof TextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { placeholder: 'you@example.com' } };

export const WithValue: Story = { args: { value: 'vivaan@example.com' } };

export const WithHint: Story = {
  args: {
    label: 'Note',
    hint: 'Optional. Anything you want to remember about this entry.',
    placeholder: 'Felt fine until the evening',
  },
};

export const Error: Story = {
  args: { value: 'vivaan@', error: 'That does not look like an email address.' },
};

/** The typed confirmation on account deletion, where getting it wrong is expensive. */
export const DeletionConfirmation: Story = {
  args: {
    label: 'Type DELETE to confirm',
    value: 'DELE',
    hint: 'This removes your account and everything in it. It cannot be undone.',
  },
};

export const Disabled: Story = { args: { value: 'vivaan@example.com', editable: false } };

/** A note long enough to wrap, which is how the field is actually used. */
export const LongContent: Story = {
  args: {
    label: 'Note',
    value:
      'Ate later than usual because of the meeting, and had the leftover curry rather than cooking. Felt fine at the time.',
    multiline: true,
  },
};
