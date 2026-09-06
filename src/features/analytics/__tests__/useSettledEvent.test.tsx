import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import {
  resetAnalytics,
  setAnalyticsSink,
  type AnalyticsSink,
} from '@/services/analytics/analytics';

import { SETTLE_DELAY_MS, useSettledEvent } from '../useSettledEvent';

/**
 * Reporting a search without counting keystrokes.
 *
 * Typing "bloating" fires eight change events. Reporting each one would turn `timeline_searched`
 * into a measure of word length, which is the failure this hook exists to prevent — and the kind
 * that looks fine on a dashboard.
 */

const captured: { event: string; properties: Record<string, unknown> }[] = [];

const sink: AnalyticsSink = {
  capture: (event, properties) => captured.push({ event, properties }),
};

beforeEach(() => {
  jest.useFakeTimers();
  captured.length = 0;
  setAnalyticsSink(sink);
});

afterEach(() => {
  resetAnalytics();
  jest.useRealTimers();
});

/** A search box, driven one character at a time. */
function Harness({ letters }: { letters: string[] }) {
  const [value, setValue] = useState('');
  useSettledEvent('timeline_searched', value);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="type"
      onPress={() => setValue((current) => current + (letters[current.length] ?? ''))}
    >
      <Text>{value}</Text>
    </Pressable>
  );
}

/** A box whose value a test sets outright, for clearing and returning. */
function Controlled({ steps }: { steps: string[] }) {
  const [index, setIndex] = useState(0);
  useSettledEvent('timeline_searched', steps[index] ?? '');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="next"
      onPress={() => setIndex((current) => current + 1)}
    >
      <Text>step {index}</Text>
    </Pressable>
  );
}

const press = async (view: { getByLabelText: (name: string) => unknown }, label: string) => {
  await act(async () => {
    fireEvent.press(view.getByLabelText(label) as Parameters<typeof fireEvent.press>[0]);
  });
};

const settle = async (ms = SETTLE_DELAY_MS) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe('waiting for the typing to stop', () => {
  it('reports nothing while a word is still being typed', async () => {
    const view = await render(<Harness letters={['b', 'l', 'o', 'a', 't']} />);

    for (let i = 0; i < 5; i += 1) {
      await press(view, 'type');
      await settle(SETTLE_DELAY_MS - 100);
    }

    expect(captured).toEqual([]);
  });

  it('reports once when the value holds still', async () => {
    const view = await render(<Harness letters={['b', 'l', 'o']} />);

    await press(view, 'type');
    await press(view, 'type');
    await press(view, 'type');
    await settle();

    expect(captured).toEqual([{ event: 'timeline_searched', properties: {} }]);
  });

  it('does not report the same settled value twice', async () => {
    const view = await render(<Controlled steps={['tea', 'tea', 'tea']} />);

    await settle();
    await press(view, 'next');
    await settle();
    await press(view, 'next');
    await settle();

    expect(captured).toHaveLength(1);
  });

  it('reports a genuinely different search', async () => {
    const view = await render(<Controlled steps={['tea', 'coffee']} />);

    await settle();
    await press(view, 'next');
    await settle();

    expect(captured).toHaveLength(2);
  });
});

describe('what is not a search', () => {
  // Clearing the box is how someone gets their whole diary back. Counting it would inflate the
  // number with the opposite of a search.
  it('ignores an empty box', async () => {
    await render(<Controlled steps={['']} />);

    await settle();

    expect(captured).toEqual([]);
  });

  it('ignores whitespace', async () => {
    await render(<Controlled steps={['   ']} />);

    await settle();

    expect(captured).toEqual([]);
  });

  it('does not report a search abandoned before it settled', async () => {
    const view = await render(<Controlled steps={['tea', '']} />);

    await settle(SETTLE_DELAY_MS - 100);
    await press(view, 'next');
    await settle();

    expect(captured).toEqual([]);
  });
});

describe('what is never sent', () => {
  // The event is declared property-free because a search string is free text a person typed about
  // their own health (§29). The value decides *when* to report and nothing more.
  it('sends no properties at all, whatever was typed', async () => {
    await render(<Controlled steps={['bloating after dairy']} />);

    await settle();

    expect(captured).toEqual([{ event: 'timeline_searched', properties: {} }]);
    expect(JSON.stringify(captured)).not.toContain('dairy');
  });
});
