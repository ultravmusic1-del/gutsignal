/**
 * Onboarding vocabularies (spec §24–§28).
 *
 * These live in `domain` because they are shared contracts, not screen copy: the same keys
 * are stored in Postgres check constraints, read by the pattern engine, and shown in the UI.
 * A test asserts the keys here match the database constraints exactly — a drift between them
 * would fail at insert time, on a user's device, mid-onboarding.
 *
 * Labels are written in the user's language, never clinical shorthand, and the symptom list is
 * explicitly a set of TRACKING CATEGORIES the user chose. It is not a symptom checklist that
 * implies a diagnosis (spec §25).
 */

export type Option<T extends string> = {
  key: T;
  label: string;
  /** Optional supporting line. Used by single-select cards. */
  description?: string;
};

// --- Goals (spec §24) --------------------------------------------------------
export const GOAL_KEYS = [
  'triggers',
  'unpredictability',
  'habits',
  'diet_changes',
  'bowel_patterns',
  'appointments',
  'long_term_trends',
] as const;

export type GoalKey = (typeof GOAL_KEYS)[number];

export const GOALS: Option<GoalKey>[] = [
  { key: 'triggers', label: 'My possible triggers' },
  { key: 'unpredictability', label: 'Why symptoms feel unpredictable' },
  { key: 'habits', label: 'Which habits seem to affect me' },
  { key: 'diet_changes', label: 'Whether dietary changes are helping' },
  { key: 'bowel_patterns', label: 'My bowel patterns' },
  { key: 'appointments', label: 'What to show at appointments' },
  { key: 'long_term_trends', label: 'Longer-term symptom trends' },
];

// --- Symptoms (spec §25) -----------------------------------------------------
export const SYMPTOM_KEYS = [
  'bloating',
  'abdominal_pain',
  'cramping',
  'loose_stool',
  'constipation',
  'urgency',
  'gas',
  'incomplete_evacuation',
  'nausea',
  'heartburn',
  'other',
] as const;

export type SymptomKey = (typeof SYMPTOM_KEYS)[number];

export const SYMPTOMS: Option<SymptomKey>[] = [
  { key: 'bloating', label: 'Bloating' },
  { key: 'abdominal_pain', label: 'Abdominal pain' },
  { key: 'cramping', label: 'Cramping' },
  { key: 'loose_stool', label: 'Loose stool or diarrhoea' },
  { key: 'constipation', label: 'Constipation' },
  { key: 'urgency', label: 'Urgency' },
  { key: 'gas', label: 'Gas' },
  { key: 'incomplete_evacuation', label: 'Incomplete evacuation' },
  { key: 'nausea', label: 'Nausea' },
  { key: 'heartburn', label: 'Heartburn' },
  { key: 'other', label: 'Something else' },
];

// --- Usual bowel pattern (spec §26) -----------------------------------------
export const BOWEL_PATTERN_KEYS = [
  'mostly_loose',
  'mostly_constipated',
  'mixed',
  'varies',
  'unsure',
] as const;

export type BowelPatternKey = (typeof BOWEL_PATTERN_KEYS)[number];

/**
 * Note the labels: these describe what the user notices, and none of them maps to an IBS
 * subtype. The spec is explicit that this answer must not produce an IBS-C/D/M label (§26).
 */
export const BOWEL_PATTERNS: Option<BowelPatternKey>[] = [
  { key: 'mostly_loose', label: 'Mostly loose stools' },
  { key: 'mostly_constipated', label: 'Mostly constipation' },
  { key: 'mixed', label: 'A mix of both' },
  { key: 'varies', label: 'It varies a lot' },
  { key: 'unsure', label: "I'm not sure" },
];

// --- Suspected factors (spec §27) -------------------------------------------
export const SUSPECTED_FACTOR_KEYS = [
  'coffee',
  'other_caffeine',
  'dairy',
  'alcohol',
  'onion',
  'garlic',
  'large_meals',
  'late_meals',
  'spicy_foods',
  'restaurant_meals',
  'poor_sleep',
  'stress',
  'artificial_sweeteners',
] as const;

export type SuspectedFactorKey = (typeof SUSPECTED_FACTOR_KEYS)[number];

export const SUSPECTED_FACTORS: Option<SuspectedFactorKey>[] = [
  { key: 'coffee', label: 'Coffee' },
  { key: 'other_caffeine', label: 'Other caffeine' },
  { key: 'dairy', label: 'Dairy' },
  { key: 'alcohol', label: 'Alcohol' },
  { key: 'onion', label: 'Onion' },
  { key: 'garlic', label: 'Garlic' },
  { key: 'large_meals', label: 'Large meals' },
  { key: 'late_meals', label: 'Late meals' },
  { key: 'spicy_foods', label: 'Spicy foods' },
  { key: 'restaurant_meals', label: 'Restaurant meals' },
  { key: 'poor_sleep', label: 'Poor sleep' },
  { key: 'stress', label: 'Stress' },
  { key: 'artificial_sweeteners', label: 'Artificial sweeteners' },
];

/** Prefix for a user-defined factor. The database enforces that these carry a label. */
export const CUSTOM_FACTOR_PREFIX = 'custom:';

/** Turns a user's own words into a stable key without discarding the original label. */
export function customFactorKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `${CUSTOM_FACTOR_PREFIX}${slug}`;
}

export const isCustomFactorKey = (key: string): boolean => key.startsWith(CUSTOM_FACTOR_PREFIX);

// --- Tracking style (spec §28) ----------------------------------------------
export const TRACKING_STYLE_KEYS = ['minimal', 'balanced', 'detailed'] as const;

export type TrackingStyleKey = (typeof TRACKING_STYLE_KEYS)[number];

export const TRACKING_STYLES: Option<TrackingStyleKey>[] = [
  {
    key: 'minimal',
    label: 'Minimal',
    description: 'Around 30 seconds a day.',
  },
  {
    key: 'balanced',
    label: 'Balanced',
    description: 'A few quick check-ins.',
  },
  {
    key: 'detailed',
    label: 'Detailed',
    description: 'I want deeper tracking.',
  },
];
