/**
 * Motion tokens. GutSignal uses restrained motion (CLAUDE.md §34, spec §117):
 * card appearance, number transitions, sheet transitions, save confirmation, chart changes.
 * No decorative loops, no confetti, no motion-heavy data.
 *
 * Every animation must degrade when Reduce Motion is enabled — see useReducedMotion().
 */
export const motion = {
  duration: {
    /** Press feedback, toggles. */
    instant: 120,
    /** Standard element transition. */
    quick: 200,
    /** Sheets, screen-level changes. */
    standard: 300,
    /** Number counters, chart redraws. */
    deliberate: 450,
  },
  easing: {
    /** Entering elements. */
    decelerate: [0.05, 0.7, 0.1, 1] as const,
    /** Exiting elements. */
    accelerate: [0.3, 0, 0.8, 0.15] as const,
    /** Two-way movement. */
    standard: [0.2, 0, 0, 1] as const,
  },
  spring: {
    /** Sheets and cards. */
    gentle: { damping: 20, stiffness: 180, mass: 1 },
    /** Small controls. */
    snappy: { damping: 22, stiffness: 320, mass: 0.8 },
  },
} as const;

export type Motion = typeof motion;
