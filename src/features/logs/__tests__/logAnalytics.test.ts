import { LOG_ENTRY_KINDS } from '@/domain/logs/entry';
import {
  resetAnalytics,
  setAnalyticsSink,
  type AnalyticsSink,
} from '@/services/analytics/analytics';

import { LOG_COMPLETED_EVENTS, trackLogDeleted, trackLogSaved } from '../logAnalytics';

/**
 * What the logging funnel is allowed to report (`CLAUDE.md` §29).
 *
 * `track` itself is tested in `services/analytics`. What matters here is the mapping: that every
 * log kind has an event, that saving reports whether it was new or a correction, and — the point
 * of the whole exercise — that **nothing about the entry itself is ever attached**.
 */

const captured: { event: string; properties: Record<string, unknown> }[] = [];

const sink: AnalyticsSink = {
  capture: (event, properties) => {
    captured.push({ event, properties });
  },
};

beforeEach(() => {
  captured.length = 0;
  setAnalyticsSink(sink);
});

afterEach(() => resetAnalytics());

describe('reporting a saved entry', () => {
  it.each(LOG_ENTRY_KINDS)('sends an event named after the %s log type', (kind) => {
    expect(trackLogSaved(kind, 'created')).toBe('sent');

    expect(captured).toEqual([{ event: `${kind}_log_completed`, properties: { mode: 'created' } }]);
  });

  it('distinguishes a correction from a new entry', () => {
    trackLogSaved('meal', 'edited');

    expect(captured[0]?.properties).toEqual({ mode: 'edited' });
  });

  // The mapping is a Record over LOG_ENTRY_KINDS, so a sixth log type stops compiling rather than
  // silently going uncounted. This asserts the runtime side of that.
  it('covers every log kind the app has', () => {
    expect(Object.keys(LOG_COMPLETED_EVENTS).sort()).toEqual([...LOG_ENTRY_KINDS].sort());
  });
});

describe('reporting a deletion', () => {
  it.each(LOG_ENTRY_KINDS)('names the kind of the deleted %s entry', (kind) => {
    expect(trackLogDeleted(kind)).toBe('sent');

    expect(captured).toEqual([{ event: 'log_deleted', properties: { kind } }]);
  });
});

describe('what is never attached', () => {
  // The whole point. Every property sent by this module, across every call it can make, checked
  // against §29's list — so a future property cannot slip through by being added to the schema
  // and the caller at the same time.
  it('sends nothing describing what was recorded', () => {
    for (const kind of LOG_ENTRY_KINDS) {
      trackLogSaved(kind, 'created');
      trackLogSaved(kind, 'edited');
      trackLogDeleted(kind);
    }

    const keys = new Set(captured.flatMap((entry) => Object.keys(entry.properties)));
    const values = captured.flatMap((entry) => Object.values(entry.properties).map(String));

    expect([...keys].sort()).toEqual(['kind', 'mode']);

    // `kind` says which log type; it must never say anything about the entry's contents.
    for (const value of values) {
      expect(value).toMatch(/^(created|edited|meal|symptom|bowel|wellbeing|context)$/);
    }
  });

  it('carries no severity, no items and no free text under any call', () => {
    trackLogSaved('symptom', 'created');
    trackLogDeleted('meal');

    const serialised = JSON.stringify(captured);

    for (const forbidden of ['severity', 'bristol', 'items', 'title', 'note', 'urgency']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
