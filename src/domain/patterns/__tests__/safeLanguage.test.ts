import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { PATTERN_STATUS_COPY, PATTERN_STATUSES } from '../status';

/**
 * Product-safety guard (spec §4, §17, §50).
 *
 * GutSignal reports associations, never causes or diagnoses. That rule is easy to state and
 * easy to erode one helpful-sounding sentence at a time, so it is enforced by a test that
 * scans the shipped source for causal and diagnostic phrasing.
 *
 * The patterns below are deliberately unambiguous — they match claims, not topics. Writing
 * "GutSignal does not diagnose conditions" is required copy and must keep passing; writing
 * "coffee causes your symptoms" must not.
 */

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bcauses your\b/i, why: 'causal claim' },
  { pattern: /\bis (?:a |one of your )?trigger\b/i, why: 'causal claim' },
  { pattern: /\bconfirmed_trigger\b/i, why: 'status label implying causation' },
  { pattern: /\byou have (?:IBS|Crohn|ulcerative colitis|SIBO)\b/i, why: 'diagnosis' },
  { pattern: /\byou are (?:lactose|gluten|fructose) intolerant\b/i, why: 'diagnosis' },
  { pattern: /\bthis proves\b/i, why: 'overclaim' },
  { pattern: /\bwill cure\b/i, why: 'treatment claim' },
  { pattern: /\byou should stop taking\b/i, why: 'medication advice' },
];

const ROOTS = ['src', 'app'];
const EXTENSIONS = ['.ts', '.tsx'];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      sourceFiles(path, found);
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(path);
    }
  }
  return found;
}

describe('pattern status vocabulary', () => {
  it('has exactly the five permitted statuses', () => {
    expect(PATTERN_STATUSES).toEqual([
      'insufficient_data',
      'emerging',
      'moderate',
      'stronger_recurring_signal',
      'no_clear_pattern',
    ]);
  });

  it('gives every status user-facing copy', () => {
    for (const status of PATTERN_STATUSES) {
      expect(PATTERN_STATUS_COPY[status].label.length).toBeGreaterThan(0);
      expect(PATTERN_STATUS_COPY[status].description.length).toBeGreaterThan(0);
    }
  });

  it('never labels a finding as a trigger or a cause', () => {
    const copy = Object.values(PATTERN_STATUS_COPY)
      .map((entry) => `${entry.label} ${entry.description}`)
      .join(' ');

    for (const { pattern } of FORBIDDEN) {
      expect(copy).not.toMatch(pattern);
    }
  });
});

describe('shipped source contains no causal or diagnostic claims', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root));

  it('scans a non-trivial number of files (guards against a broken walker)', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(FORBIDDEN)('contains no $why matching $pattern', ({ pattern }) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
