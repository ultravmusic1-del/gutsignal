import {
  NOTHING_LOGGED,
  quickActions,
  type LoggedToday,
  type QuickActionKey,
} from '../quickActions';

/**
 * Which log Today offers first.
 *
 * The invariant that matters more than any particular order: **every action is always offered.**
 * A tile that disappears because the app decided it was unlikely is one the user has to go
 * looking for, and a diary that is harder to write on an unusual day loses exactly the days worth
 * recording.
 */

const keysAt = (hour: number, loggedToday: LoggedToday = NOTHING_LOGGED): QuickActionKey[] =>
  quickActions({ hour, loggedToday }).map((action) => action.key);

const ALL: QuickActionKey[] = ['meal', 'symptom', 'bowel', 'wellbeing', 'context'];

describe('what is always true, whatever the hour', () => {
  const everyHour = Array.from({ length: 24 }, (_, hour) => hour);

  it.each(everyHour)('offers every action at %i:00', (hour) => {
    expect(keysAt(hour).sort()).toEqual([...ALL].sort());
  });

  it.each(everyHour)('offers each action exactly once at %i:00', (hour) => {
    const keys = keysAt(hour);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('still offers everything when the whole day has already been logged', () => {
    const all: LoggedToday = {
      meal: true,
      symptom: true,
      bowel: true,
      wellbeing: true,
      context: true,
    };

    expect(keysAt(20, all).sort()).toEqual([...ALL].sort());
  });
});

describe('ordering by time of day', () => {
  it('leads with the night just ended in the morning', () => {
    expect(keysAt(7)[0]).toBe('bowel');
  });

  it('leads with meals through the middle of the day', () => {
    expect(keysAt(13)[0]).toBe('meal');
  });

  /**
   * A wellbeing entry summarises a day, so it means something once the day has largely happened.
   * Offering it first thing in the morning asks someone to rate a day they have not had.
   */
  it('leads with feeling good in the evening', () => {
    expect(keysAt(20)[0]).toBe('wellbeing');
  });

  it('never leads with context, which is the rarest thing to record', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(keysAt(hour)[0]).not.toBe('context');
    }
  });
});

describe('what today already holds', () => {
  /**
   * "Feeling good" is once a day by nature. Once it is recorded it stops competing for the top
   * slot — but it is still offered, because a day can be re-recorded after an edit or a deletion.
   */
  it('drops feeling good down the list once it has been logged today', () => {
    const evening = keysAt(20);
    const afterLogging = keysAt(20, { ...NOTHING_LOGGED, wellbeing: true });

    expect(evening[0]).toBe('wellbeing');
    expect(afterLogging[0]).not.toBe('wellbeing');
    expect(afterLogging).toContain('wellbeing');
  });

  it('drops it far enough to matter rather than swapping it with its neighbour', () => {
    const afterLogging = keysAt(20, { ...NOTHING_LOGGED, wellbeing: true });

    expect(afterLogging.indexOf('wellbeing')).toBe(afterLogging.length - 1);
  });

  /**
   * Nobody eats once. A logged meal must not suppress the next one, which is the obvious
   * over-generalisation of the wellbeing rule.
   */
  it('leaves meals where they are however many have been logged', () => {
    expect(keysAt(13, { ...NOTHING_LOGGED, meal: true })).toEqual(keysAt(13));
  });

  it('leaves symptoms and bowel entries where they are too', () => {
    expect(keysAt(13, { ...NOTHING_LOGGED, symptom: true, bowel: true })).toEqual(keysAt(13));
  });
});

describe('the actions themselves', () => {
  // §44: feeling good is one tap, because it is the engine's control group and every extra step
  // shrinks it.
  it('marks feeling good as saving immediately and nothing else', () => {
    const immediate = quickActions({ hour: 20 })
      .filter((action) => action.immediate)
      .map((action) => action.key);

    expect(immediate).toEqual(['wellbeing']);
  });

  it('gives every action a label', () => {
    for (const action of quickActions({ hour: 9 })) {
      expect(action.label.length).toBeGreaterThan(0);
    }
  });
});
