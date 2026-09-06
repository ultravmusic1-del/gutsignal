/**
 * Handing a diary to the share sheet (spec §98).
 *
 * `buildDiaryExport` decides what the files contain and is pure. This is the ordering around it,
 * kept separate and behind injected ports because the interesting parts — what happens when the
 * device cannot share, and what a failure is allowed to say — are exactly the parts that are
 * awkward to produce on a real phone.
 *
 * **One file at a time, by design.** The export is six files: the complete JSON record and five
 * per-table CSVs. iOS shares one URL, so rather than inventing a zip dependency the user picks
 * which file they want. That keeps the CSVs useful instead of unreachable, and keeps the default
 * — everything, as JSON — a single tap.
 */

import type { ExportFile } from '@/domain/export/exportDiary';

export type ExportChoice = {
  /** The file name, which is also its identity. */
  id: string;
  /** What the user reads on the chip. */
  label: string;
};

/**
 * Labels for the files `buildDiaryExport` produces.
 *
 * Looked up rather than derived where the derived answer would read badly: "Gutsignal diary" is a
 * worse description of the complete record than "Everything". Anything not listed falls back to a
 * humanised file name, so a file added to the export later shows up as a readable chip rather than
 * as nothing at all.
 */
const LABELS: Record<string, string> = {
  'gutsignal-diary.json': 'Everything (JSON)',
  'gutsignal-meals.csv': 'Meals',
  'gutsignal-symptoms.csv': 'Symptoms',
  'gutsignal-bowel-movements.csv': 'Bowel movements',
  'gutsignal-good-days.csv': 'Good days',
  'gutsignal-context.csv': 'Sleep, stress & exercise',
};

function humanise(fileName: string): string {
  const stem = fileName.replace(/^gutsignal-/, '').replace(/\.[^.]+$/, '');
  const words = stem.split('-').join(' ');

  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

export function exportChoices(files: ExportFile[]): ExportChoice[] {
  return files.map((file) => ({ id: file.name, label: LABELS[file.name] ?? humanise(file.name) }));
}

export type ExportPorts = {
  /** Reads the diary and renders it. Everything this touches is the user's own local data. */
  buildFiles: () => Promise<ExportFile[]>;
  /** Whether this device can hand a file to anything at all. */
  canShare: () => Promise<boolean>;
  /** Writes one file and returns a URI for it. */
  writeFile: (name: string, content: string) => Promise<string>;
  share: (uri: string) => Promise<void>;
};

export type ExportFailureReason =
  | 'nothing_to_export'
  | 'unknown_file'
  | 'sharing_unavailable'
  | 'failed';

export type ExportResult =
  | { ok: true }
  | { ok: false; reason: ExportFailureReason; message: string };

/**
 * Messages are written for the person holding the phone, and say what to do rather than what went
 * wrong internally. None of them may quote the file: an error carrying "Bloating after pizza" is
 * the §30 defect in a smaller costume.
 */
const MESSAGES: Record<ExportFailureReason, string> = {
  nothing_to_export: 'There is nothing to export yet. Log something first and it will appear here.',
  unknown_file: 'That file is no longer part of the export. Choose another and try again.',
  sharing_unavailable:
    'This device cannot share files, so there is nowhere to send the export. Nothing has been saved.',
  failed: 'The export could not be finished. Your entries are safe on this device — nothing was lost.',
};

const failure = (reason: ExportFailureReason): ExportResult => ({
  ok: false,
  reason,
  message: MESSAGES[reason],
});

export async function runDiaryExport(
  ports: ExportPorts,
  fileName: string
): Promise<ExportResult> {
  try {
    const files = await ports.buildFiles();

    if (files.length === 0) return failure('nothing_to_export');

    const chosen = files.find((file) => file.name === fileName);
    if (chosen === undefined) return failure('unknown_file');

    // Checked before anything is written. A file the device cannot then hand anywhere is a copy of
    // someone's health diary left in app storage for no reason, and an export that failed should
    // leave nothing behind (§28).
    if (!(await ports.canShare())) return failure('sharing_unavailable');

    const uri = await ports.writeFile(chosen.name, chosen.content);
    await ports.share(uri);

    return { ok: true };
  } catch {
    // Deliberately swallowed rather than re-thrown or reported. The thrown message can carry the
    // path, and on some platforms a fragment of what was being written.
    return failure('failed');
  }
}
