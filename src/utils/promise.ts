/**
 * Promise helpers. Pure, no platform APIs.
 */

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not respond within ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Rejects with a `TimeoutError` if `promise` has not settled within `ms`.
 *
 * Used by the boot sequence. A dependency that hangs instead of failing would otherwise leave
 * the app on a blank screen indefinitely — the worst possible failure mode, because it looks
 * identical to a crash and gives the user nothing to act on. A bounded wait turns it into a
 * reported error state.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
