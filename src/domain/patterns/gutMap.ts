/**
 * The Gut Map — the whole landscape, not the highlights (spec §52).
 *
 * "What stands out" answers *what should I look at?*. This answers *what about dairy?* — the
 * question a user actually arrives with, and the one a highlights list structurally cannot
 * answer, because a factor that came to nothing never appears in it. Showing the negatives is
 * the point: "we looked at dairy and found nothing consistent" is a result the user earned by
 * logging, and withholding it makes the app look like it only ever finds problems.
 *
 * **The engine works in comparisons, not factors.** Dairy against bloating shortly after is a
 * different `Finding` from dairy against urgency the next day, so one factor routinely produces a
 * dozen findings. Collapsing them to one row each is the whole job of this module, and getting it
 * wrong would let a factor appear twice under contradictory headings.
 *
 * Spec §52 ends with a warning worth repeating: **do not make this look like diagnosis output.**
 * That constrains the presentation (no traffic lights, no scores, no risk language) as much as
 * the copy, and §36 rules out colour as the only signal regardless.
 */

import { encodeFindingId } from '@/domain/patterns/findingDetail';
import type { Factor, Finding } from '@/domain/pattern-engine/types';

import { PATTERN_STATUS_COPY, type PatternStatus } from './status';

export type GutMapGroupKey = 'stronger' | 'investigating' | 'no_pattern' | 'not_enough';

type GutMapGroupSeed = {
  key: GutMapGroupKey;
  title: string;
  /** Statuses filed under this heading. Every status belongs to exactly one group. */
  statuses: PatternStatus[];
  /**
   * The status whose copy describes the group.
   *
   * Descriptions are read from `PATTERN_STATUS_COPY` rather than written again here, so the map
   * cannot drift from the language the detail page and the Insights explainer already use. There
   * is one place safety copy lives (§17), and this is not it.
   */
  representativeStatus: PatternStatus;
};

/**
 * The four groups, in the order spec §52 lists them.
 *
 * `moderate` and `stronger_recurring_signal` share a heading deliberately. Both are substantiated
 * findings a user can act on, and splitting them would draw a line between "quite sure" and "more
 * sure" that the underlying confidence composite is far too coarse to justify.
 */
const GUT_MAP_GROUP_SEEDS: GutMapGroupSeed[] = [
  {
    key: 'stronger',
    title: 'Stronger signals',
    statuses: ['stronger_recurring_signal', 'moderate'],
    representativeStatus: 'stronger_recurring_signal',
  },
  {
    key: 'investigating',
    title: 'Worth investigating',
    statuses: ['emerging'],
    representativeStatus: 'emerging',
  },
  {
    key: 'no_pattern',
    title: 'No clear pattern',
    statuses: ['no_clear_pattern'],
    representativeStatus: 'no_clear_pattern',
  },
  {
    key: 'not_enough',
    title: 'Not enough data yet',
    statuses: ['insufficient_data'],
    representativeStatus: 'insufficient_data',
  },
];

export type GutMapGroupDefinition = GutMapGroupSeed & {
  /** Read from the one place status language lives, never written again here. */
  description: string;
};

export const GUT_MAP_GROUPS: GutMapGroupDefinition[] = GUT_MAP_GROUP_SEEDS.map((seed) => ({
  ...seed,
  description: PATTERN_STATUS_COPY[seed.representativeStatus].description,
}));

/**
 * How much a status is worth saying, strongest first.
 *
 * The one non-obvious ordering is the bottom pair. `no_clear_pattern` outranks
 * `insufficient_data` because "we looked and found nothing" is a real answer, while "we could not
 * look" is the absence of one — and a factor that has both should be reported as answered.
 */
const STATUS_RANK: Record<PatternStatus, number> = {
  stronger_recurring_signal: 0,
  moderate: 1,
  emerging: 2,
  no_clear_pattern: 3,
  insufficient_data: 4,
};

const GROUP_FOR_STATUS = new Map<PatternStatus, GutMapGroupKey>(
  GUT_MAP_GROUPS.flatMap((group) => group.statuses.map((status) => [status, group.key] as const))
);

export type GutMapEntry = {
  factor: Factor;
  /** The strongest status any comparison of this factor reached. */
  status: PatternStatus;
  /** The comparison that earned the row its place, and what tapping it opens. */
  finding: Finding;
  /** How many comparisons this factor produced in total, across outcomes and windows. */
  findingCount: number;
};

export type GutMapGroup = GutMapGroupDefinition & {
  entries: GutMapEntry[];
};

/**
 * Which of a factor's findings speaks for it.
 *
 * Strongest status wins; then the best-supported comparison; then the largest difference. The
 * final fallback on id is not decoration — without a total order the same diary could render two
 * different screens, and reproducibility is a pattern-engine requirement (`CLAUDE.md` §18), not
 * an engine-only one.
 */
function betterOf(a: Finding, b: Finding): Finding {
  const byRank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byRank !== 0) return byRank < 0 ? a : b;

  if (a.confidence !== b.confidence) return a.confidence > b.confidence ? a : b;

  const difference =
    Math.abs(b.metrics.absoluteDifference) - Math.abs(a.metrics.absoluteDifference);
  if (difference !== 0) return difference < 0 ? a : b;

  return encodeFindingId(a) <= encodeFindingId(b) ? a : b;
}

/**
 * The landscape, grouped.
 *
 * Empty groups are dropped rather than returned, so a screen cannot render a heading with nothing
 * under it — that is a placeholder, and `CLAUDE.md` §57 rules those out. It means the map grows
 * one heading at a time as a diary fills in, which is also the honest shape for it to have.
 */
export function buildGutMap(findings: Finding[]): GutMapGroup[] {
  const best = new Map<string, { finding: Finding; count: number }>();

  for (const finding of findings) {
    const existing = best.get(finding.factor.key);

    if (existing === undefined) {
      best.set(finding.factor.key, { finding, count: 1 });
      continue;
    }

    best.set(finding.factor.key, {
      finding: betterOf(existing.finding, finding),
      count: existing.count + 1,
    });
  }

  const entries: GutMapEntry[] = [...best.values()].map(({ finding, count }) => ({
    factor: finding.factor,
    status: finding.status,
    finding,
    findingCount: count,
  }));

  return GUT_MAP_GROUPS.map((group) => ({
    ...group,
    entries: entries
      .filter((entry) => GROUP_FOR_STATUS.get(entry.status) === group.key)
      // Best-supported first, and totally ordered for the same reason `betterOf` is.
      .sort((a, b) => {
        if (a.finding.confidence !== b.finding.confidence) {
          return b.finding.confidence - a.finding.confidence;
        }

        const difference =
          Math.abs(b.finding.metrics.absoluteDifference) -
          Math.abs(a.finding.metrics.absoluteDifference);
        if (difference !== 0) return difference;

        return a.factor.label.localeCompare(b.factor.label);
      }),
  })).filter((group) => group.entries.length > 0);
}
