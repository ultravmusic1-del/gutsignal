import {
  MAX_ITEMS,
  MEAL_TAGS,
  ITEM_NAME_MAX_LENGTH,
  mealDraftSchema,
  mealSummary,
  parseItemList,
} from '../meal';

const valid = {
  title: 'Chicken shawarma',
  items: ['chicken', 'flatbread', 'garlic sauce'],
  mealSize: 'medium',
  tags: ['restaurant'],
  occurredAt: new Date('2026-08-24T12:00:00Z'),
  note: undefined,
};

describe('mealDraftSchema', () => {
  it('accepts a well-formed draft', () => {
    expect(mealDraftSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a title', () => {
    expect(mealDraftSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false);
  });

  it('accepts a meal with no itemised contents', () => {
    // "Dinner at Mum's" with nothing itemised is still worth recording. Refusing it would
    // push people towards not logging at all.
    expect(mealDraftSchema.safeParse({ ...valid, items: [] }).success).toBe(true);
  });

  it('rejects an unknown meal size', () => {
    expect(mealDraftSchema.safeParse({ ...valid, mealSize: 'enormous' }).success).toBe(false);
  });

  it('rejects a tag outside the vocabulary', () => {
    expect(mealDraftSchema.safeParse({ ...valid, tags: ['delicious'] }).success).toBe(false);
  });

  it('accepts every tag in the vocabulary', () => {
    expect(mealDraftSchema.safeParse({ ...valid, tags: [...MEAL_TAGS] }).success).toBe(true);
  });

  it('rejects a future meal', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(mealDraftSchema.safeParse({ ...valid, occurredAt: tomorrow }).success).toBe(false);
  });

  it('rejects an item list long enough to be a recipe paste', () => {
    const tooMany = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => `item ${i}`);
    expect(mealDraftSchema.safeParse({ ...valid, items: tooMany }).success).toBe(false);
  });

  it('trims item names', () => {
    const parsed = mealDraftSchema.safeParse({ ...valid, items: ['  rice  '] });
    expect(parsed.success && parsed.data.items[0]).toBe('rice');
  });
});

describe('parseItemList', () => {
  it('splits on commas', () => {
    expect(parseItemList('chicken, rice, garlic sauce')).toEqual([
      'chicken',
      'rice',
      'garlic sauce',
    ]);
  });

  it('splits on newlines too, because people type both', () => {
    expect(parseItemList('chicken\nrice\ngarlic sauce')).toEqual([
      'chicken',
      'rice',
      'garlic sauce',
    ]);
  });

  it('handles a mixture and drops blanks', () => {
    expect(parseItemList('chicken,\n , rice,,\n')).toEqual(['chicken', 'rice']);
  });

  it('collapses case-insensitive duplicates', () => {
    // Two rows for the same food would silently double its weight in every later comparison.
    expect(parseItemList('rice, Rice, RICE')).toEqual(['rice']);
  });

  it('keeps the order the user typed', () => {
    expect(parseItemList('coffee, toast, egg')).toEqual(['coffee', 'toast', 'egg']);
  });

  it('returns nothing for empty input', () => {
    expect(parseItemList('')).toEqual([]);
    expect(parseItemList('  ,  \n ')).toEqual([]);
  });

  it('truncates an absurdly long item rather than rejecting the whole list', () => {
    const [item] = parseItemList('x'.repeat(500));
    expect(item?.length).toBe(ITEM_NAME_MAX_LENGTH);
  });

  it('caps the number of items', () => {
    const input = Array.from({ length: 100 }, (_, i) => `item ${i}`).join(', ');
    expect(parseItemList(input)).toHaveLength(MAX_ITEMS);
  });
});

describe('mealSummary', () => {
  const item = (rawName: string, position: number) => ({
    id: `i${position}`,
    mealId: 'm1',
    userId: 'u1',
    rawName,
    canonicalFactorId: null,
    confidence: null,
    userConfirmed: true,
    position,
  });

  it('lists what was eaten', () => {
    expect(mealSummary({ title: 'Lunch', items: [item('chicken', 0), item('rice', 1)] })).toBe(
      'chicken · rice'
    );
  });

  it('falls back to the title when nothing was itemised', () => {
    expect(mealSummary({ title: "Dinner at Mum's", items: [] })).toBe("Dinner at Mum's");
  });
});
