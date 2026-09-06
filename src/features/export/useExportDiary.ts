import { useMutation } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { buildDiaryExport } from '@/domain/export/exportDiary';
import { useAuth } from '@/features/auth/AuthProvider';
import { openDatabase } from '@/services/db/database';
import { loadLogSet } from '@/services/logs/logSetRepository';

import { runDiaryExport, type ExportPorts, type ExportResult } from './exportDiaryFlow';

/**
 * The edge of diary export (spec §98).
 *
 * The ordering and every failure decision live in `exportDiaryFlow.ts`, which is pure and tested.
 * This supplies the four real things it acts on.
 *
 * **Everything, not a window.** The report is about a period; an export is about the record. The
 * range below is deliberately unbounded rather than the 90 days the pattern engine uses — a data
 * export that quietly omitted last year would be the worst kind of wrong, because it looks
 * complete.
 */
const WHOLE_DIARY = { start: '2000-01-01', end: '2999-12-31' };

/**
 * Files are written to the **cache** directory, not documents.
 *
 * An export is a copy of someone's entire health record, and it exists only long enough to reach
 * the share sheet. The cache is reclaimable by the system, so a copy that is never shared does not
 * live on the device indefinitely (§28, data minimisation). Documents would keep it forever.
 */
export function realExportPorts(userId: string | null): ExportPorts {
  return {
    buildFiles: async () => {
      if (userId === null) return [];

      const db = await openDatabase();
      const logs = await loadLogSet(db, { userId, range: WHOLE_DIARY });

      return buildDiaryExport(logs, {
        generatedAt: new Date(),
        userId,
        appVersion: Constants.expoConfig?.version ?? 'unknown',
      });
    },

    canShare: () => Sharing.isAvailableAsync(),

    writeFile: async (name, content) => {
      const file = new File(Paths.cache, name);

      // Overwrite rather than append: exporting twice must produce the diary, not two of it.
      file.create({ overwrite: true });
      file.write(content);

      return file.uri;
    },

    share: async (uri) => {
      await Sharing.shareAsync(uri);
    },
  };
}

export function useExportDiary() {
  const { userId } = useAuth();

  return useMutation<ExportResult, Error, string>({
    mutationFn: (fileName) => runDiaryExport(realExportPorts(userId), fileName),
  });
}
