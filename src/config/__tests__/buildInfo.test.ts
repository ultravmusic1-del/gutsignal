import { describeBuild, projectRefFrom, type BuildInputs } from '../buildInfo';

/**
 * What a build says about itself (review §23–24, spec §108).
 *
 * The purpose is a support conversation: someone reports that a log vanished, and the answer to
 * "which build, pointed at which backend?" should take one screenshot rather than an afternoon.
 *
 * The constraint is that this panel is the one place in the app deliberately designed to display
 * configuration, so it is also the easiest place to leak some. Everything here is an identifier;
 * nothing is a credential. The last test in this file is the one that matters.
 */

const INPUTS: BuildInputs = {
  version: '0.1.0',
  buildNumber: '7',
  bundleIdentifier: 'com.vivaan.gutsignal',
  gitSha: 'a1b2c3d4e5f6',
  appEnv: 'preview',
  builtAt: '2026-09-06T12:00:00.000Z',
  supabaseUrl: 'https://mrqxmkxhyohlywiziofz.supabase.co',
};

describe('reading a Supabase project reference from its URL', () => {
  it('takes the subdomain, which is the project ref', () => {
    expect(projectRefFrom('https://mrqxmkxhyohlywiziofz.supabase.co')).toBe('mrqxmkxhyohlywiziofz');
  });

  it('says unknown rather than guessing at a URL it does not recognise', () => {
    expect(projectRefFrom('not-a-url')).toBe('unknown');
    expect(projectRefFrom('')).toBe('unknown');
  });

  // A self-hosted or proxied URL has no project ref to read. Better to say so than to invent one.
  it('does not invent a ref for a host that has none', () => {
    expect(projectRefFrom('https://localhost:54321')).toBe('localhost');
  });
});

describe('describing a build', () => {
  const build = describeBuild(INPUTS);

  it('carries everything a bug report needs to identify the binary', () => {
    expect(build).toMatchObject({
      version: '0.1.0',
      buildNumber: '7',
      gitSha: 'a1b2c3d4e5f6',
      appEnv: 'preview',
      supabaseProjectRef: 'mrqxmkxhyohlywiziofz',
      bundleIdentifier: 'com.vivaan.gutsignal',
    });
  });

  /**
   * `unknown` is a real answer and has to survive. A build made outside git, or before `eas init`,
   * still needs to be describable — a diagnostics panel that crashes on an incomplete build is
   * useless exactly when something is already wrong.
   */
  it('describes a build that knows almost nothing about itself', () => {
    const sparse = describeBuild({
      version: undefined,
      buildNumber: undefined,
      bundleIdentifier: undefined,
      gitSha: undefined,
      appEnv: undefined,
      builtAt: undefined,
      supabaseUrl: undefined,
    });

    expect(sparse.version).toBe('unknown');
    expect(sparse.gitSha).toBe('unknown');
    expect(sparse.appEnv).toBe('unknown');
    expect(sparse.supabaseProjectRef).toBe('unknown');
  });

  it('renders as lines a person can read out over the phone', () => {
    const lines = build.lines.map((line) => `${line.label}: ${line.value}`);

    expect(lines).toContain('Version: 0.1.0 (7)');
    expect(lines).toContain('Commit: a1b2c3d4e5f6');
    expect(lines).toContain('Environment: preview');
    expect(lines).toContain('Supabase project: mrqxmkxhyohlywiziofz');
  });

  /**
   * The test this file exists for.
   *
   * A diagnostics panel is where configuration goes to be displayed, which makes it the most
   * likely place for a key to be added "just while debugging". Nothing this function returns may
   * ever contain one, so the assertion is against the whole rendered output rather than against
   * the fields it happens to have today.
   */
  it('cannot show a credential, whatever it is handed', () => {
    const rendered = JSON.stringify(
      describeBuild({
        ...INPUTS,
        // Every one of these would be a real leak if it found its way through.
        supabaseUrl: 'https://ref.supabase.co',
      })
    );

    const secrets = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
      'sb_publishable_abc123',
      'service_role',
      'sk_live_abc123',
    ];

    for (const secret of secrets) {
      expect(rendered).not.toContain(secret);
    }

    // And nothing token-shaped, in case a future field carries one in by accident.
    expect(rendered).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(rendered).not.toMatch(/\b(anon|service_role|secret|apikey|password)\b/i);
  });
});
