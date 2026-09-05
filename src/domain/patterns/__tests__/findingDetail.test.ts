import {
  MIN_CONFIDENCE_FOR_MODERATE,
  MIN_CONFIDENCE_FOR_STRONG,
} from '@/domain/pattern-engine/scoring';
import type { Factor, Finding } from '@/domain/pattern-engine/types';

import {
  calculationSteps,
  confidenceWord,
  encodeFindingId,
  exposurePhrases,
  findByFindingId,
  formatLocalDate,
  nextStep,
  observationSentence,
  thingsToConsider,
} from '../findingDetail';

/**
 * The pattern detail page is where GutSignal shows its working (spec §51).
 *
 * Everything here turns a stored `Finding` into sentences. Nothing here recomputes anything, and
 * nothing may state more than the finding records — so these tests are mostly about language and
 * about not silently dropping evidence.
 */

const DAIRY: Factor = { key: 'meal_item:dairy', label: 'Dairy', source: 'meal_item' };
const POOR_SLEEP: Factor = { key: 'poor_sleep', label: 'Poorer sleep', source: 'context' };

function aFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    engineVersion: '1.0.0',
    factor: DAIRY,
    outcome: { kind: 'symptom_occurrence', symptomType: 'bloating' },
    analysisStart: '2026-06-01',
    analysisEnd: '2026-08-30',
    window: 'later_same_day',
    metrics: {
      exposedCount: 18,
      controlCount: 22,
      unknownCount: 7,
      exposedOutcomeRate: 0.46,
      controlOutcomeRate: 0.27,
      absoluteDifference: 0.19,
      relativeRisk: 0.46 / 0.27,
      exposedMeanSeverity: null,
      controlMeanSeverity: null,
      meanSeverityDifference: null,
      confidenceInterval: { low: 0.02, high: 0.36 },
    },
    consistency: { comparableWeeks: 8, agreeingWeeks: 6, agreementRate: 0.75 },
    confounders: [],
    trackingCompleteness: {
      totalDays: 90,
      daysWithAnyLog: 70,
      daysWithGoodState: 25,
      daysWithSymptom: 35,
      coverage: 70 / 90,
    },
    status: 'moderate',
    confidence: 0.61,
    limitations: [],
    generatedAt: '2026-08-31T09:00:00.000Z',
    ...overrides,
  };
}

describe('finding identity', () => {
  it('gives two findings about the same factor different ids when the window differs', () => {
    const later = aFinding({ window: 'later_same_day' });
    const next = aFinding({ window: 'next_morning' });

    expect(encodeFindingId(later)).not.toBe(encodeFindingId(next));
  });

  it('gives two findings about the same factor different ids when the outcome differs', () => {
    const bloating = aFinding({ outcome: { kind: 'symptom_occurrence', symptomType: 'bloating' } });
    const cramping = aFinding({ outcome: { kind: 'symptom_occurrence', symptomType: 'cramping' } });

    expect(encodeFindingId(bloating)).not.toBe(encodeFindingId(cramping));
  });

  it('is stable for the same finding', () => {
    expect(encodeFindingId(aFinding())).toBe(encodeFindingId(aFinding()));
  });

  // A user-typed meal item can contain anything at all, and the id travels through a URL.
  it('survives a factor key containing the separator and other awkward characters', () => {
    const awkward = aFinding({
      factor: { key: 'meal_item:soy|sauce / 50% "hot"', label: 'Soy sauce', source: 'meal_item' },
    });
    const plain = aFinding();

    expect(findByFindingId([plain, awkward], encodeFindingId(awkward))).toBe(awkward);
  });

  it('finds the matching finding, and only that one', () => {
    const wanted = aFinding({ factor: POOR_SLEEP });
    const others = [aFinding(), aFinding({ window: 'next_day' })];

    expect(findByFindingId([...others, wanted], encodeFindingId(wanted))).toBe(wanted);
  });

  // The logs can change between opening Insights and opening a detail page — an edit, a deletion,
  // or simply a day rolling over. The screen must be able to say so rather than crash.
  it('returns null when nothing matches', () => {
    expect(findByFindingId([aFinding()], 'not-a-real-id')).toBeNull();
    expect(findByFindingId([], encodeFindingId(aFinding()))).toBeNull();
  });
});

describe('confidence in words', () => {
  // Deliberately the same gates the engine scores against, so the word a user reads and the
  // status they see can never tell them different things.
  it('uses the scoring thresholds rather than a separate scale', () => {
    expect(confidenceWord(MIN_CONFIDENCE_FOR_STRONG)).toBe('High');
    expect(confidenceWord(MIN_CONFIDENCE_FOR_MODERATE)).toBe('Moderate');
    expect(confidenceWord(MIN_CONFIDENCE_FOR_MODERATE - 0.01)).toBe('Low');
  });

  it('covers the ends of the range', () => {
    expect(confidenceWord(0)).toBe('Low');
    expect(confidenceWord(1)).toBe('High');
  });
});

describe('describing the exposure', () => {
  // The engine compares days, not meals. Saying "meals containing dairy" would describe a
  // comparison the engine never made.
  it('talks about days for a meal factor, not meals', () => {
    expect(exposurePhrases(DAIRY).present).toBe('days when you logged dairy');
    expect(exposurePhrases(DAIRY).absent).toBe('days when you did not');
  });

  it('reads naturally for a context factor', () => {
    expect(exposurePhrases(POOR_SLEEP).present).toBe('days with poorer sleep');
    expect(exposurePhrases(POOR_SLEEP).absent).toBe('days without');
  });
});

describe('what we observed', () => {
  it('states the association without claiming a cause', () => {
    const sentence = observationSentence(aFinding());

    expect(sentence).toContain('Bloating');
    expect(sentence).toContain('more often');
    expect(sentence).toContain('days when you logged dairy');
    expect(sentence).not.toMatch(/caus|trigger|because|due to|leads to/i);
  });

  it('says less often when the outcome was rarer on exposed days', () => {
    const finding = aFinding({
      metrics: { ...aFinding().metrics, absoluteDifference: -0.19 },
    });

    expect(observationSentence(finding)).toContain('less often');
  });

  // A `no_clear_pattern` finding can have no difference at all, and must not be forced into a
  // direction it does not have.
  it('says as often when there was no difference', () => {
    const finding = aFinding({
      status: 'no_clear_pattern',
      metrics: { ...aFinding().metrics, absoluteDifference: 0 },
    });

    expect(observationSentence(finding)).toContain('about as often');
  });
});

describe('things to consider', () => {
  it('names every confounder in language that separates rather than explains', () => {
    const finding = aFinding({
      confounders: [
        { factor: POOR_SLEEP, overlap: 0.72 },
        { factor: { key: 'coffee', label: 'Coffee', source: 'meal_item' }, overlap: 0.65 },
      ],
    });

    const considerations = thingsToConsider(finding);

    expect(considerations).toHaveLength(2);
    expect(considerations.join(' ')).toContain('Poorer sleep');
    expect(considerations.join(' ')).toContain('Coffee');
    expect(considerations.join(' ')).not.toMatch(/caus|explains why|responsible/i);
  });

  it('says nothing when nothing travelled with this factor', () => {
    expect(thingsToConsider(aFinding())).toEqual([]);
  });
});

describe('the next step', () => {
  // Experiments arrive in Milestone 11. Until then the only honest suggestion is to keep logging,
  // and a disabled "Start an experiment" button would be a placeholder control (CLAUDE.md §57).
  it('suggests only what the app can actually do today', () => {
    const step = nextStep(aFinding());

    expect(step).toMatch(/keep logging/i);
    expect(step).not.toMatch(/experiment|avoid|cut out|eliminate|stop eating/i);
  });

  it('is honest that more data may weaken the signal, not only strengthen it', () => {
    expect(nextStep(aFinding())).toMatch(/fade|weaken|chance/i);
  });
});

describe('how this was calculated', () => {
  it('shows the counts the comparison was built from', () => {
    const steps = calculationSteps(aFinding());
    const text = steps.map((step) => `${step.label} ${step.detail}`).join(' | ');

    expect(text).toContain('18');
    expect(text).toContain('22');
  });

  it('says that unrecorded days were left out rather than counted as good', () => {
    const text = calculationSteps(aFinding())
      .map((step) => step.detail)
      .join(' ');

    expect(text).toContain('7');
    expect(text).toMatch(/left out|not counted/i);
  });

  it('omits the unrecorded-days step when there were none', () => {
    const finding = aFinding({ metrics: { ...aFinding().metrics, unknownCount: 0 } });
    const labels = calculationSteps(finding).map((step) => step.label);

    expect(labels).not.toContain('Days with nothing recorded');
  });

  it('reports the week-to-week check', () => {
    const text = calculationSteps(aFinding())
      .map((step) => step.detail)
      .join(' ');

    expect(text).toMatch(/6 of 8/);
  });

  it('says plainly when the week-to-week check could not be run', () => {
    const finding = aFinding({
      consistency: { comparableWeeks: 1, agreeingWeeks: 0, agreementRate: null },
    });
    const text = calculationSteps(finding)
      .map((step) => step.detail)
      .join(' ');

    expect(text).toMatch(/not enough weeks/i);
  });

  it('records which version of the engine produced this', () => {
    const text = calculationSteps(aFinding())
      .map((step) => step.detail)
      .join(' ');

    expect(text).toContain('1.0.0');
  });

  // The interval is null whenever a group was empty, and the step is dropped rather than shown
  // as a blank row.
  it('drops the precision step when there is no interval, leaving every other step intact', () => {
    const finding = aFinding({ metrics: { ...aFinding().metrics, confidenceInterval: null } });
    const steps = calculationSteps(finding);

    expect(steps.map((step) => step.label)).not.toContain('How precise this is');
    for (const step of steps) {
      expect(step.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('formatLocalDate', () => {
  // Parsed as a string, never through `new Date('2026-06-01')`, which is UTC midnight and lands
  // on the previous day for anyone west of Greenwich.
  it('formats a local date without going near a timezone', () => {
    expect(formatLocalDate('2026-06-01')).toBe('1 Jun 2026');
    expect(formatLocalDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('returns the input unchanged if it is not a local date', () => {
    expect(formatLocalDate('nonsense')).toBe('nonsense');
  });
});
