/**
 * How an outcome is named to a person (spec §17, §55).
 *
 * Kept in `domain` rather than in a screen because these strings are a product-safety boundary:
 * every surface that describes a finding — Insights, pattern detail, Ask My Gut, reports, PDF
 * export — must name an outcome the same way, and none of them may name a condition.
 *
 * Every label describes **what the user recorded**, never what it means. "Loose stool" is an
 * observation; "diarrhoea" is a clinical term, and the difference matters more here than
 * anywhere else in the app.
 */

import { symptomLabel } from '@/domain/logs/symptom';
import type { OutcomeKind } from '@/domain/pattern-engine/types';
import type { SymptomKey } from '@/domain/onboarding/options';

export const OUTCOME_LABELS: Record<OutcomeKind, (symptomType?: string) => string> = {
  symptom_occurrence: (symptomType) =>
    symptomType ? symptomLabel(symptomType as SymptomKey) : 'A symptom',

  symptom_severity: (symptomType) =>
    symptomType ? `${symptomLabel(symptomType as SymptomKey)} intensity` : 'Symptom intensity',

  any_symptom: () => 'Any symptom',

  // Describes what was recorded on the bowel log, not what it indicates.
  bowel_urgency: () => 'Strong urgency',
  stool_consistency: () => 'A looser or firmer stool',

  wellbeing: () => 'Feeling good',
};

export function outcomeLabel(kind: OutcomeKind, symptomType?: string): string {
  return OUTCOME_LABELS[kind](symptomType);
}
