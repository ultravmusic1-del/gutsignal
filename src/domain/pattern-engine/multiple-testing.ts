/**
 * Guarding against the scan itself (spec §61, CLAUDE.md §21).
 *
 * The engine compares every candidate factor against every outcome. A diary with a dozen
 * factors and half a dozen outcomes produces seventy-odd comparisons in one pass, and at that
 * breadth some differences appear by chance alone. A finding that would be interesting on its
 * own is much less interesting as the most extreme of seventy attempts.
 *
 * **What this does.** Confidence is shrunk in proportion to how wide the scan was, the status is
 * then re-scored from the shrunk value — so a wide scan can demote a finding but never promote
 * one — and a plain-language line is added telling the user how many comparisons were made.
 *
 * **What this deliberately is not.** It is not a false-discovery-rate procedure. A proper FDR
 * control needs per-comparison p-values, and spec §57 rules out p-values as user-facing truth;
 * computing them privately to drive a visible status would put the product's most consequential
 * decision behind a number it has decided not to show. Spec §61 explicitly sanctions
 * "shrinkage/down-weighting" as an alternative, and that is what this is.
 *
 * **The shrinkage curve is a judgement, not a measurement.** It is deliberately conservative and
 * needs tuning against real diaries before release — `docs/PATTERN_ENGINE.md` records that as an
 * open item. What is *not* a judgement is the direction: more comparisons must always mean less
 * confidence in any one of them.
 */

import { scoreStatus } from './scoring';
import type { Finding } from './types';

/**
 * Comparisons allowed before shrinkage begins.
 *
 * A handful of comparisons is ordinary analysis rather than a fishing expedition, and penalising
 * a user with a small, well-tracked diary for the engine's own thoroughness would be perverse.
 */
export const FREE_COMPARISONS = 10;

/** Shrinkage never falls below this, so a broad scan cannot silence a diary entirely. */
export const MIN_BREADTH_PENALTY = 0.25;

/**
 * How much a single comparison's confidence survives a scan of `scanSize`.
 *
 * Square-root shrinkage: doubling the number of comparisons costs about 30% of the confidence in
 * any one of them. Chosen to be firm without being absolute — a real association in a
 * well-tracked diary should still be able to reach `moderate` through a wide scan, while a lone
 * coincidence should not.
 */
export function breadthPenalty(scanSize: number): number {
  if (scanSize <= FREE_COMPARISONS) return 1;

  return Math.max(MIN_BREADTH_PENALTY, Math.sqrt(FREE_COMPARISONS / scanSize));
}

/**
 * Comparisons that actually happened.
 *
 * A pair with an empty group was never a chance for a coincidence, so counting it would inflate
 * the penalty and punish the user for factors the engine could not examine.
 */
export function countRealComparisons(findings: Finding[]): number {
  return findings.filter(
    (finding) => finding.metrics.exposedCount > 0 && finding.metrics.controlCount > 0
  ).length;
}

/**
 * Applies the breadth control to a whole scan.
 *
 * Re-scores every finding from its shrunk confidence, so the status a user sees already accounts
 * for how many other things were examined alongside it.
 */
export function applyMultipleTestingControl(findings: Finding[]): Finding[] {
  const scanSize = countRealComparisons(findings);
  const penalty = breadthPenalty(scanSize);

  if (penalty === 1) return findings;

  const note = `GutSignal compared ${scanSize} combinations across this period. When that many comparisons are made, some differences show up by chance, so each one is treated more cautiously.`;

  return findings.map((finding) => {
    const confidence = finding.confidence * penalty;

    return {
      ...finding,
      confidence,
      status: scoreStatus({
        metrics: finding.metrics,
        consistency: finding.consistency,
        confidence,
      }),
      limitations: [...finding.limitations, note],
    };
  });
}
