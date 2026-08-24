import { z } from 'zod';

import { TRACKING_STYLE_KEYS } from '@/domain/onboarding/options';
import type { OnboardingDraft } from '@/features/onboarding/draftStore';
import { getSupabaseClient } from '@/services/supabase/client';

/**
 * Profile and preference persistence.
 *
 * Rows come back validated (CLAUDE.md §11): a schema change or a partially-applied migration
 * should surface as a clean error here, not as `undefined` three screens away.
 */

const profileSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  timezone: z.string(),
  tracking_style: z.enum(TRACKING_STYLE_KEYS),
  onboarding_completed_at: z.string().nullable(),
});

export type Profile = z.infer<typeof profileSchema>;

export type ProfileResult =
  { ok: true; profile: Profile } | { ok: false; reason: 'not_found' | 'unavailable' | 'invalid' };

export async function fetchProfile(userId: string): Promise<ProfileResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, timezone, tracking_style, onboarding_completed_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) return { ok: false, reason: 'unavailable' };
  if (!data) return { ok: false, reason: 'not_found' };

  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: 'invalid' };

  return { ok: true, profile: parsed.data };
}

export type SaveOnboardingResult = { ok: true } | { ok: false; message: string };

/**
 * Writes everything onboarding collected, then marks it complete.
 *
 * Order matters: `onboarding_completed_at` is set LAST. If the write fails partway, the user
 * is still flagged as needing onboarding and will be returned to it, rather than landing in an
 * app whose personalization silently never saved.
 *
 * The device's IANA zone is captured here because every day boundary and analysis window
 * depends on it (spec §102).
 */
export async function saveOnboarding(
  userId: string,
  draft: OnboardingDraft
): Promise<SaveOnboardingResult> {
  const supabase = getSupabaseClient();
  const timezone = deviceTimeZone();

  const preferences = await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      bowel_pattern: draft.bowelPattern,
      goals: draft.goals,
    },
    { onConflict: 'user_id' }
  );

  if (preferences.error) return { ok: false, message: 'Your answers could not be saved.' };

  if (draft.symptoms.length > 0) {
    const symptoms = await supabase.from('user_symptom_preferences').upsert(
      draft.symptoms.map((symptom_type) => ({ user_id: userId, symptom_type })),
      { onConflict: 'user_id,symptom_type' }
    );

    if (symptoms.error) return { ok: false, message: 'Your symptom choices could not be saved.' };
  }

  if (draft.suspectedFactors.length > 0) {
    const factors = await supabase.from('user_suspected_factors').upsert(
      draft.suspectedFactors.map((factor) => ({
        user_id: userId,
        factor_key: factor.key,
        custom_label: factor.label ?? null,
      })),
      { onConflict: 'user_id,factor_key' }
    );

    if (factors.error) return { ok: false, message: 'Your suspected factors could not be saved.' };
  }

  const profile = await supabase
    .from('profiles')
    .update({
      tracking_style: draft.trackingStyle,
      timezone,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (profile.error) return { ok: false, message: 'Your profile could not be updated.' };

  return { ok: true };
}

/**
 * The device's IANA time zone, e.g. 'Europe/London'.
 * Falls back to UTC rather than throwing — a missing zone must not block onboarding.
 */
export function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone.length > 0 ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}
