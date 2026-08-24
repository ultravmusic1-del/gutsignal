import { View, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type CardProps = ViewProps & {
  /** `flat` drops the shadow — use inside scrollable lists where many shadows get noisy. */
  elevation?: 'flat' | 'card' | 'raised';
  /** Inverted charcoal card, per the reference's dark detail panels. */
  inverse?: boolean;
  padding?: keyof ReturnType<typeof usePaddingKeys>;
  style?: ViewStyle;
};

// Small helper so `padding` stays keyed to the spacing scale rather than raw numbers.
const usePaddingKeys = () => ({ none: 0, sm: 12, md: 16, lg: 20, xl: 24 });

export function Card({
  elevation = 'card',
  inverse = false,
  padding = 'lg',
  style,
  ...rest
}: CardProps) {
  const theme = useTheme();
  const paddings = usePaddingKeys();

  return (
    <View
      style={[
        {
          backgroundColor: inverse ? theme.colors.surface.inverse : theme.colors.surface.card,
          borderRadius: theme.radius.lg,
          padding: paddings[padding],
        },
        elevation === 'flat' ? theme.shadows.none : theme.shadows[elevation],
        // Dark surfaces get a hairline border instead of a shadow, which is invisible on them.
        theme.scheme === 'dark' || inverse
          ? {
              borderWidth: 1,
              borderColor: inverse ? theme.colors.border.onInverse : theme.colors.border.subtle,
            }
          : null,
        style,
      ]}
      {...rest}
    />
  );
}
