import { Switch, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type ToggleRowProps = {
  label: string;
  /** Optional second line. Say what the toggle does, not that it is a toggle. */
  description?: string;
  /** Shown under the description in the warning colour. For "this will never fire" cases. */
  warning?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
};

/**
 * A labelled switch.
 *
 * Wraps the platform `Switch` rather than drawing one. A hand-built toggle loses the iOS drag
 * gesture, the reduce-motion behaviour and the VoiceOver announcement, all of which arrive free
 * here and are part of §36 rather than a nicety.
 *
 * The whole row is one accessibility element with the `switch` role, so VoiceOver reads the label
 * and its state together instead of announcing an unlabelled control next to some text.
 */
export function ToggleRow({
  label,
  description,
  warning,
  value,
  onValueChange,
  disabled = false,
}: ToggleRowProps) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: 44,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text variant="body">{label}</Text>
        {description === undefined ? null : (
          <Text variant="caption" color="secondary">
            {description}
          </Text>
        )}
        {warning === undefined ? null : (
          <Text variant="caption" color="caution">
            {warning}
          </Text>
        )}
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: theme.colors.accent.solid }}
      />
    </View>
  );
}
