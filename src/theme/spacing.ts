/**
 * 4-based spacing scale. Components use these names, never raw numbers.
 * `gutter` is the standard screen horizontal inset.
 */
export const spacing = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 56,
  /** Standard screen horizontal inset. */
  gutter: 20,
  /** Minimum interactive target (Apple HIG). Enforced by the Pressable primitives. */
  minTouchTarget: 44,
} as const;

export type Spacing = typeof spacing;
