import { colors } from '../colors';
import { contrastRatio, WCAG_AA_LARGE, WCAG_AA_NON_TEXT, WCAG_AA_NORMAL } from '../../utils/color';

/**
 * Accessibility is a release requirement (CLAUDE.md §36), so the palette is tested rather
 * than trusted. If someone adjusts a colour token and drops a real text pair below WCAG AA,
 * this fails in CI instead of in review.
 *
 * Every pair the app actually renders should be listed here. `text.tertiary` is deliberately
 * asserted only at the LARGE threshold — it exists for decorative/large text and is never
 * allowed to carry meaning on its own.
 */

type Pair = { name: string; fg: string; bg: string; min: number };

const schemes = ['light', 'dark'] as const;

const pairsFor = (scheme: (typeof schemes)[number]): Pair[] => {
  const c = colors[scheme];

  return [
    // Body text on the app background and on cards.
    {
      name: 'text.primary on surface.primary',
      fg: c.text.primary,
      bg: c.surface.primary,
      min: WCAG_AA_NORMAL,
    },
    {
      name: 'text.primary on surface.card',
      fg: c.text.primary,
      bg: c.surface.card,
      min: WCAG_AA_NORMAL,
    },
    {
      name: 'text.secondary on surface.primary',
      fg: c.text.secondary,
      bg: c.surface.primary,
      min: WCAG_AA_NORMAL,
    },
    {
      name: 'text.secondary on surface.card',
      fg: c.text.secondary,
      bg: c.surface.card,
      min: WCAG_AA_NORMAL,
    },

    // Inverted surfaces (welcome hero, floating navigation) exist in both schemes.
    {
      name: 'text.onInverse on surface.inverse',
      fg: c.text.onInverse,
      bg: c.surface.inverse,
      min: WCAG_AA_NORMAL,
    },
    {
      name: 'text.onInverseSecondary on surface.inverse',
      fg: c.text.onInverseSecondary,
      bg: c.surface.inverse,
      min: WCAG_AA_NORMAL,
    },

    // Accent roles — the reason the accent is three tokens and not one.
    {
      name: 'text.onAccent on accent.solid',
      fg: c.text.onAccent,
      bg: c.accent.solid,
      min: WCAG_AA_NORMAL,
    },
    {
      name: 'accent.text on surface.primary',
      fg: c.accent.text,
      bg: c.surface.primary,
      min: WCAG_AA_NORMAL,
    },
    {
      name: 'accent.text on surface.card',
      fg: c.accent.text,
      bg: c.surface.card,
      min: WCAG_AA_NORMAL,
    },
    {
      name: 'accent.text on accent.subtle',
      fg: c.accent.text,
      bg: c.accent.subtle,
      min: WCAG_AA_NORMAL,
    },
    {
      name: 'accent.onInverse on surface.inverse',
      fg: c.accent.onInverse,
      bg: c.surface.inverse,
      min: WCAG_AA_NORMAL,
    },

    // Status text on its own tinted chip background.
    {
      name: 'status.positive on positiveSubtle',
      fg: c.status.positive,
      bg: c.status.positiveSubtle,
      min: WCAG_AA_NORMAL,
    },
    {
      name: 'status.caution on cautionSubtle',
      fg: c.status.caution,
      bg: c.status.cautionSubtle,
      min: WCAG_AA_NORMAL,
    },
    {
      name: 'status.danger on dangerSubtle',
      fg: c.status.danger,
      bg: c.status.dangerSubtle,
      min: WCAG_AA_NORMAL,
    },

    // Status text directly on a card (used in inline messages).
    {
      name: 'status.danger on surface.card',
      fg: c.status.danger,
      bg: c.surface.card,
      min: WCAG_AA_NORMAL,
    },
    {
      name: 'status.positive on surface.card',
      fg: c.status.positive,
      bg: c.surface.card,
      min: WCAG_AA_NORMAL,
    },

    // Large/decorative only.
    {
      name: 'text.tertiary on surface.primary (large only)',
      fg: c.text.tertiary,
      bg: c.surface.primary,
      min: WCAG_AA_LARGE,
    },

    // Non-text UI.
    {
      name: 'accent.solid as a control mark on surface.card',
      fg: c.accent.solid,
      bg: c.surface.card,
      min: WCAG_AA_NON_TEXT,
    },
    { name: 'border.strong on surface.card', fg: c.border.strong, bg: c.surface.card, min: 1.3 },
  ];
};

describe.each(schemes)('%s scheme contrast', (scheme) => {
  const pairs = pairsFor(scheme);

  it.each(pairs)('$name meets its minimum', ({ fg, bg, min }) => {
    const ratio = contrastRatio(fg, bg);
    // The message carries the measured value so a failure is immediately actionable.
    expect({ ratio: Number(ratio.toFixed(2)), min }).toEqual({
      ratio: expect.any(Number),
      min,
    });
    expect(ratio).toBeGreaterThanOrEqual(min);
  });
});

describe('accent role separation', () => {
  it('documents why the reference lavender cannot be used as text on white', () => {
    // #A78BFA is the reference image's lavender. Kept as an executable note so nobody
    // "simplifies" the three accent tokens back into one.
    expect(contrastRatio('#A78BFA', '#FFFFFF')).toBeLessThan(WCAG_AA_NORMAL);
    expect(contrastRatio('#A78BFA', colors.light.surface.inverse)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL
    );
  });
});
