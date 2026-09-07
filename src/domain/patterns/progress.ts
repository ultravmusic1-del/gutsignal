/**
 * What a diary is building toward, before it has enough in it to compare (spec §32, §33).
 *
 * ## The problem this solves
 *
 * The honest state of a new diary is "nothing to show", and GutSignal says so on the Insights
 * screen in careful language. But Today — the screen people actually open — says nothing about it
 * at all, so weeks of logging happen with no visible sense that they are going anywhere. That is
 * the moment most diary apps lose people, and it is lost for the least interesting reason: the app
 * knows exactly how far along the user is and never mentions it.
 *
 * ## What it must never do
 *
 * **Never promise a finding.** §32 is explicit, and it is not a technicality: a progress bar
 * ending in "insight unlocked" would be a promise the engine cannot keep, because a diary with a
 * hundred well-tracked days may genuinely contain nothing related to anything else. So the target
 * is *being able to compare*, never *having something to show*, and the copy says which.
 *
 * **Never scold.** A gap in a diary is usually a bad week, not laziness.
 *
 * The steps mirror `assessReadiness` rather than restating it: this is the same model rendered as
 * progress rather than as a blocker, and it reads the readiness value directly so the two cannot
 * disagree.
 */

import { MINIMUM_USEFUL_DAYS, type InsightsReadiness, type TrackingCounts } from './insights';

export type FirstInsightStepKey = 'days' | 'good_day' | 'hard_day';

export type FirstInsightStep = {
  key: FirstInsightStepKey;
  label: string;
  done: boolean;
  /** The count behind the step, e.g. "5 of 14 days". Never a percentage. */
  detail: string;
};

/** What the user could most usefully do next. Semantic — the screen maps it to a route. */
export type FirstInsightAction = 'log' | 'log_good_day' | 'view_insights';

export type FirstInsightProgress = {
  /** True once the engine has something worth showing. */
  ready: boolean;
  title: string;
  body: string;
  steps: FirstInsightStep[];
  action: FirstInsightAction;
};

export function firstInsightProgress({
  tracking,
  readiness,
}: {
  tracking: TrackingCounts;
  readiness: InsightsReadiness;
}): FirstInsightProgress {
  const { daysLogged, goodDays, symptomDays } = tracking;

  const steps: FirstInsightStep[] = [
    {
      key: 'days',
      label: 'Days with entries',
      done: daysLogged >= MINIMUM_USEFUL_DAYS,
      detail: `${daysLogged} of about ${MINIMUM_USEFUL_DAYS}`,
    },
    {
      key: 'good_day',
      // The single biggest unlock and the least guessable: without a day recorded as fine there
      // is no control group, so nothing can be compared however much else is logged.
      label: 'Days you felt fine',
      done: goodDays > 0,
      detail: goodDays === 0 ? 'none yet' : `${goodDays} recorded`,
    },
    {
      key: 'hard_day',
      label: 'Days with a symptom',
      done: symptomDays > 0,
      detail: symptomDays === 0 ? 'none yet' : `${symptomDays} recorded`,
    },
  ];

  if (readiness.kind === 'ready') {
    return {
      ready: true,
      title: 'There is something to look at',
      body: 'GutSignal has found associations worth showing you in what you have recorded.',
      steps,
      action: 'view_insights',
    };
  }

  return {
    ready: false,
    ...copyFor(readiness, daysLogged),
    steps,
    // A good day is one tap and unblocks comparison outright, so it is the ask whenever it is
    // missing — even when the day count is also short.
    action: goodDays === 0 && symptomDays > 0 ? 'log_good_day' : 'log',
  };
}

/**
 * The heading and sentence for a diary that is still filling up.
 *
 * Deliberately about the diary rather than about the user's health, and deliberately about
 * *comparing* rather than about finding something — see the module comment.
 */
function copyFor(
  readiness: InsightsReadiness,
  daysLogged: number
): { title: string; body: string } {
  switch (readiness.kind) {
    case 'no_logs':
      return {
        title: 'Your diary starts here',
        body: 'GutSignal compares what you record over time. Nothing is needed today except the first entry.',
      };

    case 'needs_good_days':
      return {
        title: 'One tap would unlock comparing',
        body: 'Comparing needs days that went well as well as days that did not. On an ordinary day, tap + and choose "Feeling good".',
      };

    case 'needs_more_days':
      return {
        title: 'Building your diary',
        body: `You have logged on ${daysLogged} ${daysLogged === 1 ? 'day' : 'days'}. Around ${MINIMUM_USEFUL_DAYS} is where comparing starts to mean anything — the ordinary days count as much as the difficult ones.`,
      };

    case 'needs_more_variety':
      return {
        title: 'Building your diary',
        body: 'There is plenty here, but so far everything happens either almost always or almost never, which leaves nothing to weigh against anything else. This usually resolves as the logs cover more ordinary days.',
      };

    case 'looked_and_found_nothing':
      return {
        title: 'Nothing stands out so far',
        body: 'GutSignal has compared what you recorded and found no consistent relationship yet. That is a real result rather than a gap — sometimes there genuinely is not a pattern to find.',
      };

    // Handled by the caller before this is reached; kept total so a new readiness kind is a
    // compile error rather than a blank card.
    case 'ready':
      return { title: '', body: '' };
  }
}
