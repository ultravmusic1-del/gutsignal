import type { Finding } from '@/domain/pattern-engine/types';

import { findingSpeech } from '../findingSpeech';

/**
 * What a VoiceOver user hears when they reach a finding.
 *
 * `FindingCard` is a `Pressable` with its own label, which makes the card one accessibility
 * element — the label replaces its children rather than adding to them. So anything missing here
 * is not read, and the two things the card takes most trouble over are the counts and the
 * limitations. Both are safety decisions: a sighted user saw the caveat, a listener heard the
 * claim without it, which sends the strongest version of a finding to the person with the least
 * context (§36).
 */

const finding = (over: Partial<Finding> = {}): Finding =>
  ({
    status: 'moderate',
    factor: { key: 'food:dairy', label: 'dairy', kind: 'food' },
    outcome: { kind: 'symptom_occurrence', symptomType: 'bloating', label: 'bloating' },
    limitations: [],
    metrics: {
      exposedCount: 10,
      controlCount: 12,
      exposedRate: 0.6,
      controlRate: 0.25,
      absoluteDifference: 0.35,
      unknownCount: 0,
      exposedMeanSeverity: null,
      controlMeanSeverity: null,
      meanSeverityDifference: null,
    },
    ...over,
  }) as unknown as Finding;

describe('a finding spoken aloud', () => {
  it('leads with the status, because it qualifies everything after it', () => {
    expect(findingSpeech(finding())).toMatch(/^Moderate/i);
  });

  /**
   * "A rate without its denominator is a claim without its evidence" — the card's own words, and
   * the reason the counts are on the front of it rather than behind a tap.
   */
  it('carries the counts behind the claim', () => {
    const spoken = findingSpeech(finding());

    expect(spoken).toMatch(/10/);
    expect(spoken).toMatch(/12/);
  });

  /**
   * The ordering rule. A caveat heard after a confident-sounding statistic has already lost the
   * argument, so limitations come before the numbers rather than after them.
   */
  it('speaks a limitation before the numbers it qualifies', () => {
    const spoken = findingSpeech(
      finding({ limitations: ['Based on a small number of days.'] } as Partial<Finding>)
    );

    expect(spoken).toContain('Based on a small number of days.');
    expect(spoken.indexOf('Based on a small number of days')).toBeLessThan(spoken.indexOf('10'));
  });

  it('speaks every limitation, not only the first', () => {
    const spoken = findingSpeech(
      finding({
        limitations: ['Based on a small number of days.', 'Coffee occurred on most of them.'],
      } as Partial<Finding>)
    );

    expect(spoken).toContain('Based on a small number of days.');
    expect(spoken).toContain('Coffee occurred on most of them.');
  });

  /**
   * §19: days with nothing recorded are named, never folded into a denominator. That holds when
   * the card is heard rather than read.
   */
  it('names the days that had nothing recorded either way', () => {
    const spoken = findingSpeech(
      finding({
        metrics: { ...finding().metrics, unknownCount: 4 },
      } as Partial<Finding>)
    );

    expect(spoken).toMatch(/4 more days had nothing recorded either way/);
  });

  it('says nothing about unrecorded days when there are none', () => {
    expect(findingSpeech(finding())).not.toMatch(/nothing recorded either way/);
  });

  it('separates its parts into sentences rather than running them together', () => {
    const spoken = findingSpeech(
      finding({ limitations: ['Based on a small number of days.'] } as Partial<Finding>)
    );

    // No ".Something" — a screen reader needs the space to pause.
    expect(spoken).not.toMatch(/\.\S/);
  });

  /**
   * §17 travels with the words wherever they are spoken.
   */
  it('never speaks a cause', () => {
    const spoken = findingSpeech(finding());

    expect(spoken).not.toMatch(/\bcause[sd]?\b|\btriggers?\b|\bbecause of\b/i);
  });
});
