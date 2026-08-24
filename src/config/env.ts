import { z } from 'zod';

/**
 * Environment validation.
 *
 * Two hard rules (CLAUDE.md §49, spec §108):
 *  1. Only intentionally PUBLIC values may be read here. Anything prefixed `EXPO_PUBLIC_` is
 *     embedded in the app binary and readable by anyone who downloads it. Provider secrets,
 *     webhook secrets and the Supabase service-role key live in Edge Function secrets only.
 *  2. Each variable is referenced STATICALLY below. Expo inlines `process.env.EXPO_PUBLIC_X`
 *     at build time only when it appears literally — a dynamic lookup silently yields
 *     undefined in a release build.
 *
 * A missing/invalid value produces a `configuration_error` boot state with an actionable
 * message rather than a crash or, worse, a half-working app pointed at nothing.
 */

const urlSchema = z.string().url('must be a valid URL');
const nonEmpty = z.string().min(1, 'must not be empty');

const envSchema = z.object({
  supabaseUrl: urlSchema,
  supabasePublishableKey: nonEmpty,
  // Optional until their milestones (RevenueCat M12, analytics/monitoring M16).
  revenueCatIosKey: z.string().optional(),
  revenueCatAndroidKey: z.string().optional(),
  posthogKey: z.string().optional(),
  posthogHost: z.string().optional(),
  sentryDsn: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const raw = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
};

export type EnvResult = { ok: true; env: Env } | { ok: false; problems: string[] };

/** Validates an arbitrary record. Exported so tests don't depend on the ambient process.env. */
export function parseEnv(input: Record<string, string | undefined>): EnvResult {
  const result = envSchema.safeParse(input);

  if (result.success) {
    return { ok: true, env: result.data };
  }

  const problems = result.error.issues.map((issue) => {
    const key = issue.path.join('.');
    return `${envVarName(key)} ${issue.message}`;
  });

  return { ok: false, problems };
}

/** Maps a schema key back to the variable name the developer actually has to set. */
function envVarName(key: string): string {
  const map: Record<string, string> = {
    supabaseUrl: 'EXPO_PUBLIC_SUPABASE_URL',
    supabasePublishableKey: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    revenueCatIosKey: 'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
    revenueCatAndroidKey: 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
    posthogKey: 'EXPO_PUBLIC_POSTHOG_KEY',
    posthogHost: 'EXPO_PUBLIC_POSTHOG_HOST',
    sentryDsn: 'EXPO_PUBLIC_SENTRY_DSN',
  };
  return map[key] ?? key;
}

/** Result of validating the real environment this app was built with. */
export const envResult: EnvResult = parseEnv(raw);
