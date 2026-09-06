/**
 * delete-account — removes the caller's account and everything it owns (spec §97).
 *
 * This is the server half of account deletion, and it exists because the client cannot be trusted
 * with what it needs: deleting an `auth.users` row requires the service-role key, and
 * `CLAUDE.md` §14 and §58 both make shipping that key to a device a release blocker. So the key
 * lives here, in a function whose only power is to delete *the caller*.
 *
 * ## The one security property that matters
 *
 * **The user id comes from the verified token and never from the request body.** A body-supplied
 * id would turn this endpoint into "delete any account by uuid", which is the worst possible
 * defect in an app holding health diaries. There is deliberately no id parameter at all — not an
 * optional one, not an admin one — because a parameter that must never be used is a parameter
 * that eventually gets used.
 *
 * Two independent checks stand in front of the delete:
 *
 * 1. The platform verifies the JWT before this code runs (`verify_jwt` is enabled on deploy).
 * 2. This function calls `getUser(token)`, which validates the token against the auth server
 *    rather than merely decoding it, and takes the id from the result.
 *
 * The second is not redundant. It is what makes the function safe if the gateway setting is ever
 * changed by someone who did not read this comment.
 *
 * ## Why deleting the auth user is enough
 *
 * Every user-owned table references `auth.users (id) on delete cascade`, and the meal children
 * cascade from `meal_logs` — verified against the live schema. So one delete removes profiles,
 * preferences, every log type and `pattern_findings`. There is no per-table delete list here on
 * purpose: a list would need updating for each new table and would fail silently when someone
 * forgot, whereas the cascade is declared beside the table it protects.
 *
 * Storage is not touched because no bucket exists yet. When meal photos arrive (M7), objects
 * under `meal-photos/{userId}/` must be removed here too, before the auth user goes.
 *
 * ## Logging
 *
 * Failures are logged without the user id or any row content (§30). A crash report or log line
 * that names whose account was deleted is the same privacy defect as leaking a symptom.
 */

import { createClient } from '@supabase/supabase-js';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Every response is JSON, so the client never has to guess what it is parsing. */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  // POST only. Deleting an account on GET would make it reachable by anything that follows a
  // link, including a preview fetcher.
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (authHeader === null) return json({ ok: false, error: 'unauthenticated' }, 401);

  const token = authHeader.replace('Bearer ', '');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (supabaseUrl === '' || anonKey === '' || serviceRoleKey === '') {
    console.error('delete-account: function is missing its environment configuration');
    return json({ ok: false, error: 'not_configured' }, 500);
  }

  // Validated against the auth server, not decoded locally: an expired or revoked token must not
  // be able to delete anything.
  const caller = createClient(supabaseUrl, anonKey);
  const { data, error: userError } = await caller.auth.getUser(token);
  const user = data?.user ?? null;

  if (userError !== null || user === null) {
    return json({ ok: false, error: 'unauthenticated' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // `user.id` — from the verified token above. This is the only id this function will ever act on.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError !== null) {
    // The message, never the id: enough to diagnose, nothing that identifies whose account it was.
    console.error('delete-account: deletion failed', deleteError.message);
    return json({ ok: false, error: 'delete_failed' }, 500);
  }

  return json({ ok: true }, 200);
});
