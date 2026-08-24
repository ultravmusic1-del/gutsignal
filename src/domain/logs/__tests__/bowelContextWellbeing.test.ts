import { BRISTOL_TYPES, bowelDraftSchema, bristolDescription, bowelSummary } from '../bowel';
import { CONTEXT_TYPES, contextDraftSchema, contextSummary } from '../context';
import { wellbeingDraftSchema } from '../wellbeing';

const validBowel = {
  bristolType: 4,
  urgency: 'low',
  difficulty: 'easy',
  incomplete: false,
  occurredAt: new Date('2026-08-24T12:00:00Z'),
  note: undefined,
};

describe('bowelDraftSchema', () => {
  it('accepts a well-formed draft', () => {
    expect(bowelDraftSchema.safeParse(validBowel).success).toBe(true);
  });

  it('accepts every Bristol type', () => {
    for (const type of BRISTOL_TYPES) {
      expect(bowelDraftSchema.safeParse({ ...validBowel, bristolType: type }).success).toBe(true);
    }
  });

  it('rejects a Bristol type outside the scale', () => {
    expect(bowelDraftSchema.safeParse({ ...validBowel, bristolType: 0 }).success).toBe(false);
    expect(bowelDraftSchema.safeParse({ ...validBowel, bristolType: 8 }).success).toBe(false);
  });

  it('rejects unknown urgency or difficulty', () => {
    expect(bowelDraftSchema.safeParse({ ...validBowel, urgency: 'extreme' }).success).toBe(false);
    expect(bowelDraftSchema.safeParse({ ...validBowel, difficulty: 'awful' }).success).toBe(false);
  });

  it('rejects a future entry', () => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    expect(bowelDraftSchema.safeParse({ ...validBowel, occurredAt: tomorrow }).success).toBe(false);
  });
});

describe('bristol descriptions', () => {
  it('describes every type', () => {
    for (const type of BRISTOL_TYPES) {
      expect(bristolDescription(type).length).toBeGreaterThan(0);
    }
  });

  it('describes the observation without naming a condition', () => {
    // Spec §45 and CLAUDE.md §17: the scale describes one observation, never the person.
    const all = BRISTOL_TYPES.map(bristolDescription).join(' ').toLowerCase();

    for (const word of ['ibs', 'constipation', 'diarrhoea', 'diarrhea', 'crohn', 'colitis']) {
      expect(all).not.toContain(word);
    }
  });

  it('summarises an entry as a description, not a verdict', () => {
    expect(bowelSummary({ bristolType: 6, urgency: 'high' })).toBe('Type 6 · Mushy, ragged edges');
  });
});

describe('wellbeingDraftSchema', () => {
  it('needs nothing but a time', () => {
    expect(
      wellbeingDraftSchema.safeParse({ occurredAt: new Date('2026-08-24T12:00:00Z') }).success
    ).toBe(true);
  });

  it('rejects a future entry', () => {
    expect(
      wellbeingDraftSchema.safeParse({ occurredAt: new Date(Date.now() + 86_400_000) }).success
    ).toBe(false);
  });
});

describe('contextDraftSchema', () => {
  const base = { occurredAt: new Date('2026-08-24T12:00:00Z'), note: undefined };

  it('accepts a scaled type with a number', () => {
    expect(
      contextDraftSchema.safeParse({
        ...base,
        contextType: 'stress',
        valueNumeric: 3,
        valueText: null,
      }).success
    ).toBe(true);
  });

  it('accepts exercise with a level', () => {
    expect(
      contextDraftSchema.safeParse({
        ...base,
        contextType: 'exercise',
        valueNumeric: null,
        valueText: 'light',
      }).success
    ).toBe(true);
  });

  it('rejects a scaled type carrying a text value', () => {
    expect(
      contextDraftSchema.safeParse({
        ...base,
        contextType: 'stress',
        valueNumeric: null,
        valueText: 'light',
      }).success
    ).toBe(false);
  });

  it('rejects exercise carrying a number', () => {
    expect(
      contextDraftSchema.safeParse({
        ...base,
        contextType: 'exercise',
        valueNumeric: 3,
        valueText: null,
      }).success
    ).toBe(false);
  });

  it('rejects a value carrying both', () => {
    expect(
      contextDraftSchema.safeParse({
        ...base,
        contextType: 'stress',
        valueNumeric: 3,
        valueText: 'light',
      }).success
    ).toBe(false);
  });

  it('rejects a scale value outside 1–5', () => {
    for (const level of [0, 6]) {
      expect(
        contextDraftSchema.safeParse({
          ...base,
          contextType: 'stress',
          valueNumeric: level,
          valueText: null,
        }).success
      ).toBe(false);
    }
  });

  it('covers every declared context type', () => {
    for (const type of CONTEXT_TYPES) {
      const draft =
        type === 'exercise'
          ? { ...base, contextType: type, valueNumeric: null, valueText: 'none' }
          : { ...base, contextType: type, valueNumeric: 3, valueText: null };

      expect(contextDraftSchema.safeParse(draft).success).toBe(true);
    }
  });
});

describe('contextSummary', () => {
  it('names the scale end so a number never stands alone', () => {
    expect(contextSummary({ contextType: 'stress', valueNumeric: 5, valueText: null })).toBe(
      'Stress · 5/5 — Very stressed'
    );
    expect(contextSummary({ contextType: 'sleep_quality', valueNumeric: 1, valueText: null })).toBe(
      'Sleep quality · 1/5 — Slept badly'
    );
    expect(contextSummary({ contextType: 'stress', valueNumeric: 3, valueText: null })).toBe(
      'Stress · 3/5 — In between'
    );
  });

  it('reads an exercise entry by its level', () => {
    expect(
      contextSummary({ contextType: 'exercise', valueNumeric: null, valueText: 'intense' })
    ).toBe('Exercise · Intense');
  });
});
