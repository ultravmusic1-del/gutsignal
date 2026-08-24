import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BOWEL_PATTERNS,
  BOWEL_PATTERN_KEYS,
  CUSTOM_FACTOR_PREFIX,
  GOALS,
  GOAL_KEYS,
  SUSPECTED_FACTORS,
  SUSPECTED_FACTOR_KEYS,
  SYMPTOMS,
  SYMPTOM_KEYS,
  TRACKING_STYLES,
  TRACKING_STYLE_KEYS,
  customFactorKey,
  isCustomFactorKey,
} from '../options';
import { LOG_SOURCES } from '@/domain/logs/source';

/**
 * These vocabularies exist in two places: here, and as check constraints in the migration.
 * A drift between them would not fail at build time — it would fail at INSERT time, on a
 * user's device, at the end of onboarding, after they answered every question.
 *
 * So the test reads the migration and compares.
 */
const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260824120000_onboarding_preferences.sql'),
  'utf8'
);

/** Pulls the quoted values out of a `check (col in ('a', 'b'))` clause. */
function constraintValues(column: string, sql: string = migrationSql): string[] {
  const match = new RegExp(`${column}\\s+in\\s*\\(([^)]*)\\)`, 'i').exec(sql);
  if (!match?.[1]) throw new Error(`No check constraint found for ${column}`);

  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

describe('database vocabulary parity', () => {
  it('symptom keys match the user_symptom_preferences constraint', () => {
    expect([...SYMPTOM_KEYS].sort()).toEqual(constraintValues('symptom_type').sort());
  });

  it('bowel pattern keys match the user_preferences constraint', () => {
    expect([...BOWEL_PATTERN_KEYS].sort()).toEqual(constraintValues('bowel_pattern').sort());
  });

  it('tracking style keys match the profiles constraint', () => {
    const profilesSql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260824100000_profiles.sql'),
      'utf8'
    );
    const values = [
      ...(/tracking_style\s+in\s*\(([^)]*)\)/i.exec(profilesSql)?.[1]?.matchAll(/'([^']+)'/g) ??
        []),
    ].map((m) => m[1]);

    expect([...TRACKING_STYLE_KEYS].sort()).toEqual(values.sort());
  });
});

describe('option lists', () => {
  it.each([
    ['goals', GOALS, GOAL_KEYS],
    ['symptoms', SYMPTOMS, SYMPTOM_KEYS],
    ['bowel patterns', BOWEL_PATTERNS, BOWEL_PATTERN_KEYS],
    ['suspected factors', SUSPECTED_FACTORS, SUSPECTED_FACTOR_KEYS],
    ['tracking styles', TRACKING_STYLES, TRACKING_STYLE_KEYS],
  ])('%s: every key has an option, and every option has a label', (_name, options, keys) => {
    expect(options.map((option) => option.key)).toEqual([...keys]);

    for (const option of options) {
      expect(option.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('never labels a bowel pattern with an IBS subtype', () => {
    // Spec §26: this answer must not categorise the user.
    const labels = BOWEL_PATTERNS.map((pattern) => pattern.label).join(' ');
    expect(labels).not.toMatch(/IBS/i);
    expect(labels).not.toMatch(/\bIBS-[CDM]\b/i);
  });
});

describe('custom factors', () => {
  it('slugifies the user words into a stable key', () => {
    expect(customFactorKey('Kefir')).toBe('custom:kefir');
    expect(customFactorKey('  Fizzy   Drinks!  ')).toBe('custom:fizzy-drinks');
    expect(customFactorKey('Café au lait')).toBe('custom:caf-au-lait');
  });

  it('produces the same key regardless of casing or spacing', () => {
    expect(customFactorKey('oat milk')).toBe(customFactorKey('  OAT   MILK '));
  });

  it('marks custom keys so the database constraint can require a label', () => {
    expect(isCustomFactorKey(customFactorKey('kimchi'))).toBe(true);
    expect(isCustomFactorKey('coffee')).toBe(false);
    expect(customFactorKey('kimchi').startsWith(CUSTOM_FACTOR_PREFIX)).toBe(true);
  });

  it('stays within the 64-character column limit even for long input', () => {
    const key = customFactorKey('a'.repeat(200));
    expect(key.length).toBeLessThanOrEqual(64);
  });
});

/**
 * The same drift risk, for the first event table. `symptom_logs` is written offline and synced
 * later, so a key the database rejects would not surface at log time — it would surface as a
 * log that silently never leaves the device.
 */
describe('symptom log vocabulary parity', () => {
  const symptomLogsSql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260824140000_symptom_logs.sql'),
    'utf8'
  );

  it('accepts exactly the symptoms the app can produce', () => {
    expect([...SYMPTOM_KEYS].sort()).toEqual(
      constraintValues('symptom_type', symptomLogsSql).sort()
    );
  });

  it('accepts exactly the sources the app can produce', () => {
    expect([...LOG_SOURCES].sort()).toEqual(constraintValues('source', symptomLogsSql).sort());
  });

  it('uses the same symptom vocabulary as the onboarding preference table', () => {
    // The user picks what to track in onboarding and logs from that same list. If these two
    // constraints ever diverged, a symptom could be trackable but not loggable.
    expect(constraintValues('symptom_type', symptomLogsSql).sort()).toEqual(
      constraintValues('symptom_type').sort()
    );
  });
});
