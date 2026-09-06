import {
  captureError,
  identifyForMonitoring,
  resetMonitoring,
  setMonitoringSink,
  type MonitoringSink,
} from '../monitoring';
import type { ReportableEvent } from '../scrub';

/**
 * The reporting boundary.
 *
 * `scrub.test.ts` covers what a report may contain. These cover the two things only this module
 * decides: that everything leaving has been through the scrubber, and that a failing vendor cannot
 * take down the screen that was already handling a failure.
 */

const captured: ReportableEvent[] = [];

const sink: MonitoringSink = {
  capture: (event) => {
    captured.push(event);
  },
};

beforeEach(() => {
  captured.length = 0;
  resetMonitoring();
  setMonitoringSink(sink);
});

afterEach(() => resetMonitoring());

describe('reporting an error', () => {
  it('sends the operation and the error', () => {
    expect(captureError('app_boot', new Error('Network request failed'))).toBe('sent');

    expect(captured[0]?.tags).toEqual({ operation: 'app_boot' });
    expect(captured[0]?.exception).toEqual([{ type: 'Error', value: 'Network request failed' }]);
  });

  it('describes a thrown string', () => {
    captureError('app_boot', 'something broke');

    expect(captured[0]?.exception).toEqual([{ type: 'String', value: 'something broke' }]);
  });

  it('describes a thrown value that is not an error at all', () => {
    captureError('app_boot', { weird: true });

    expect(captured[0]?.exception).toEqual([{ type: 'object' }]);
  });
});

describe('everything leaves through the scrubber', () => {
  // The property that matters: there is no path from a caller to the sink that skips scrubbing.
  it('redacts an error message on the way out', () => {
    captureError('app_boot', new Error('No account for someone@example.com'));

    expect(JSON.stringify(captured)).not.toContain('someone@example.com');
  });

  it('redacts an id embedded in a message', () => {
    captureError('app_boot', new Error('Row 3f2504e0-4f89-11d3-9a0c-0305e82c3301 is missing'));

    expect(JSON.stringify(captured)).not.toContain('3f2504e0');
  });
});

describe('identifying an account', () => {
  it('attaches the id once one is known', () => {
    identifyForMonitoring('user-1');
    captureError('app_boot', new Error('boom'));

    expect(captured[0]?.user).toEqual({ id: 'user-1' });
  });

  it('attaches nobody before sign-in', () => {
    captureError('app_boot', new Error('boom'));

    expect(captured[0]?.user).toBeUndefined();
  });

  // A user id outliving its session would attribute one person's crashes to another on a shared
  // device — the same class of problem as the local data wipe in `localAccount.ts`.
  it('forgets the account when monitoring is reset', () => {
    identifyForMonitoring('user-1');
    resetMonitoring();
    setMonitoringSink(sink);

    captureError('app_boot', new Error('boom'));

    expect(captured[0]?.user).toBeUndefined();
  });
});

describe('failing safely', () => {
  it('reports nothing, and does not throw, when no vendor is configured', () => {
    resetMonitoring();

    expect(captureError('app_render', new Error('boom'))).toBe('no_sink');
  });

  // One bug becoming a blank app is exactly what an error boundary exists to prevent, so the thing
  // reporting the crash must not be able to cause a second one.
  it('does not throw when the vendor itself throws', () => {
    setMonitoringSink({
      capture: () => {
        throw new Error('vendor is down');
      },
    });

    expect(captureError('app_render', new Error('boom'))).toBe('no_sink');
  });
});
