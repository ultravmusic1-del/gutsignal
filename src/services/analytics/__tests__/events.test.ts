import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ANALYTICS_EVENT_NAMES, ANALYTICS_EVENT_SCHEMAS } from '../events';

/**
 * The §29 wall, tested against the declarations themselves.
 *
 * Every other test in this suite checks behaviour. This one checks the *allowlist*, because the
 * realistic failure is not a bug — it is a plausible-looking property added later by someone who
 * has not read §29. `severity: z.number()` would pass typecheck, lint, and every behavioural test
 * in the codebase, and would put health data in a vendor's database.
 *
 * Health content in analytics is a release blocker (`CLAUDE.md` §58), so it fails here instead.
 */

const EVENTS_SOURCE = readFileSync(join(process.cwd(), 'src/services/analytics/events.ts'), 'utf8');

/**
 * Only the declarations, with the prose stripped.
 *
 * The module doc necessarily names the things it forbids — "may never appear here: symptom type,
 * severity…" — so scanning the whole file would flag its own explanation. Comments are removed
 * first so the scan sees code and nothing else.
 */
const declarations = EVENTS_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * Identifier segments, so a match means a whole word rather than a substring.
 *
 * `context_log_completed` must not trip on "text", and `entryPoint` must not trip on "int". A
 * substring scan produces exactly those false alarms, and a wall that cries wolf is a wall that
 * gets a suppression comment added to it.
 */
const identifiers = declarations.split(/[^A-Za-z]+/).filter((token) => token.length > 0);

const segments = new Set(
  [...identifiers, ...identifiers.flatMap((token) => token.split(/(?=[A-Z])/))]
    .map((segment) => segment.toLowerCase())
    .filter((segment) => segment.length > 0)
);

/** Words that name health content, per `CLAUDE.md` §29. */
const FORBIDDEN = [
  'symptomType',
  'severity',
  'bristol',
  'stool',
  'urgency',
  'food',
  'ingredient',
  'mealItem',
  'items',
  'title',
  'journal',
  'note',
  'text',
  'query',
  'content',
  'factor',
  'suspected',
  'healthkit',
  'sleepHours',
  // 'steps' alone is too generic to be a signal — the onboarding flow has steps too. The
  // HealthKit field is a step count, and 'healthkit' above catches the rest.
  'stepCount',
  'weight',
];

describe('the analytics allowlist', () => {
  it.each(FORBIDDEN)('does not declare anything named like %s', (word) => {
    expect(segments).not.toContain(word.toLowerCase());
  });

  // A free-form string is an open channel: whatever discipline exists today, the type permits a
  // meal title tomorrow. Enums and booleans cannot carry content by construction.
  it('declares no free-form string or number property', () => {
    expect(declarations).not.toMatch(/z\.string\(\)/);
    expect(declarations).not.toMatch(/z\.number\(\)/);
  });

  // `.strict()` is what makes an undeclared property a runtime failure rather than a passthrough.
  it('makes every event schema strict', () => {
    const objects = declarations.match(/z\s*\.object\(/g) ?? [];
    const stricts = declarations.match(/\.strict\(\)/g) ?? [];

    expect(objects.length).toBeGreaterThan(0);
    expect(stricts).toHaveLength(objects.length);
  });

  it('has at least one event, and gives every one a schema', () => {
    expect(ANALYTICS_EVENT_NAMES.length).toBeGreaterThan(0);

    for (const name of ANALYTICS_EVENT_NAMES) {
      expect(ANALYTICS_EVENT_SCHEMAS[name]).toBeDefined();
    }
  });

  // An event name is sent verbatim to the vendor, so it is as much a channel as a property is.
  it('names no event after something it must not describe', () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(name).not.toMatch(/severity|bristol|journal|food|factor/);
    }
  });

  // Every declared event must actually reject an undeclared property, not just claim to.
  it.each(ANALYTICS_EVENT_NAMES)('rejects an undeclared property on %s', (name) => {
    const result = ANALYTICS_EVENT_SCHEMAS[name].safeParse({ severity: 8 });

    expect(result.success).toBe(false);
  });
});
