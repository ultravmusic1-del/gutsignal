/**
 * Meal log domain model (spec §36, §41, docs/PROJECT_PLAN.md §4.3).
 *
 * A meal is an **aggregate**: the occasion, the things eaten, and the tags describing it. The
 * items are a normalised list rather than a blob because the pattern engine's whole job is to
 * ask "what happened after coffee?" — a question that becomes a join, not a text search, once
 * `factor_catalog` lands at M8 (spec §78).
 *
 * `rawName` is what the user actually wrote and is never overwritten. Normalisation adds a
 * canonical factor alongside it; it does not replace the user's words (spec §54).
 */

import { z } from 'zod';

export const MEAL_SIZES = ['small', 'medium', 'large'] as const;
export type MealSize = (typeof MEAL_SIZES)[number];

export const MEAL_SIZE_LABELS: Record<MealSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

/**
 * Tags the user asserts about a meal (spec §41).
 *
 * Two of the spec's suggestions are deliberately absent. `large meal` is already `mealSize`,
 * and duplicating it invites a meal that is tagged large but recorded small. `late meal` is
 * derivable from `occurredAt` and the user's own day boundaries, so asking them to assert it
 * would create a second, contradictable source of truth for something the engine can compute
 * exactly. Both can be derived at M8 without ever asking.
 */
export const MEAL_TAGS = [
  'caffeinated',
  'alcoholic',
  'spicy',
  'rich_high_fat',
  'restaurant',
  'homemade',
] as const;

export type MealTag = (typeof MEAL_TAGS)[number];

export const MEAL_TAG_LABELS: Record<MealTag, string> = {
  caffeinated: 'Caffeinated',
  alcoholic: 'Alcohol',
  spicy: 'Spicy',
  rich_high_fat: 'Rich or fatty',
  restaurant: 'Eaten out',
  homemade: 'Homemade',
};

export const TITLE_MAX_LENGTH = 120;
export const ITEM_NAME_MAX_LENGTH = 80;
export const NOTE_MAX_LENGTH = 1000;

/** Enough for a large shared meal; a guard against a paste of an entire recipe. */
export const MAX_ITEMS = 30;

/** A single thing eaten, as the user wrote it. */
export const mealItemDraftSchema = z
  .string()
  .trim()
  .min(1, 'Give the item a name')
  .max(ITEM_NAME_MAX_LENGTH);

export const mealDraftSchema = z.object({
  title: z.string().trim().min(1, 'Give the meal a name').max(TITLE_MAX_LENGTH),
  items: z.array(mealItemDraftSchema).max(MAX_ITEMS),
  mealSize: z.enum(MEAL_SIZES),
  tags: z.array(z.enum(MEAL_TAGS)),
  occurredAt: z
    .date()
    .refine((value) => value.getTime() <= Date.now(), { message: 'Pick a time that has passed.' }),
  note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
});

export type MealDraft = z.infer<typeof mealDraftSchema>;

/** A persisted item, in the shape both SQLite and Postgres hold it. */
export type MealItem = {
  id: string;
  mealId: string;
  userId: string;
  /** The user's own words. Never rewritten. */
  rawName: string;
  /** Set by normalisation at M8. Null until then. */
  canonicalFactorId: string | null;
  /** Extraction confidence. Null for anything the user typed themselves. */
  confidence: number | null;
  /** True once a human has agreed this item is really in the meal (CLAUDE.md §23). */
  userConfirmed: boolean;
  /** Preserves the order the user listed things in. */
  position: number;
};

export type MealLog = {
  id: string;
  userId: string;
  title: string;
  mealSize: MealSize;
  note: string | null;
  source: import('./source').LogSource;
  photoAssetId: string | null;
  occurredAt: string;
  occurredLocalDate: string;
  occurredTz: string;
  occurredUtcOffsetMinutes: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A meal with everything that belongs to it — the unit that is written and synced. */
export type Meal = MealLog & {
  items: MealItem[];
  tags: MealTag[];
};

export function mealSizeLabel(size: MealSize): string {
  return MEAL_SIZE_LABELS[size];
}

export function mealTagLabel(tag: MealTag): string {
  return MEAL_TAG_LABELS[tag];
}

/**
 * A one-line summary of what was eaten, for the timeline and Today.
 *
 * Falls back to the title when there are no items, which is a legitimate state: "dinner at
 * Mum's" with nothing itemised is still a meal worth recording, and refusing to accept it
 * would push the user towards not logging at all.
 */
export function mealSummary(meal: Pick<Meal, 'title' | 'items'>): string {
  if (meal.items.length === 0) return meal.title;
  return meal.items.map((item) => item.rawName).join(' · ');
}

/**
 * Splits typed input into items.
 *
 * Commas and newlines both separate, because people type both. Blank fragments are dropped and
 * case-insensitive duplicates collapse, so "rice, Rice" does not become two exposures of the
 * same thing — which would quietly double its weight in every later comparison.
 */
export function parseItemList(input: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const fragment of input.split(/[,\n]/)) {
    const name = fragment.trim();
    if (name === '') continue;

    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    items.push(name.slice(0, ITEM_NAME_MAX_LENGTH));
  }

  return items.slice(0, MAX_ITEMS);
}
