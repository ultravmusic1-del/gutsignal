import { useMutation } from '@tanstack/react-query';
import * as Print from 'expo-print';

import type { DateRange } from '@/domain/pattern-engine/observations';
import { analyse } from '@/domain/pattern-engine/engine';
import { buildAppointmentReport } from '@/domain/reports/appointmentReport';
import { renderReportHtml } from '@/domain/reports/reportHtml';
import { useAuth } from '@/features/auth/AuthProvider';
import { todayLocalDate } from '@/features/logs/useSymptomLogs';
import { openDatabase } from '@/services/db/database';
import { defaultAnalysisRange, loadLogSet } from '@/services/logs/logSetRepository';

/**
 * Building an appointment report and handing it to the system print sheet.
 *
 * Everything interesting already happened elsewhere: `buildAppointmentReport` decided what may be
 * said and `renderReportHtml` decided how it looks, both pure and tested. This is the edge — read
 * the diary, run the engine, print.
 *
 * **A closed print window is not a failure.** On iOS `printAsync` rejects when the user dismisses
 * the sheet without printing, which is indistinguishable from a genuine print failure and is by far
 * the more common of the two. Treating it as an error would put a red box in front of someone who
 * simply changed their mind, so the two are separated here: anything that goes wrong *before* the
 * sheet opens is a real error worth reporting, and anything after it is the user's business.
 */

export const REPORT_PERIOD_DAYS = [30, 90] as const;
export type ReportPeriodDays = (typeof REPORT_PERIOD_DAYS)[number];

export type CreateReportOutcome = 'printed' | 'dismissed';

export function reportRangeFor(days: ReportPeriodDays, today = todayLocalDate()): DateRange {
  return defaultAnalysisRange(today, days);
}

export function useCreateReport() {
  const { userId } = useAuth();

  return useMutation<CreateReportOutcome, Error, ReportPeriodDays>({
    mutationFn: async (days) => {
      if (userId === null) throw new Error('Not signed in.');

      const range = reportRangeFor(days);
      const db = await openDatabase();
      const logs = await loadLogSet(db, { userId, range });

      const report = buildAppointmentReport({
        logs,
        findings: analyse({ logs, range }),
        range,
        generatedAt: new Date(),
      });

      const html = renderReportHtml(report);

      try {
        await Print.printAsync({ html });
        return 'printed';
      } catch {
        // The sheet was closed. Nothing was lost, nothing needs saying, and the user already knows
        // what they did — see the note above on why this cannot be told apart from a real failure.
        return 'dismissed';
      }
    },
  });
}
