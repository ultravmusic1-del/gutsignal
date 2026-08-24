import * as AppleAuthentication from 'expo-apple-authentication';
import type { Session } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/services/supabase/client';

/**
 * Authentication (spec §11).
 *
 * Sign in with Apple is primary on iOS; email one-time codes cover everyone else. There are
 * no passwords anywhere in GutSignal — nothing to leak, reset, or reuse.
 *
 * Every function returns a discriminated result rather than throwing. Auth fails for ordinary
 * reasons (no signal, wrong code, user changed their mind) and each of those needs its own
 * message, not a generic red box (spec §100).
 */

export type AuthErrorCode =
  | 'cancelled'
  | 'network'
  | 'invalid_code'
  | 'expired_code'
  | 'rate_limited'
  | 'apple_unavailable'
  | 'unknown';

export type AuthResult = { ok: true } | { ok: false; code: AuthErrorCode; message: string };

/** User-facing messages. Plain, non-blaming, and actionable. */
const MESSAGES: Record<AuthErrorCode, string> = {
  cancelled: 'Sign-in was cancelled.',
  network: "Couldn't reach GutSignal. Check your connection and try again.",
  invalid_code: "That code doesn't match. Check it and try again.",
  expired_code: 'That code has expired. Request a new one.',
  rate_limited: 'Too many attempts. Wait a moment before trying again.',
  apple_unavailable: 'Sign in with Apple is not set up for GutSignal yet. Use email instead.',
  unknown: 'Something went wrong signing you in. Please try again.',
};

const fail = (code: AuthErrorCode): AuthResult => ({ ok: false, code, message: MESSAGES[code] });

/**
 * Maps a Supabase auth error to one of our codes.
 *
 * Deliberately conservative: anything unrecognised becomes `unknown` rather than being shown
 * to the user raw, because provider error strings are not written for end users and can leak
 * implementation detail.
 */
function classify(error: { message?: string; status?: number } | null): AuthErrorCode {
  if (!error) return 'unknown';

  const message = (error.message ?? '').toLowerCase();

  if (error.status === 429 || message.includes('rate limit')) return 'rate_limited';
  // The OS can offer Sign in with Apple while the backend provider is not configured. That
  // combination is invisible until a real sign-in is attempted, so it gets its own message
  // rather than a generic failure.
  if (message.includes('provider is not enabled') || message.includes('unsupported provider')) {
    return 'apple_unavailable';
  }
  if (message.includes('expired')) return 'expired_code';
  if (message.includes('invalid') || message.includes('token has expired or is invalid')) {
    return 'invalid_code';
  }
  if (message.includes('network') || message.includes('fetch')) return 'network';

  return 'unknown';
}

/** True when the OS can present the Apple sign-in sheet. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sign in with Apple.
 *
 * Apple returns the user's name only on the FIRST authorization for an app, so it is written
 * into user metadata immediately — a later sign-in cannot recover it.
 */
export async function signInWithApple(): Promise<AuthResult> {
  const supabase = getSupabaseClient();

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) return fail('unknown');

    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) return fail(classify(error));

    if (fullName.length > 0) {
      // Best effort: a missing display name is a cosmetic problem, and onboarding asks anyway.
      await supabase.auth.updateUser({ data: { full_name: fullName } });
    }

    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') return fail('cancelled');
    return fail('unknown');
  }
}

/** Sends a one-time code to an email address, creating the account if needed. */
export async function sendEmailCode(email: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });

  return error ? fail(classify(error)) : { ok: true };
}

/** Exchanges an emailed code for a session. */
export async function verifyEmailCode(email: string, code: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });

  return error ? fail(classify(error)) : { ok: true };
}

export async function signOut(): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  return error ? fail(classify(error)) : { ok: true };
}

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Exported for tests. */
export const __testing = { classify, MESSAGES };
