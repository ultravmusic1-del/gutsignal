import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import {
  resetAnalytics,
  setAnalyticsSink,
  type AnalyticsSink,
} from '@/services/analytics/analytics';

import { useScreenView } from '../useScreenView';

/**
 * The two ways a screen-view event is normally got wrong.
 *
 * Counting re-renders instead of people, and counting a return visit as nothing because the
 * screen never unmounted. Both produce a number that looks plausible on a dashboard and means
 * something else entirely, so both are pinned here.
 *
 * Everything is driven through presses on a harness rather than `rerender`, which overlaps act()
 * calls in this version of the testing library and silently swallows the effects under test.
 *
 * Every press is wrapped in `act`. Without it `fireEvent.press` runs the handler but its state
 * update is never committed — which makes assertions that were already true pass, and everything
 * else fail for a reason that looks nothing like the cause.
 */

const captured: { event: string; properties: Record<string, unknown> }[] = [];

const sink: AnalyticsSink = {
  capture: (event, properties) => captured.push({ event, properties }),
};

/**
 * A controllable stand-in for navigation focus.
 *
 * `useFocusEffect` is React Navigation's, so mocking it lets these tests drive focus directly
 * rather than mounting a navigator to simulate a tab change. `version` is part of the effect's
 * dependencies so a test can make focus actually change, cleanup and all.
 *
 * The `mock` prefix is required: Jest hoists `jest.mock` factories above every other statement and
 * only lets them close over names it can recognise as test doubles.
 */
const mockFocus = { current: true, version: 0 };

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- inside a hoisted factory.
    const { useEffect } = require('react') as typeof import('react');

    useEffect(() => {
      if (!mockFocus.current) return;

      const cleanup = callback();
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the focus trigger.
    }, [callback, mockFocus.version]);
  },
}));

beforeEach(() => {
  captured.length = 0;
  mockFocus.current = true;
  mockFocus.version = 0;
  setAnalyticsSink(sink);
});

afterEach(() => resetAnalytics());

type Props = { state: 'empty' | 'populated' } | null;

/**
 * One screen, plus the two controls a test needs: advance the data, and change focus.
 *
 * Both go through state so React commits them the way it would in the app.
 */
function Harness({ initial, next }: { initial: Props; next?: Props }) {
  const [properties, setProperties] = useState<Props>(initial);
  const [, setTick] = useState(0);

  useScreenView('insights_viewed', properties);

  // Pressable rather than Text: fireEvent.press does not reach a Text's onPress in this setup,
  // and a control that silently never fires makes a test pass for the wrong reason.
  const control = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <Text>{label}</Text>
    </Pressable>
  );

  return (
    <>
      {control('advance', () => setProperties(next ?? initial))}
      {control('rerender', () => setTick((tick) => tick + 1))}
    </>
  );
}

// The render result is used directly rather than the module-level : this hook updates
// state from inside a focus effect, and that leaves  pointing at a stale tree here.
/**
 * Changes focus, then makes the component re-render so the mocked hook re-reads it.
 *
 * The mutation lives here rather than in the harness: a component mutating module state is what
 * the linter objects to, and it is right — a test double is not an exception worth arguing for.
 */
const setFocus = async (
  view: ReturnType<typeof render> extends Promise<infer R> ? R : never,
  focused: boolean
) => {
  mockFocus.current = focused;
  mockFocus.version += 1;

  await act(async () => {
    fireEvent.press(view.getByLabelText('rerender'));
  });
};

const renderHarness = async (initial: Props, next?: Props) =>
  await render(<Harness initial={initial} next={next} />);

describe('reporting a view', () => {
  it('reports once when the screen is focused and its data is known', async () => {
    await renderHarness({ state: 'populated' });

    expect(captured).toEqual([{ event: 'insights_viewed', properties: { state: 'populated' } }]);
  });

  // The failure that makes a dashboard useless: a "view" per render.
  it('does not report again when the screen re-renders', async () => {
    const view = await renderHarness({ state: 'empty' });

    await act(async () => {
      fireEvent.press(view.getByLabelText('rerender'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('rerender'));
    });

    expect(captured).toHaveLength(1);
  });

  it('reports nothing while the screen is not focused', async () => {
    mockFocus.current = false;

    await renderHarness({ state: 'populated' });

    expect(captured).toEqual([]);
  });
});

describe('waiting for the data', () => {
  // At the moment of focus the query is usually still running, and `insights_viewed` describes
  // what the user actually saw. Guessing would be worse than waiting.
  it('holds the event until the properties are known', async () => {
    const view = await renderHarness(null, { state: 'populated' });

    expect(captured).toEqual([]);

    await act(async () => {
      fireEvent.press(view.getByLabelText('advance'));
    });

    expect(captured).toEqual([{ event: 'insights_viewed', properties: { state: 'populated' } }]);
  });

  it('reports nothing at all if the data never arrives', async () => {
    const view = await renderHarness(null, null);

    await act(async () => {
      fireEvent.press(view.getByLabelText('advance'));
    });

    expect(captured).toEqual([]);
  });

  // Once reported, later changes belong to the same visit — not a second view.
  it('does not report a second time when the data changes', async () => {
    const view = await renderHarness({ state: 'empty' }, { state: 'populated' });

    await act(async () => {
      fireEvent.press(view.getByLabelText('advance'));
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.properties).toEqual({ state: 'empty' });
  });
});

describe('coming back to a screen', () => {
  // React Navigation keeps a tab mounted, so a mount effect would count five visits as one.
  it('reports again after focus is lost and regained', async () => {
    const view = await renderHarness({ state: 'populated' });
    expect(captured).toHaveLength(1);

    await setFocus(view, false);
    expect(captured).toHaveLength(1);

    await setFocus(view, true);

    expect(captured).toHaveLength(2);
  });
});
