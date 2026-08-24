import { BASE_DELAY_MS, MAX_DELAY_MS, isDue, nextAttemptAt, retryDelayMs } from '../backoff';

const noJitter = () => 0.5; // lands exactly on the un-jittered delay

describe('retryDelayMs', () => {
  it('starts at the base delay', () => {
    expect(retryDelayMs(1, noJitter)).toBe(BASE_DELAY_MS);
  });

  it('doubles with each attempt', () => {
    expect(retryDelayMs(2, noJitter)).toBe(BASE_DELAY_MS * 2);
    expect(retryDelayMs(3, noJitter)).toBe(BASE_DELAY_MS * 4);
    expect(retryDelayMs(4, noJitter)).toBe(BASE_DELAY_MS * 8);
  });

  it('caps so a long outage does not push retries beyond reach', () => {
    expect(retryDelayMs(50, noJitter)).toBe(MAX_DELAY_MS);
  });

  it('applies jitter within ±20% so devices do not retry in lockstep', () => {
    expect(retryDelayMs(1, () => 0)).toBe(Math.round(BASE_DELAY_MS * 0.8));
    expect(retryDelayMs(1, () => 1)).toBe(Math.round(BASE_DELAY_MS * 1.2));
  });

  it('treats a zeroth attempt as the first rather than throwing', () => {
    expect(retryDelayMs(0, noJitter)).toBe(BASE_DELAY_MS);
  });
});

describe('nextAttemptAt', () => {
  it('returns an ISO instant in the future', () => {
    const now = new Date('2026-08-24T12:00:00Z');
    expect(nextAttemptAt(now, 1, noJitter)).toBe('2026-08-24T12:00:02.000Z');
  });
});

describe('isDue', () => {
  const now = new Date('2026-08-24T12:00:00Z');

  it('is due when no attempt has been scheduled', () => {
    expect(isDue(null, now)).toBe(true);
  });

  it('is due once the scheduled instant has passed', () => {
    expect(isDue('2026-08-24T11:59:59Z', now)).toBe(true);
    expect(isDue('2026-08-24T12:00:00Z', now)).toBe(true);
  });

  it('is not due before the scheduled instant', () => {
    expect(isDue('2026-08-24T12:00:01Z', now)).toBe(false);
  });

  it('treats an unparseable instant as due rather than stranding the row forever', () => {
    expect(isDue('not-a-date', now)).toBe(true);
  });
});
