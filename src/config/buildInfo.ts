/**
 * What this build is, in the terms a support conversation needs (review §23–24).
 *
 * "GutSignal 0.1.0" stops identifying anything after the third build of it. When someone reports
 * that an entry vanished, the useful questions are which binary they are holding and which backend
 * it is pointed at — and the answer should be one screenshot, not an afternoon.
 *
 * **Identifiers only, never credentials.** This is the one screen in the app whose entire job is
 * to display configuration, which makes it the easiest place to leak some. The Supabase *project
 * reference* is shown because it is in every request URL and is not a secret; the publishable key
 * is not shown, because a screenshot of a diagnostics panel ends up in a support thread. There is
 * a test asserting nothing credential-shaped can come out of here whatever it is handed.
 *
 * Pure and input-driven so it can be tested without a running app.
 */

export type BuildInputs = {
  version: string | undefined;
  buildNumber: string | undefined;
  bundleIdentifier: string | undefined;
  gitSha: string | undefined;
  appEnv: string | undefined;
  builtAt: string | undefined;
  supabaseUrl: string | undefined;
};

/** One line of the panel, and one line a person can read down a phone. */
export type BuildLine = { label: string; value: string };

export type BuildInfo = {
  version: string;
  buildNumber: string;
  bundleIdentifier: string;
  gitSha: string;
  appEnv: string;
  builtAt: string;
  supabaseProjectRef: string;
  lines: BuildLine[];
};

const UNKNOWN = 'unknown';

const orUnknown = (value: string | undefined) =>
  value === undefined || value === '' ? UNKNOWN : value;

/**
 * The project reference is the first label of a Supabase host.
 *
 * Read from the URL rather than stored separately, so it cannot disagree with the backend the app
 * is actually talking to — which is the entire question this panel exists to answer.
 */
export function projectRefFrom(url: string | undefined): string {
  if (url === undefined || url === '') return UNKNOWN;

  try {
    const { hostname } = new URL(url);
    const [first] = hostname.split('.');

    return first === undefined || first === '' ? UNKNOWN : first;
  } catch {
    // Not a URL at all. Saying so beats showing a fragment of whatever it was.
    return UNKNOWN;
  }
}

export function describeBuild(inputs: BuildInputs): BuildInfo {
  const version = orUnknown(inputs.version);
  const buildNumber = orUnknown(inputs.buildNumber);
  const gitSha = orUnknown(inputs.gitSha);
  const appEnv = orUnknown(inputs.appEnv);
  const builtAt = orUnknown(inputs.builtAt);
  const bundleIdentifier = orUnknown(inputs.bundleIdentifier);
  const supabaseProjectRef = projectRefFrom(inputs.supabaseUrl);

  return {
    version,
    buildNumber,
    bundleIdentifier,
    gitSha,
    appEnv,
    builtAt,
    supabaseProjectRef,
    lines: [
      { label: 'Version', value: `${version} (${buildNumber})` },
      { label: 'Commit', value: gitSha },
      { label: 'Environment', value: appEnv },
      { label: 'Supabase project', value: supabaseProjectRef },
      { label: 'Bundle', value: bundleIdentifier },
      { label: 'Built', value: builtAt },
    ],
  };
}
