import { parseEnv } from '../env';

const valid = {
  supabaseUrl: 'https://abc.supabase.co',
  supabasePublishableKey: 'sb_publishable_example',
};

describe('environment validation', () => {
  it('accepts a valid minimal configuration', () => {
    const result = parseEnv(valid);
    expect(result.ok).toBe(true);
  });

  it('treats RevenueCat and telemetry keys as optional before their milestones', () => {
    const result = parseEnv(valid);
    if (!result.ok) throw new Error('expected valid env');
    expect(result.env.revenueCatIosKey).toBeUndefined();
    expect(result.env.sentryDsn).toBeUndefined();
  });

  it('reports the actual variable name a developer has to set', () => {
    const result = parseEnv({});
    if (result.ok) throw new Error('expected invalid env');

    expect(result.problems).toEqual(
      expect.arrayContaining([
        'EXPO_PUBLIC_SUPABASE_URL is not set',
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set',
      ])
    );
  });

  it('rejects a malformed Supabase URL rather than failing later at request time', () => {
    const result = parseEnv({ ...valid, supabaseUrl: 'abc.supabase.co' });
    if (result.ok) throw new Error('expected invalid env');
    expect(result.problems.join(' ')).toContain('EXPO_PUBLIC_SUPABASE_URL');
  });

  it('rejects an empty publishable key', () => {
    const result = parseEnv({ ...valid, supabasePublishableKey: '' });
    expect(result.ok).toBe(false);
  });
});
