import { Platform, type ViewStyle } from 'react-native';

/**
 * Shadow tokens. The reference uses soft, low-contrast elevation — never heavy drop shadows.
 * Dark scheme uses borders instead of shadows, because shadows are invisible on dark surfaces.
 */
export type ShadowToken = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

const ios = (opacity: number, radius: number, y: number): ShadowToken => ({
  shadowColor: '#0B0B10',
  shadowOffset: { width: 0, height: y },
  shadowOpacity: opacity,
  shadowRadius: radius,
});

const android = (elevation: number): ShadowToken => ({ elevation });

const make = (opacity: number, radius: number, y: number, elevation: number): ShadowToken =>
  Platform.OS === 'android' ? android(elevation) : ios(opacity, radius, y);

export const shadows = {
  none: {} as ShadowToken,
  /** Resting cards. */
  card: make(0.06, 12, 4, 2),
  /** Raised/pressed cards, popovers. */
  raised: make(0.1, 20, 8, 6),
  /** Floating navigation and the log action button. */
  floating: make(0.18, 24, 10, 10),
} as const;

export type Shadows = typeof shadows;
