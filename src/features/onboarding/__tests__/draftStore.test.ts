import { customFactorKey } from '@/domain/onboarding/options';

import { draftSnapshot, useOnboardingDraft } from '../draftStore';

const store = () => useOnboardingDraft.getState();

beforeEach(() => {
  store().reset();
});

describe('onboarding draft', () => {
  it('starts empty, with a sensible tracking default and no acknowledgement', () => {
    const draft = store();

    expect(draft.goals).toEqual([]);
    expect(draft.symptoms).toEqual([]);
    expect(draft.bowelPattern).toBeNull();
    expect(draft.suspectedFactors).toEqual([]);
    expect(draft.trackingStyle).toBe('balanced');
    expect(draft.acknowledgedNonDiagnostic).toBe(false);
  });

  it('toggles multi-select answers on and off', () => {
    store().toggleGoal('triggers');
    store().toggleGoal('habits');
    expect(store().goals).toEqual(['triggers', 'habits']);

    store().toggleGoal('triggers');
    expect(store().goals).toEqual(['habits']);
  });

  it('replaces the single-select bowel pattern rather than accumulating', () => {
    store().setBowelPattern('mixed');
    store().setBowelPattern('varies');

    expect(store().bowelPattern).toBe('varies');
  });

  it('toggles catalogue factors by key', () => {
    store().toggleFactor({ key: 'coffee' });
    store().toggleFactor({ key: 'dairy' });
    expect(store().suspectedFactors.map((f) => f.key)).toEqual(['coffee', 'dairy']);

    store().toggleFactor({ key: 'coffee' });
    expect(store().suspectedFactors.map((f) => f.key)).toEqual(['dairy']);
  });

  it('keeps the user words on a custom factor', () => {
    const label = 'Fizzy drinks';
    store().addCustomFactor({ key: customFactorKey(label), label });

    expect(store().suspectedFactors).toEqual([{ key: 'custom:fizzy-drinks', label }]);
  });

  it('does not add the same custom factor twice', () => {
    store().addCustomFactor({ key: 'custom:kefir', label: 'Kefir' });
    store().addCustomFactor({ key: 'custom:kefir', label: 'kefir' });

    expect(store().suspectedFactors).toHaveLength(1);
  });

  it('acknowledges the non-diagnostic statement only once asked', () => {
    expect(store().acknowledgedNonDiagnostic).toBe(false);
    store().acknowledge();
    expect(store().acknowledgedNonDiagnostic).toBe(true);
  });

  it('produces a snapshot that does not alias the live store', () => {
    store().toggleGoal('triggers');
    store().toggleFactor({ key: 'coffee' });

    const snapshot = draftSnapshot(store());
    store().toggleGoal('habits');
    store().toggleFactor({ key: 'dairy' });

    // The snapshot is what gets written to the database; it must not drift underneath the save.
    expect(snapshot.goals).toEqual(['triggers']);
    expect(snapshot.suspectedFactors).toEqual([{ key: 'coffee' }]);
  });

  it('clears everything on reset, so a second account never inherits the first answers', () => {
    store().toggleGoal('triggers');
    store().toggleSymptom('bloating');
    store().setBowelPattern('mixed');
    store().addCustomFactor({ key: 'custom:kefir', label: 'Kefir' });
    store().setTrackingStyle('detailed');
    store().acknowledge();

    store().reset();

    expect(draftSnapshot(store())).toEqual({
      goals: [],
      symptoms: [],
      bowelPattern: null,
      suspectedFactors: [],
      trackingStyle: 'balanced',
      acknowledgedNonDiagnostic: false,
    });
  });
});
