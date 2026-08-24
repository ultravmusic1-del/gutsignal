import { __testing } from '../authService';

const { classify, MESSAGES } = __testing;

/**
 * Auth fails for ordinary reasons, and each needs its own message. These tests pin the
 * classification — and, just as importantly, pin the rule that an unrecognised provider error
 * degrades to `unknown` rather than being shown to the user raw.
 */
describe('auth error classification', () => {
  it('recognises rate limiting by status and by message', () => {
    expect(classify({ status: 429 })).toBe('rate_limited');
    expect(classify({ message: 'Email rate limit exceeded' })).toBe('rate_limited');
  });

  it('distinguishes an expired code from an invalid one', () => {
    expect(classify({ message: 'Token has expired' })).toBe('expired_code');
    expect(classify({ message: 'Invalid token' })).toBe('invalid_code');
  });

  it('recognises a backend provider that is not configured', () => {
    // Reproduces the real gap: the device offers Apple, the project has not enabled it.
    expect(classify({ message: 'Unsupported provider: provider is not enabled' })).toBe(
      'apple_unavailable'
    );
  });

  it('recognises connectivity failures', () => {
    expect(classify({ message: 'Network request failed' })).toBe('network');
    expect(classify({ message: 'TypeError: Failed to fetch' })).toBe('network');
  });

  it('degrades an unrecognised provider error to unknown', () => {
    expect(classify({ message: 'pq: relation "x" does not exist' })).toBe('unknown');
    expect(classify({ message: '' })).toBe('unknown');
    expect(classify(null)).toBe('unknown');
  });

  it('never surfaces raw provider text to the user', () => {
    const providerNoise = 'AuthApiError: unexpected_failure at /token?grant_type=password';
    const code = classify({ message: providerNoise });

    expect(MESSAGES[code]).not.toContain('AuthApiError');
    expect(MESSAGES[code]).not.toContain('grant_type');
  });

  it('has a plain, actionable message for every code', () => {
    for (const [code, message] of Object.entries(MESSAGES)) {
      expect(message.length).toBeGreaterThan(10);
      // No jargon leaking into user-facing copy.
      expect(message).not.toMatch(/\b(null|undefined|JWT|OAuth|API|token)\b/i);
      expect(code).toBeTruthy();
    }
  });
});
