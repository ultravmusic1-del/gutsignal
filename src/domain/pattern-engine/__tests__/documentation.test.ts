/**
 * @jest-environment node
 *
 * `docs/PATTERN_ENGINE.md` must describe the engine that actually exists.
 *
 * `CLAUDE.md` §21 requires the statistical decisions to be documented, and §47 requires the docs
 * not to be knowingly inaccurate. A threshold table that has drifted from the code is worse than
 * no table: it is a confident, checkable-looking claim that happens to be false, and every reader
 * after it inherits the mistake.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONFOUNDER_THRESHOLD } from '../confounders';
import {
  FULL_SAMPLE,
  PRECISE_WIDTH,
  UNMEASURED_CONSISTENCY,
  USELESS_WIDTH,
  WEAK_COMPONENT,
} from '../confidence';
import { DEFAULT_CANDIDATE_LIMITS } from '../exposures';
import { CONTEXT_HIGH_THRESHOLD, CONTEXT_LOW_THRESHOLD } from '../factors';
import { FREE_COMPARISONS, MIN_BREADTH_PENALTY } from '../multiple-testing';
import {
  MIN_AGREEMENT_FOR_STRONG,
  MIN_CONFIDENCE_FOR_MODERATE,
  MIN_CONFIDENCE_FOR_STRONG,
  MIN_GROUP_FOR_ANY_CLAIM,
  MIN_GROUP_FOR_MODERATE,
  MIN_GROUP_FOR_STRONG,
  MIN_MEANINGFUL_DIFFERENCE,
  MIN_WEEKS_FOR_STRONG,
} from '../scoring';
import { ENGINE_VERSION } from '../types';
import { OBSERVATION_WINDOWS } from '../windows';

const DOC = readFileSync(join(process.cwd(), 'docs', 'PATTERN_ENGINE.md'), 'utf8');

/** The value the doc's threshold table gives for `name`. */
function documentedValue(name: string): string | undefined {
  const row = new RegExp(`\\|\\s*\`${name}\`\\s*\\|\\s*([^|]+?)\\s*\\|`).exec(DOC);
  return row?.[1];
}

describe('the document exists and covers what §21 requires', () => {
  it.each([
    ['the pipeline', /## 2\. The pipeline/],
    ['observability', /## 3\. Observability/],
    ['factors', /## 4\. Factors/],
    ['candidate selection', /## 5\. Choosing what to examine/],
    ['the statistics', /## 6\. The statistics/],
    ['confounding', /## 7\. Confounding/],
    ['confidence', /## 8\. Confidence/],
    ['status', /## 9\. Status/],
    ['multiple comparisons', /## 10\. The breadth of the scan/],
    ['windows', /## 11\. Observation windows/],
    ['reproducibility', /## 12\. Reproducibility/],
    ['the fixture suite', /## 13\. The fixture suite/],
    ['open items', /## 14\. Open items/],
  ])('documents %s', (_name, pattern) => {
    expect(DOC).toMatch(pattern);
  });

  it('states the engine version it describes', () => {
    expect(DOC).toContain(`Engine version ${ENGINE_VERSION}`);
  });
});

describe('every documented threshold matches the code', () => {
  it.each([
    ['FULL_SAMPLE', FULL_SAMPLE],
    ['WEAK_COMPONENT', WEAK_COMPONENT],
    ['UNMEASURED_CONSISTENCY', UNMEASURED_CONSISTENCY],
    ['PRECISE_WIDTH', PRECISE_WIDTH],
    ['USELESS_WIDTH', USELESS_WIDTH],
    ['CONFOUNDER_THRESHOLD', CONFOUNDER_THRESHOLD],
    ['CONTEXT_HIGH_THRESHOLD', CONTEXT_HIGH_THRESHOLD],
    ['CONTEXT_LOW_THRESHOLD', CONTEXT_LOW_THRESHOLD],
    ['FREE_COMPARISONS', FREE_COMPARISONS],
    ['MIN_BREADTH_PENALTY', MIN_BREADTH_PENALTY],
    ['MIN_GROUP_FOR_ANY_CLAIM', MIN_GROUP_FOR_ANY_CLAIM],
    ['MIN_GROUP_FOR_MODERATE', MIN_GROUP_FOR_MODERATE],
    ['MIN_GROUP_FOR_STRONG', MIN_GROUP_FOR_STRONG],
    ['MIN_MEANINGFUL_DIFFERENCE', MIN_MEANINGFUL_DIFFERENCE],
    ['MIN_WEEKS_FOR_STRONG', MIN_WEEKS_FOR_STRONG],
    ['MIN_AGREEMENT_FOR_STRONG', MIN_AGREEMENT_FOR_STRONG],
    ['MIN_CONFIDENCE_FOR_MODERATE', MIN_CONFIDENCE_FOR_MODERATE],
    ['MIN_CONFIDENCE_FOR_STRONG', MIN_CONFIDENCE_FOR_STRONG],
    ['minExposedDays', DEFAULT_CANDIDATE_LIMITS.minExposedDays],
    ['minControlDays', DEFAULT_CANDIDATE_LIMITS.minControlDays],
    ['minItemMentions', DEFAULT_CANDIDATE_LIMITS.minItemMentions],
  ])('%s', (name, value) => {
    const documented = documentedValue(name);

    // Undefined here means the constant is missing from the threshold tables entirely. The
    // test name carries which one, so the bare assertion still identifies itself.
    expect(documented).toBeDefined();
    expect(Number(documented)).toBe(value);
  });
});

describe('the documented window bounds match the code', () => {
  it.each(Object.values(OBSERVATION_WINDOWS).map((w) => [w.key, w] as const))(
    '%s',
    (key, window) => {
      const row = new RegExp(`\\|\\s*\`${key}\`\\s*\\|\\s*(\\d+)h\\s*\\|\\s*(\\d+)h\\s*\\|`).exec(
        DOC
      );

      // Null here means this window is missing from the doc's table.
      expect(row).not.toBeNull();
      expect(Number(row![1])).toBe(window.fromHours);
      expect(Number(row![2])).toBe(window.toHours);
    }
  );
});

describe('the document keeps the product-safety line', () => {
  it('states that an LLM may never produce a finding', () => {
    expect(DOC).toMatch(/may never produce one/i);
  });

  it('states that a blank day is not a good day', () => {
    expect(DOC).toMatch(/blank day is not a good day/i);
  });

  it('records the interval’s limitation rather than overselling it', () => {
    // The trap that would otherwise be rediscovered the hard way.
    expect(DOC).toMatch(/not a sample-size guard/i);
  });

  it('admits the thresholds are untuned judgements', () => {
    expect(DOC).toMatch(/judgement, not a measurement/i);
    expect(DOC).toMatch(/never been tuned/i);
  });

  it('records that nothing has run on a device', () => {
    expect(DOC).toMatch(/has run on a device/i);
  });
});
