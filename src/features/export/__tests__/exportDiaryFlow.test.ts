import type { ExportFile } from '@/domain/export/exportDiary';

import {
  exportChoices,
  runDiaryExport,
  type ExportPorts,
} from '../exportDiaryFlow';

/**
 * Handing a diary to the share sheet (spec §98).
 *
 * `buildDiaryExport` already decides what the files contain and is tested where it lives. What is
 * tested here is the part that touches the device: the order things happen in, and what the user
 * is told when one of them cannot.
 */

const FILES: ExportFile[] = [
  { name: 'gutsignal-diary.json', content: '{"logs":[]}' },
  { name: 'gutsignal-meals.csv', content: 'a,b\n1,2\n' },
  { name: 'gutsignal-symptoms.csv', content: 'a,b\n3,4\n' },
];

function ports(overrides: Partial<ExportPorts> = {}) {
  const calls: string[] = [];

  const base: ExportPorts = {
    buildFiles: async () => {
      calls.push('build');
      return FILES;
    },
    canShare: async () => {
      calls.push('canShare');
      return true;
    },
    writeFile: async (name) => {
      calls.push(`write:${name}`);
      return `file:///tmp/${name}`;
    },
    share: async (uri) => {
      calls.push(`share:${uri}`);
    },
  };

  return { calls, ports: { ...base, ...overrides } };
}

describe('choosing what to export', () => {
  it('offers every file the diary export produced', () => {
    expect(exportChoices(FILES).map((choice) => choice.id)).toEqual([
      'gutsignal-diary.json',
      'gutsignal-meals.csv',
      'gutsignal-symptoms.csv',
    ]);
  });

  it('labels the complete record as the whole thing, not as a file name', () => {
    expect(exportChoices(FILES)[0]!.label).toMatch(/everything/i);
  });

  // A file added to buildDiaryExport later must not appear as an unlabelled chip.
  it('falls back to a readable label for a file it has never seen', () => {
    const [choice] = exportChoices([{ name: 'gutsignal-sleep-notes.csv', content: '' }]);

    expect(choice!.label).toBe('Sleep notes');
  });
});

describe('running an export', () => {
  it('checks sharing, writes the chosen file, then shares it', async () => {
    const { calls, ports: p } = ports();

    const result = await runDiaryExport(p, 'gutsignal-meals.csv');

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      'build',
      'canShare',
      'write:gutsignal-meals.csv',
      'share:file:///tmp/gutsignal-meals.csv',
    ]);
  });

  /**
   * Availability is checked *before* anything is written. Writing a file the device cannot then
   * hand anywhere leaves a copy of someone's health diary sitting in app storage for no reason —
   * the export failed, so it should leave nothing behind (§28, data minimisation).
   */
  it('writes nothing when the device cannot share', async () => {
    const { calls, ports: p } = ports({
      canShare: async () => {
        calls.push('canShare');
        return false;
      },
    });

    const result = await runDiaryExport(p, 'gutsignal-diary.json');

    expect(result.ok).toBe(false);
    expect(calls).toEqual(['build', 'canShare']);
    expect(calls.some((call) => call.startsWith('write:'))).toBe(false);
  });

  it('says there is nothing to export rather than sharing an empty file', async () => {
    const { calls, ports: p } = ports({
      buildFiles: async () => {
        calls.push('build');
        return [];
      },
    });

    const result = await runDiaryExport(p, 'gutsignal-diary.json');

    expect(result).toMatchObject({ ok: false, reason: 'nothing_to_export' });
    expect(calls).toEqual(['build']);
  });

  it('refuses a file the export did not produce', async () => {
    const { ports: p } = ports();

    await expect(runDiaryExport(p, 'not-a-file.csv')).resolves.toMatchObject({
      ok: false,
      reason: 'unknown_file',
    });
  });

  // §30: a failure names the operation, never the diary. The message a user sees must not carry
  // any part of what was being exported.
  it('reports a write failure without quoting anything from the file', async () => {
    const { ports: p } = ports({
      writeFile: async () => {
        throw new Error('ENOSPC: no space left, writing "Bloating after pizza"');
      },
    });

    const result = await runDiaryExport(p, 'gutsignal-diary.json');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/bloating|pizza|ENOSPC/i);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('reports a failure to open the share sheet the same way', async () => {
    const { ports: p } = ports({
      share: async () => {
        throw new Error('user cancelled');
      },
    });

    await expect(runDiaryExport(p, 'gutsignal-diary.json')).resolves.toMatchObject({
      ok: false,
      reason: 'failed',
    });
  });
});
