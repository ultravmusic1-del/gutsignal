import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

export type SelectCardProps = {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** `radio` for one-of-many, `checkbox` for many-of-many. Drives what VoiceOver announces. */
  mode?: 'radio' | 'checkbox';
};

/**
 * A large tappable option card.
 *
 * Selection is carried three ways — the accessibility state, a tick, and the fill — because
 * confidence and state must never rest on colour alone (CLAUDE.md §36).
 */
export function SelectCard({
  label,
  description,
  selected,
  onPress,
  mode = 'checkbox',
}: SelectCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole={mode}
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: selected, selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 60,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: selected ? theme.colors.accent.subtle : theme.colors.surface.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.accent.solid : theme.colors.border.subtle,
        opacity: pressed ? 0.85 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="cardTitle">{label}</Text>
        {description ? (
          <Text variant="caption" color="secondary">
            {description}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          width: 24,
          height: 24,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Icon name="check" size={20} color={theme.colors.accent.text} /> : null}
      </View>
    </Pressable>
  );
}
