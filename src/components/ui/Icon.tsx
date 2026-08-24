import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/theme';

export type IconName =
  'today' | 'timeline' | 'insights' | 'you' | 'plus' | 'check' | 'chevronRight';

export type IconProps = {
  name: IconName;
  size?: number;
  /** Any resolved colour. Callers pass a theme token value, never a literal. */
  color: string;
  strokeWidth?: number;
};

/**
 * GutSignal's own icon set, drawn with react-native-svg.
 *
 * Deliberately not SF Symbols: the tab bar and log action need identical geometry on Android
 * later (spec §115), and an original minimal-stroke set matches the reference's restraint
 * better than platform glyphs. SF Symbols may still be used for OS-affiliated affordances
 * (share, settings) where matching the platform is the point.
 *
 * Icons are decorative by default — the surrounding control carries the accessible label.
 */
export function Icon({ name, size = 24, color, strokeWidth = 1.75 }: IconProps) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {name === 'today' ? (
        <>
          <Circle cx={12} cy={12} r={4} {...common} />
          <Path
            d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
            {...common}
          />
        </>
      ) : null}

      {name === 'timeline' ? (
        <>
          <Circle cx={5} cy={7} r={1.6} {...common} />
          <Circle cx={5} cy={12} r={1.6} {...common} />
          <Circle cx={5} cy={17} r={1.6} {...common} />
          <Path d="M10 7h10M10 12h10M10 17h6" {...common} />
        </>
      ) : null}

      {name === 'insights' ? (
        <Path d="M4 20h16M7.5 20v-5M12 20V7.5M16.5 20v-8" {...common} />
      ) : null}

      {name === 'you' ? (
        <>
          <Circle cx={12} cy={8.5} r={3.5} {...common} />
          <Path d="M5.5 19.8c0-3.5 2.9-5.3 6.5-5.3s6.5 1.8 6.5 5.3" {...common} />
        </>
      ) : null}

      {name === 'plus' ? <Path d="M12 5.5v13M5.5 12h13" {...common} strokeWidth={2.1} /> : null}

      {name === 'check' ? <Path d="M4.5 12.5l5 5 10-11" {...common} /> : null}

      {name === 'chevronRight' ? <Path d="M9 5l7 7-7 7" {...common} /> : null}
    </Svg>
  );
}

/** Convenience for icons that should follow the current text colour. */
export function useIconColor(): string {
  return useTheme().colors.text.primary;
}
