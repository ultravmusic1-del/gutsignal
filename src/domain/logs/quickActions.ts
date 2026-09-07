/**
 * Which log to offer first, and when (spec §33, §35).
 *
 * ## Why order rather than filter
 *
 * The floating + reaches every log type in two taps and always will. This is about the *first*
 * tap: on Today, the most likely entry should be one tap away rather than two.
 *
 * So this reorders and never removes. A tile that disappears because the app decided it was
 * unlikely is a tile the user has to go looking for, and a diary that is harder to write on an
 * unusual day is a diary that loses exactly the days worth recording.
 *
 * ## What "likely" is based on
 *
 * The clock, and what today already holds. Both are weak signals used weakly:
 *
 * - **Time of day.** Meals cluster at meal times; a wellbeing entry is a summary of a day and
 *   makes most sense once the day has largely happened.
 * - **Already logged.** "Feeling good" is once a day by nature, so once it is recorded it stops
 *   competing for the top slot. A meal is not — nobody eats once.
 *
 * No personalisation and no learned model. A diary that reorders its own buttons based on habit
 * would make the muscle memory people build over months unreliable, which costs more than it
 * saves. If this ever becomes cleverer it needs evidence, not intuition.
 */

export type QuickActionKey = 'meal' | 'symptom' | 'bowel' | 'wellbeing' | 'context';

export type QuickAction = {
  key: QuickActionKey;
  label: string;
  /** Saves immediately rather than opening a screen (spec §44). */
  immediate: boolean;
};

const ACTIONS: Record<QuickActionKey, QuickAction> = {
  meal: { key: 'meal', label: 'Meal', immediate: false },
  symptom: { key: 'symptom', label: 'Symptom', immediate: false },
  bowel: { key: 'bowel', label: 'Bowel', immediate: false },
  wellbeing: { key: 'wellbeing', label: 'Feeling good', immediate: true },
  context: { key: 'context', label: 'Context', immediate: false },
};

/** What today already contains, by kind. Only presence matters, not how many. */
export type LoggedToday = Record<QuickActionKey, boolean>;

export const NOTHING_LOGGED: LoggedToday = {
  meal: false,
  symptom: false,
  bowel: false,
  wellbeing: false,
  context: false,
};

/**
 * Roughly when someone is likely to be recording each kind of thing.
 *
 * Deliberately coarse. Three windows, no minutes, and the boundaries are round numbers rather than
 * derived from anything — this decides button order, and pretending to more precision than that
 * would be false comfort.
 */
function timeOfDayRank(hour: number): QuickActionKey[] {
  // Morning: the night's bowel movement and breakfast.
  if (hour < 11) return ['bowel', 'meal', 'symptom', 'wellbeing', 'context'];

  // Through the day: meals, and symptoms as they happen.
  if (hour < 18) return ['meal', 'symptom', 'bowel', 'wellbeing', 'context'];

  // Evening: the day can be summarised now, which is when a wellbeing entry means something.
  return ['wellbeing', 'symptom', 'meal', 'bowel', 'context'];
}

/**
 * Every action, most likely first.
 *
 * Always returns all five, in a total order — see the module comment on why nothing is filtered.
 */
export function quickActions({
  hour,
  loggedToday = NOTHING_LOGGED,
}: {
  hour: number;
  loggedToday?: LoggedToday;
}): QuickAction[] {
  const ranked = timeOfDayRank(hour);

  return ranked
    .map((key, index) => ({
      action: ACTIONS[key],
      // A once-a-day entry that has been made today drops behind everything that has not. The
      // penalty is larger than the list so it cannot merely swap two neighbours.
      score: index + (key === 'wellbeing' && loggedToday.wellbeing ? ranked.length : 0),
    }))
    .sort((left, right) => left.score - right.score)
    .map((entry) => entry.action);
}
