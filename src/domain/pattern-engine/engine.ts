/**
 * The pattern engine's seam (spec §53, §62).
 *
 * Everything else in this directory answers one question well. This joins them into the single
 * pass that turns a diary into findings:
 *
 * ```text
 * logs → days → candidate factors → observations → comparison → confounders
 *      → confidence → status → Finding
 * ```
 *
 * **Deterministic by construction.** No clock, no randomness, no iteration over unordered
 * structures: the same logs and the same engine version always produce byte-identical findings,
 * including the order they arrive in. That is what makes §62's promise — that a finding can be
 * reproduced and interrogated later — something the code actually delivers rather than claims.
 *
 * The outcomes scanned are derived from what the user has actually logged. Scanning for bowel
 * outcomes in a diary with no bowel entries would produce a page of "not enough data" that says
 * more about the scan than about the person.
 *
 * The scan's own breadth is accounted for before anything is returned: this pass routinely makes
 * dozens of comparisons, and `multiple-testing.ts` shrinks confidence accordingly (§61).
 */

import { compare, weeklyConsistency } from './comparisons';
import { assessConfidence } from './confidence';
import { findConfounders, maxOverlap } from './confounders';
import { candidateFactors, type CandidateLimits } from './exposures';
import { applyMultipleTestingControl } from './multiple-testing';
import {
  buildDays,
  buildObservations,
  trackingCompleteness,
  type DateRange,
  type LogSet,
} from './observations';
import { comparisonEffect, scoreStatus } from './scoring';
import { ENGINE_VERSION, type Finding, type ObservationWindowKey, type Outcome } from './types';
import { DEFAULT_WINDOW } from './windows';

export type AnalysisOptions = {
  logs: LogSet;
  range: DateRange;
  /** Overrides the outcomes derived from the logs. Mainly for tests and Ask My Gut. */
  outcomes?: Outcome[];
  limits?: Partial<CandidateLimits>;
  window?: ObservationWindowKey;
  /** Injected so `generatedAt` is deterministic. Defaults to now. */
  now?: Date;
};

/** Rank used to sort findings: the most substantiated first. */
const STATUS_RANK: Record<Finding['status'], number> = {
  stronger_recurring_signal: 4,
  moderate: 3,
  emerging: 2,
  no_clear_pattern: 1,
  insufficient_data: 0,
};

/**
 * The outcomes worth asking about, given what this diary actually contains.
 *
 * Symptom-specific outcomes are generated only for symptoms the user has recorded, so the scan
 * reflects their experience rather than the full vocabulary.
 */
export function outcomesFor(logs: LogSet): Outcome[] {
  const outcomes: Outcome[] = [];

  const symptomTypes = [...new Set(logs.symptoms.map((log) => log.symptomType))].sort();

  if (logs.symptoms.length > 0) {
    outcomes.push({ kind: 'any_symptom' });
    for (const symptomType of symptomTypes) {
      outcomes.push({ kind: 'symptom_occurrence', symptomType });
      outcomes.push({ kind: 'symptom_severity', symptomType });
    }
  }

  if (logs.bowel.length > 0) {
    outcomes.push({ kind: 'bowel_urgency' });
    outcomes.push({ kind: 'stool_consistency' });
  }

  if (logs.wellbeing.length > 0) {
    outcomes.push({ kind: 'wellbeing' });
  }

  return outcomes;
}

/** A stable label for an outcome, used only for ordering. */
function outcomeKey(outcome: Outcome): string {
  return `${outcome.kind}:${outcome.symptomType ?? ''}`;
}

/**
 * Runs the whole engine over one diary.
 *
 * Returns **every** pair examined, including those that came to nothing. A scan that silently
 * discarded its negatives would leave the user unable to tell "we looked and found nothing" from
 * "we never looked" — and the second is a much weaker statement than the first. Callers decide
 * what to surface; `docs/PATTERN_ENGINE.md` records what each status means.
 */
export function analyse({
  logs,
  range,
  outcomes,
  limits,
  window = DEFAULT_WINDOW,
  now = new Date(),
}: AnalysisOptions): Finding[] {
  const days = buildDays(logs, range);
  if (days.length === 0) return [];

  const completeness = trackingCompleteness(days);
  const candidates = candidateFactors(days, limits);
  if (candidates.length === 0) return [];

  const scannedOutcomes = outcomes ?? outcomesFor(logs);
  if (scannedOutcomes.length === 0) return [];

  const allFactors = candidates.map((candidate) => candidate.factor);
  const generatedAt = now.toISOString();

  const findings: Finding[] = [];

  for (const candidate of candidates) {
    const { factor } = candidate;

    // Computed once per factor: entanglement is a property of the factor and the diary, not of
    // whichever outcome is being examined.
    const confounders = findConfounders(days, factor, allFactors);
    const confounderOverlap = maxOverlap(confounders);

    for (const outcome of scannedOutcomes) {
      const observations = buildObservations(days, factor, outcome);
      const metrics = compare(observations);

      // A severity comparison needs a mean on both sides. When the symptom never occurred in one
      // group there is nothing to average there, so the intensity question was never answered —
      // and a finding emitted anyway would carry the *occurrence* rate under an intensity label,
      // duplicating the occurrence finding beside it. Two findings resting on one measurement
      // read as corroboration and overstate the evidence (§18). Skipping here rather than at the
      // screen also keeps the breadth correction honest: §21 corrects for how many questions were
      // asked, and a question that could not be answered was not one of them.
      if (outcome.kind === 'symptom_severity' && metrics.meanSeverityDifference === null) continue;

      // Consistency is checked against the same quantity the finding is about, and in the same
      // direction — a rate difference for occurrence outcomes, a difference of mean intensity for
      // `symptom_severity`.
      const effect = comparisonEffect(outcome, metrics);
      const consistency = weeklyConsistency(
        observations,
        effect.direction,
        outcome.kind === 'symptom_severity' ? 'severity' : 'rate'
      );

      const assessment = assessConfidence({
        outcome,
        metrics,
        consistency,
        trackingCompleteness: completeness,
        maxConfounderOverlap: confounderOverlap,
      });

      findings.push({
        engineVersion: ENGINE_VERSION,
        factor,
        outcome,
        analysisStart: range.start,
        analysisEnd: range.end,
        window,

        metrics,
        consistency,
        confounders,
        trackingCompleteness: completeness,

        status: scoreStatus({ outcome, metrics, consistency, confidence: assessment.confidence }),
        confidence: assessment.confidence,
        limitations: assessment.limitations,

        generatedAt,
      });
    }
  }

  // The breadth control runs before the sort, because it can change a status and therefore
  // where a finding belongs in the list. A finding must be ranked by what it is *after* the
  // scan's own width has been accounted for (§61).
  const controlled = applyMultipleTestingControl(findings);

  // Most substantiated first, then by confidence, then alphabetically — a total order, so the
  // same diary always produces the same list in the same sequence.
  return controlled.sort(
    (left, right) =>
      STATUS_RANK[right.status] - STATUS_RANK[left.status] ||
      right.confidence - left.confidence ||
      left.factor.key.localeCompare(right.factor.key) ||
      outcomeKey(left.outcome).localeCompare(outcomeKey(right.outcome))
  );
}
