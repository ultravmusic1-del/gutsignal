import { TimeoutError, withTimeout } from '../promise';

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves with the value when the promise settles in time', async () => {
    const promise = withTimeout(Promise.resolve('db'), 1000, 'Local database');
    await expect(promise).resolves.toBe('db');
  });

  it('rejects with a TimeoutError when the promise never settles', async () => {
    const never = new Promise<string>(() => {});
    const promise = withTimeout(never, 5000, 'Local database');

    jest.advanceTimersByTime(5000);

    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    await expect(promise).rejects.toThrow('Local database did not respond within 5000ms');
  });

  it('propagates the original rejection rather than masking it as a timeout', async () => {
    const failure = Promise.reject(new Error('disk full'));
    await expect(withTimeout(failure, 1000, 'Local database')).rejects.toThrow('disk full');
  });

  it('normalises a non-Error rejection', async () => {
    const failure = Promise.reject('nope');
    await expect(withTimeout(failure, 1000, 'Local database')).rejects.toThrow('nope');
  });

  it('clears its timer once settled, so a resolved call cannot fire later', async () => {
    await withTimeout(Promise.resolve(1), 1000, 'Local database');
    expect(jest.getTimerCount()).toBe(0);
  });
});
