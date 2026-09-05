import { OUTCOME_KINDS } from '@/domain/pattern-engine/types';

import { OUTCOME_LABELS, outcomeLabel } from '../outcomeLabels';

/**
 * Outcome naming is a product-safety boundary (spec §17), so it is tested like one.
 *
 * Two things matter here. Every outcome the engine can produce must have a label, or a finding
 * reaches a screen with nothing to call itself; and no label may name a condition, because the
 * outcome name is the most prominent words on a finding card.
 */

/** Clinical terms for what the user recorded. All of these describe a diagnosis, not an entry. */
const CLINICAL_TERMS = [
  'diarrhoea',
  'diarrhea',
  'constipation',
  'ibs',
  'crohn',
  'colitis',
  'sibo',
  'intolerance',
  'intolerant',
  'allergy',
  'allergic',
  'disorder',
  'disease',
  'syndrome',
];

describe('outcome labels', () => {
  it('names every outcome the engine can produce', () => {
    for (const kind of OUTCOME_KINDS) {
      expect(OUTCOME_LABELS[kind]().length).toBeGreaterThan(0);
    }
  });

  it.each(OUTCOME_KINDS)('describes %s as an observation, not a condition', (kind) => {
    const label = OUTCOME_LABELS[kind]('bloating').toLowerCase();

    for (const term of CLINICAL_TERMS) {
      expect(label).not.toContain(term);
    }
  });

  it('uses the symptom own name when the outcome is about one symptom', () => {
    expect(outcomeLabel('symptom_occurrence', 'bloating')).toBe('Bloating');
    expect(outcomeLabel('symptom_severity', 'bloating')).toBe('Bloating intensity');
  });

  // The engine only sets `symptomType` for symptom-specific outcomes, but a stored finding read
  // back from an older engine version could arrive without it. A missing symptom must degrade to
  // a vaguer sentence, never to "undefined was recorded more often".
  it('stays readable when a symptom-specific outcome has lost its symptom', () => {
    expect(outcomeLabel('symptom_occurrence')).toBe('A symptom');
    expect(outcomeLabel('symptom_severity')).toBe('Symptom intensity');
  });

  // An unrecognised key would come from a symptom the user typed themselves, or from a key that
  // has since been renamed. Showing the raw key is ugly but honest; crashing is not an option.
  it('falls back to the raw key for a symptom it does not recognise', () => {
    expect(outcomeLabel('symptom_occurrence', 'something_custom')).toBe('something_custom');
  });

  it('does not vary the label for outcomes that are not symptom-specific', () => {
    expect(outcomeLabel('wellbeing', 'bloating')).toBe(outcomeLabel('wellbeing'));
    expect(outcomeLabel('any_symptom', 'bloating')).toBe(outcomeLabel('any_symptom'));
  });
});
