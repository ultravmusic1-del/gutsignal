/**
 * A finding as one spoken phrase (`CLAUDE.md` §36).
 *
 * ## The gap this closes
 *
 * `FindingCard` is a `Pressable` with its own `accessibilityLabel`, which makes the whole card a
 * single accessibility element — the label *replaces* the text inside it rather than adding to it.
 * The label carried the status and the headline and nothing else, so the two things the card takes
 * most trouble over never reached anyone using VoiceOver:
 *
 * - **the counts**, which the card shows precisely because "a rate without its denominator is a
 *   claim without its evidence";
 * - **the limitations**, which the card places on the front specifically so that "if confidence
 *   was held back, the reason travels with the claim rather than waiting on a detail screen the
 *   user may never open".
 *
 * Both of those are safety decisions. A sighted user saw the caveat; a VoiceOver user heard the
 * claim without it, which is the strongest version of the finding going to the person with the
 * least context. §36 is not a formatting rule.
 *
 * Order matters and is not the reading order of the card: status first, because it qualifies
 * everything after it, and limitations before the numbers, because a caveat heard after a
 * confident-sounding statistic has already lost the argument.
 */

import type { Finding } from '@/domain/pattern-engine/types';

import { comparisonNumbers, observationSentence } from './findingDetail';
import { PATTERN_STATUS_COPY } from './status';

/** Joins sentences so a screen reader pauses between them rather than running them together. */
function sentences(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => (part.endsWith('.') ? part : `${part}.`))
    .join(' ');
}

export function findingSpeech(finding: Finding): string {
  const status = PATTERN_STATUS_COPY[finding.status];
  const numbers = comparisonNumbers(finding);

  const unknown =
    finding.metrics.unknownCount > 0
      ? `${finding.metrics.unknownCount} more ${
          finding.metrics.unknownCount === 1 ? 'day' : 'days'
        } had nothing recorded either way`
      : '';

  return sentences([
    status.label,
    observationSentence(finding),
    // Before the numbers, deliberately. See the module comment.
    ...finding.limitations,
    `${numbers.exposed.summary}, versus ${numbers.control.summary}`,
    unknown,
  ]);
}
