-- GutSignal — RLS isolation test: every user-owned table
--
-- Spec §91 and CLAUDE.md §58: a missing or broken RLS policy is a RELEASE BLOCKER. This test
-- proves, in the database itself, that user A cannot read, update, delete or impersonate
-- user B — for EVERY user-owned table. A new table without an entry here is unfinished.
--
-- Written as plain SQL with assertions rather than pgTAP so it can be run without Docker from
-- a Windows host — via the Supabase SQL editor, psql, or CI.
--
-- It is self-contained: it creates its own fixtures and removes them, including on failure
-- paths, so it can be run repeatedly against a non-production project.
--
-- Run:  psql "$DATABASE_URL" -f supabase/tests/rls_isolation.sql
-- Pass: final notice reads "RLS isolation: ALL CHECKS PASSED"
-- Fail: raises an exception naming the check that failed

begin;

do $$
declare
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  visible_count      integer;
  affected_count     integer;
  insert_was_blocked boolean := false;
  delete_was_blocked boolean := false;
  table_name         text;
begin
  -- ---------------------------------------------------------------------
  -- Fixtures. Inserting into auth.users also exercises the sign-up trigger.
  -- ---------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  values
    ('00000000-0000-0000-0000-000000000000', user_a, 'authenticated', 'authenticated',
     'rls-user-a@test.invalid', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"User A"}'::jsonb),
    ('00000000-0000-0000-0000-000000000000', user_b, 'authenticated', 'authenticated',
     'rls-user-b@test.invalid', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"User B"}'::jsonb);

  select count(*) into visible_count from public.profiles where id in (user_a, user_b);
  if visible_count <> 2 then
    raise exception 'FAILED: the sign-up trigger did not create a profile for each auth user (got %)',
      visible_count;
  end if;

  -- ---------------------------------------------------------------------
  -- Act as user A.
  -- ---------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  -- 1. SELECT isolation
  select count(*) into visible_count from public.profiles;
  if visible_count <> 1 then
    raise exception 'FAILED: user A can see % profile rows, expected only their own', visible_count;
  end if;

  select count(*) into visible_count from public.profiles where id = user_b;
  if visible_count <> 0 then
    raise exception 'FAILED: user A can read user B''s profile';
  end if;

  -- 2. UPDATE isolation
  with attempted as (
    update public.profiles set display_name = 'HACKED' where id = user_b returning 1
  )
  select count(*) into affected_count from attempted;
  if affected_count <> 0 then
    raise exception 'FAILED: user A updated user B''s profile';
  end if;

  -- 3. DELETE refused (there is no DELETE policy at all, by design)
  begin
    with attempted as (delete from public.profiles where id = user_b returning 1)
    select count(*) into affected_count from attempted;
    if affected_count = 0 then delete_was_blocked := true; end if;
  exception
    when others then delete_was_blocked := true;
  end;
  if not delete_was_blocked then
    raise exception 'FAILED: user A deleted user B''s profile';
  end if;

  -- 4. INSERT impersonation refused
  begin
    insert into public.profiles (id, display_name) values (user_b, 'impersonated');
  exception
    when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: user A inserted a row owned by user B';
  end if;

  -- 5. The user's OWN row remains writable
  with attempted as (
    update public.profiles set timezone = 'Europe/London' where id = user_a returning 1
  )
  select count(*) into affected_count from attempted;
  if affected_count <> 1 then
    raise exception 'FAILED: user A cannot update their own profile';
  end if;

  -- 6. updated_at is owned by the server, not the client.
  --
  -- Note this cannot be asserted as `updated_at > created_at`: inside a single transaction
  -- now() is constant, so both timestamps are identical. The property that actually matters
  -- is that a client cannot dictate the value — a device with a wrong clock, or a replayed
  -- offline record, must not be able to rewrite ordering metadata.
  update public.profiles
  set display_name = 'A', updated_at = timestamptz '2000-01-01 00:00:00Z'
  where id = user_a;

  select count(*) into affected_count
  from public.profiles
  where id = user_a and updated_at = timestamptz '2000-01-01 00:00:00Z';
  if affected_count <> 0 then
    raise exception 'FAILED: the client was able to set updated_at directly';
  end if;

  -- =====================================================================
  -- Onboarding preference tables (migration 20260824120000)
  --
  -- Seeded as the superuser so both users own rows, then read back as user A.
  -- =====================================================================
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);

  insert into public.user_preferences (user_id, bowel_pattern, goals)
  values (user_a, 'mixed', array['triggers']), (user_b, 'varies', array['bowel_patterns']);

  insert into public.user_symptom_preferences (user_id, symptom_type)
  values (user_a, 'bloating'), (user_b, 'urgency');

  insert into public.user_suspected_factors (user_id, factor_key)
  values (user_a, 'coffee'), (user_b, 'dairy');

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  foreach table_name in array array[
    'user_preferences', 'user_symptom_preferences', 'user_suspected_factors'
  ]
  loop
    -- Reads are limited to the caller's own rows.
    execute format('select count(*) from public.%I', table_name) into visible_count;
    if visible_count <> 1 then
      raise exception 'FAILED: user A sees % rows in %, expected only their own',
        visible_count, table_name;
    end if;

    execute format('select count(*) from public.%I where user_id = $1', table_name)
      into visible_count using user_b;
    if visible_count <> 0 then
      raise exception 'FAILED: user A can read user B''s rows in %', table_name;
    end if;

    -- Deletes cannot reach another user's rows.
    execute format('delete from public.%I where user_id = $1', table_name) using user_b;
    get diagnostics affected_count = row_count;
    if affected_count <> 0 then
      raise exception 'FAILED: user A deleted % rows from % belonging to user B',
        affected_count, table_name;
    end if;
  end loop;

  -- Writes cannot be attributed to another user.
  insert_was_blocked := false;
  begin
    insert into public.user_symptom_preferences (user_id, symptom_type) values (user_b, 'nausea');
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: user A inserted a symptom preference owned by user B';
  end if;

  insert_was_blocked := false;
  begin
    insert into public.user_suspected_factors (user_id, factor_key) values (user_b, 'alcohol');
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: user A inserted a suspected factor owned by user B';
  end if;

  insert_was_blocked := false;
  begin
    insert into public.user_preferences (user_id, bowel_pattern) values (user_b, 'unsure');
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: user A inserted preferences owned by user B';
  end if;

  -- The custom-factor constraint is a data-integrity rule, not an RLS rule, but it protects
  -- the engine from factors with no label — so it is asserted here too.
  insert_was_blocked := false;
  begin
    insert into public.user_suspected_factors (user_id, factor_key) values (user_a, 'custom:kefir');
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: a custom factor was accepted without a label';
  end if;

  -- ---------------------------------------------------------------------
  -- Act as an unauthenticated client.
  -- ---------------------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', null, true);

  foreach table_name in array array[
    'profiles', 'user_preferences', 'user_symptom_preferences', 'user_suspected_factors'
  ]
  loop
    execute format('select count(*) from public.%I', table_name) into visible_count;
    if visible_count <> 0 then
      raise exception 'FAILED: anonymous clients can read % rows in %', visible_count, table_name;
    end if;
  end loop;

  raise notice 'RLS isolation: ALL CHECKS PASSED';
end;
$$;

-- Fixtures are discarded with the transaction, so the test leaves no residue whether it
-- passed or failed. Deleting auth.users would also cascade to profiles — the same cascade
-- account deletion relies on (spec §97).
rollback;
