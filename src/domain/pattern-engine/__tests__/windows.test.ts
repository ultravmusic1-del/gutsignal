import {
  DEFAULT_WINDOW,
  OBSERVATION_WINDOWS,
  OBSERVATION_WINDOW_KEYS,
  isWithinWindow,
  windowForGap,
  windowLabel,
} from '../windows';

const EXPOSED = '2026-08-24T12:00:00.000Z';

/** `EXPOSED` plus `hours`, as an ISO instant. */
const after = (hours: number) => new Date(Date.parse(EXPOSED) + hours * 3_600_000).toISOString();

describe('the window set', () => {
  it('tiles without gaps or overlaps', () => {
    // Adjacent half-open windows must meet exactly. A gap loses outcomes silently; an overlap
    // counts one outcome twice for the same exposure.
    const ordered = OBSERVATION_WINDOW_KEYS.map((key) => OBSERVATION_WINDOWS[key]).sort(
      (left, right) => left.fromHours - right.fromHours
    );

    expect(ordered[0]?.fromHours).toBe(0);

    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]?.fromHours).toBe(ordered[i - 1]?.toHours);
    }
  });

  it('gives every window a forward-going span', () => {
    for (const key of OBSERVATION_WINDOW_KEYS) {
      const window = OBSERVATION_WINDOWS[key];
      expect(window.toHours).toBeGreaterThan(window.fromHours);
    }
  });

  it('describes windows without implying a mechanism', () => {
    // Spec §56: these are analysis windows, not validated causal latencies. No label may
    // suggest the food did something.
    const labels = OBSERVATION_WINDOW_KEYS.map(windowLabel).join(' ').toLowerCase();

    for (const word of ['cause', 'caused', 'trigger', 'reaction', 'because', 'due to']) {
      expect(labels).not.toContain(word);
    }
  });

  it('has a default that exists', () => {
    expect(OBSERVATION_WINDOWS[DEFAULT_WINDOW]).toBeDefined();
  });
});

describe('isWithinWindow', () => {
  const shortly = OBSERVATION_WINDOWS.shortly_after;

  it('includes an outcome at the exact opening instant', () => {
    expect(isWithinWindow(EXPOSED, after(0), shortly)).toBe(true);
  });

  it('includes an outcome inside the window', () => {
    expect(isWithinWindow(EXPOSED, after(2), shortly)).toBe(true);
  });

  it('excludes an outcome at the exact closing instant, which belongs to the next window', () => {
    expect(isWithinWindow(EXPOSED, after(4), shortly)).toBe(false);
    expect(isWithinWindow(EXPOSED, after(4), OBSERVATION_WINDOWS.later_same_day)).toBe(true);
  });

  it('excludes an outcome before the exposure', () => {
    // Something that happened first cannot be an outcome of what came after it.
    expect(isWithinWindow(EXPOSED, after(-1), shortly)).toBe(false);
  });

  it('excludes an outcome far beyond the window', () => {
    expect(isWithinWindow(EXPOSED, after(30), shortly)).toBe(false);
  });

  it('treats an unparseable instant as outside rather than guessing', () => {
    expect(isWithinWindow('nonsense', after(1), shortly)).toBe(false);
    expect(isWithinWindow(EXPOSED, 'nonsense', shortly)).toBe(false);
  });

  it('works across a daylight-saving change, because it compares instants', () => {
    // Europe/London springs forward at 01:00 UTC on 2026-03-29. Two instants three hours apart
    // are three hours apart regardless of what the local clocks did in between.
    const before = '2026-03-29T00:00:00.000Z';
    const later = '2026-03-29T03:00:00.000Z';

    expect(isWithinWindow(before, later, OBSERVATION_WINDOWS.shortly_after)).toBe(true);
  });
});

describe('windowForGap', () => {
  it('places a gap in the right window', () => {
    expect(windowForGap(0)).toBe('shortly_after');
    expect(windowForGap(3.9)).toBe('shortly_after');
    expect(windowForGap(4)).toBe('later_same_day');
    expect(windowForGap(11.9)).toBe('later_same_day');
    expect(windowForGap(12)).toBe('next_morning');
    expect(windowForGap(24)).toBe('next_day');
    expect(windowForGap(47.9)).toBe('next_day');
  });

  it('returns nothing for a gap outside every window', () => {
    expect(windowForGap(48)).toBeNull();
    expect(windowForGap(-1)).toBeNull();
  });
});
