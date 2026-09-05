/**
 * The onboarding flow's steps, in order.
 *
 * Domain rather than presentation, because two unrelated places need the same list and neither
 * should own it: the progress indicator counts these, and the analytics allowlist derives the
 * vocabulary of `onboarding_step_completed` from them. Restating the list in the analytics module
 * would let the funnel drift from the flow it claims to measure — and would put the words
 * "suspected factors" inside a file whose whole purpose is that it contains nothing of the kind.
 *
 * These are **screen names**, not user data. That a person reached the suspected-factors screen is
 * funnel state; which factors they chose is health content and never leaves the device for a
 * vendor (`CLAUDE.md` §29).
 */

/** Steps that show progress. Account and completion sit outside the counter. */
export const ONBOARDING_STEPS = [
  'goals',
  'symptoms',
  'bowel-pattern',
  'suspected-factors',
  'tracking-style',
  'philosophy',
] as const;

export type OnboardingStepName = (typeof ONBOARDING_STEPS)[number];
