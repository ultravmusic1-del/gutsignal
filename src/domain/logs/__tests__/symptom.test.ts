import { SYMPTOM_KEYS } from '@/domain/onboarding/options';

import { SEVERITY_MAX, SEVERITY_MIN, symptomDraftSchema, severityLabel } from '../symptom';

describe('symptomDraftSchema', () => {
  const valid = {
    symptomType: 'bloating',
    severity: 5,
    occurredAt: new Date(),
    note: 'after lunch',
  };

  it('accepts a well-formed draft', () => {
    expect(symptomDraftSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts every symptom the user could have chosen in onboarding', () => {
    for (const key of SYMPTOM_KEYS) {
      expect(symptomDraftSchema.safeParse({ ...valid, symptomType: key }).success).toBe(true);
    }
  });

  it('rejects a symptom outside the shared vocabulary', () => {
    expect(symptomDraftSchema.safeParse({ ...valid, symptomType: 'migraine' }).success).toBe(false);
  });

  it('rejects severity outside 1–10', () => {
    expect(symptomDraftSchema.safeParse({ ...valid, severity: 0 }).success).toBe(false);
    expect(symptomDraftSchema.safeParse({ ...valid, severity: 11 }).success).toBe(false);
    expect(symptomDraftSchema.safeParse({ ...valid, severity: 5.5 }).success).toBe(false);
  });

  it('accepts both ends of the severity scale', () => {
    expect(symptomDraftSchema.safeParse({ ...valid, severity: SEVERITY_MIN }).success).toBe(true);
    expect(symptomDraftSchema.safeParse({ ...valid, severity: SEVERITY_MAX }).success).toBe(true);
  });

  it('treats a note as optional and trims it', () => {
    const withoutNote = symptomDraftSchema.safeParse({ ...valid, note: undefined });
    expect(withoutNote.success).toBe(true);

    const padded = symptomDraftSchema.safeParse({ ...valid, note: '  after lunch  ' });
    expect(padded.success && padded.data.note).toBe('after lunch');
  });

  it('rejects a note long enough to be a journal entry', () => {
    expect(symptomDraftSchema.safeParse({ ...valid, note: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('rejects a future occurrence', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(symptomDraftSchema.safeParse({ ...valid, occurredAt: tomorrow }).success).toBe(false);
  });
});

describe('severityLabel', () => {
  it('describes intensity without implying a diagnosis or a cause', () => {
    expect(severityLabel(1)).toBe('Barely noticeable');
    expect(severityLabel(5)).toBe('Moderate');
    expect(severityLabel(10)).toBe('Severe');
  });

  it('covers every point on the scale', () => {
    for (let severity = SEVERITY_MIN; severity <= SEVERITY_MAX; severity += 1) {
      expect(severityLabel(severity).length).toBeGreaterThan(0);
    }
  });
});
