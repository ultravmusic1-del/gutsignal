/**
 * Pattern status vocabulary (spec §50).
 *
 * This lives in `domain` rather than in a screen because it is a product-safety boundary, not
 * presentation: every surface that describes a finding — Insights, Gut Map, pattern detail,
 * Ask My Gut, reports, PDF export — must use exactly these five states and exactly this
 * language.
 *
 * There is deliberately no `confirmed trigger` status. GutSignal reports how consistently something
 * co-occurred with symptoms in a user's own logs; it never claims causation (spec §4).
 */
export const PATTERN_STATUSES = [
  'insufficient_data',
  'emerging',
  'moderate',
  'stronger_recurring_signal',
  'no_clear_pattern',
] as const;

export type PatternStatus = (typeof PATTERN_STATUSES)[number];

export type PatternStatusCopy = {
  /** Short user-facing name. */
  label: string;
  /** One sentence a user can act on. Association language only. */
  description: string;
};

export const PATTERN_STATUS_COPY: Record<PatternStatus, PatternStatusCopy> = {
  insufficient_data: {
    label: 'Not enough data',
    description: 'There are too few comparable observations to say anything yet.',
  },
  emerging: {
    label: 'Emerging signal',
    description: 'An early difference worth watching, based on a small number of observations.',
  },
  moderate: {
    label: 'Moderate signal',
    description: 'A repeated association with reasonable coverage across your logs.',
  },
  stronger_recurring_signal: {
    label: 'Stronger recurring signal',
    description:
      'A consistent association across enough repeated observations to be worth taking seriously.',
  },
  no_clear_pattern: {
    label: 'No clear pattern',
    description: 'Enough observations to look, and no consistent relationship so far.',
  },
};
