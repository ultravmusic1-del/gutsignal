/**
 * GutSignal colour tokens.
 *
 * Rules (see docs/PROJECT_PLAN.md §9 and CLAUDE.md §35):
 *  - Components consume SEMANTIC tokens only. Raw hex never appears in a component.
 *  - The accent is split into three role tokens because a single lavender cannot serve as
 *    both a fill and readable text. The reference lavender (#A78BFA) measures 2.72:1 on
 *    white — fine as a fill on charcoal, unusable as text on a light surface.
 *  - Every foreground/background pair used for meaningful text is asserted to meet WCAG AA
 *    in src/theme/__tests__/contrast.test.ts. Add a token, add the assertion.
 *  - Status is never the ONLY carrier of meaning (CLAUDE.md §36) — pair it with a label.
 */

export type ColorScheme = {
  surface: {
    /** App background. Warm off-white in light, deep charcoal in dark. */
    primary: string;
    /** Cards and raised containers. */
    card: string;
    /** Pressed/hover wash over a surface. */
    sunken: string;
    /** Deliberately inverted surface (welcome hero, floating nav) in BOTH schemes. */
    inverse: string;
  };
  text: {
    primary: string;
    secondary: string;
    /** Decorative or large text only — below AA for body copy. Never carries meaning alone. */
    tertiary: string;
    /** Text on `surface.inverse`. */
    onInverse: string;
    onInverseSecondary: string;
    /** Text on `accent.solid`. */
    onAccent: string;
  };
  accent: {
    /** Button/indicator fill. Pair with `text.onAccent`. */
    solid: string;
    /** Accent-coloured TEXT on a light surface. */
    text: string;
    /** Accent text/icon on `surface.inverse`. */
    onInverse: string;
    /** Low-emphasis tinted background (selected chips, subtle highlights). */
    subtle: string;
  };
  border: {
    subtle: string;
    strong: string;
    onInverse: string;
  };
  status: {
    positive: string;
    caution: string;
    danger: string;
    info: string;
    /** Tinted backgrounds for status chips. */
    positiveSubtle: string;
    cautionSubtle: string;
    dangerSubtle: string;
  };
};

const light: ColorScheme = {
  surface: {
    primary: '#F5F4F7',
    card: '#FFFFFF',
    sunken: '#EBEAEF',
    inverse: '#17171C',
  },
  text: {
    primary: '#101014',
    secondary: '#5F5F6A',
    tertiary: '#84848D',
    onInverse: '#F7F7F9',
    onInverseSecondary: '#A0A0AD',
    onAccent: '#FFFFFF',
  },
  accent: {
    solid: '#6D4AFF',
    text: '#5B41D6',
    onInverse: '#A78BFA',
    subtle: '#EEEAFF',
  },
  border: {
    subtle: '#E3E2E8',
    strong: '#C9C8D1',
    onInverse: '#2E2E36',
  },
  status: {
    positive: '#1F7A54',
    caution: '#8A5A00',
    danger: '#B3261E',
    info: '#5B41D6',
    positiveSubtle: '#E3F3EC',
    cautionSubtle: '#FBF0DC',
    dangerSubtle: '#FCE9E7',
  },
};

const dark: ColorScheme = {
  surface: {
    primary: '#121216',
    card: '#1C1C22',
    sunken: '#0D0D10',
    inverse: '#26262E',
  },
  text: {
    primary: '#F7F7F9',
    secondary: '#A8A8B4',
    tertiary: '#75757F',
    onInverse: '#F7F7F9',
    onInverseSecondary: '#A8A8B4',
    onAccent: '#FFFFFF',
  },
  accent: {
    solid: '#6D4AFF',
    text: '#A78BFA',
    onInverse: '#A78BFA',
    subtle: '#221E38',
  },
  border: {
    subtle: '#2A2A32',
    strong: '#3C3C46',
    onInverse: '#3C3C46',
  },
  status: {
    positive: '#5FD3A0',
    caution: '#E9B45C',
    danger: '#F08A82',
    info: '#A78BFA',
    positiveSubtle: '#16291F',
    cautionSubtle: '#2A2213',
    dangerSubtle: '#2E1917',
  },
};

export const colors = { light, dark } as const;
