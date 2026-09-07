import { Platform, type TextStyle } from 'react-native';

/**
 * Typography tokens.
 *
 * GutSignal uses the platform font (San Francisco on iOS) rather than a bundled webfont:
 * it is what makes an iOS app feel native, it supports Dynamic Type properly, and it costs
 * no bundle size. The reference's look comes from SIZE and WEIGHT contrast, not from a
 * distinctive typeface.
 *
 * Dynamic Type: all styles scale by default (`allowFontScaling` stays on). Only the largest
 * display/metric styles cap their multiplier, and they cap it high enough to stay usable.
 */

const family = Platform.select({
  ios: { regular: undefined, rounded: 'SF Pro Rounded' },
  default: { regular: undefined, rounded: undefined },
});

export type TypeStyle = Pick<
  TextStyle,
  'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing' | 'fontFamily'
> & {
  /** Cap for Dynamic Type scaling. Undefined = uncapped (preferred). */
  maxFontSizeMultiplier?: number;
};

export const typography = {
  /** Hero headline — welcome screen, review titles. */
  display: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.6,
    maxFontSizeMultiplier: 1.6,
  },
  /** Screen title — "How's your gut today?" */
  title: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '700',
    letterSpacing: -0.4,
    maxFontSizeMultiplier: 1.8,
  },
  /** Section heading — "What stands out" */
  section: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  /** Card title. */
  cardTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  bodyStrong: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  /** Small all-caps label above a card group. */
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  /** Large single number — GutSignal Score, percentages. */
  metric: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '700',
    letterSpacing: -1,
    fontFamily: family?.rounded,
    maxFontSizeMultiplier: 1.5,
  },
  /**
   * A number that is the point of the thing it sits in.
   *
   * Lighter and larger than `metric`, because at this size weight reads as shouting and the size
   * is already doing the emphasis. Tracking is pulled in hard: large type set at default tracking
   * looks loose, and that looseness is most of what separates a considered number from a
   * plain one.
   *
   * Tabular figures are applied by the `Metric` component rather than declared here, because a
   * `fontVariant` in a token would apply to any text that borrowed the style.
   */
  metricDisplay: {
    fontSize: 56,
    lineHeight: 58,
    fontWeight: '300',
    letterSpacing: -2,
    maxFontSizeMultiplier: 1.3,
  },
  /**
   * The unit or suffix beside a number — `%`, `min`, `of 10`.
   *
   * Deliberately far smaller than the value and set at the value's own weight, so "78.3%" reads as
   * one measurement rather than as a number followed by a word.
   */
  metricUnit: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0,
    maxFontSizeMultiplier: 1.3,
  },
  button: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
} as const satisfies Record<string, TypeStyle>;

export type TypographyToken = keyof typeof typography;
export type Typography = typeof typography;
