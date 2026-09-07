import type { StatusTone } from '@/components/ui';
import type { PatternStatus } from '@/domain/patterns/status';

/**
 * What a finding's pill colour marks: **how much evidence there is**, never whether the news
 * is good.
 *
 * A finding is not positive or negative. "Symptoms were recorded more often following dairy" is
 * not bad news any more than its absence is good news, and tinting it red or green would be the
 * app taking a view on someone's health that `CLAUDE.md` §17 forbids it from having.
 *
 * So the accent marks the two statuses that rest on enough evidence to lead with, and everything
 * else is neutral. The word in the pill is what distinguishes them; the colour only groups them.
 *
 * Shared by the finding card and the detail screen, because the pill a user taps and the pill they
 * land on must be the same pill — a status that changed colour between the two would read as a
 * different claim.
 */
export const STATUS_TONE: Record<PatternStatus, StatusTone> = {
  stronger_recurring_signal: 'accent',
  moderate: 'accent',
  emerging: 'neutral',
  no_clear_pattern: 'neutral',
  insufficient_data: 'neutral',
};
