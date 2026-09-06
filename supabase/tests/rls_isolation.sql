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
-- Pass: final notice reads "RLS isolation: ALL CHECKS PASSED". Read the rest of that line —
--       it names any table that was skipped because its migration is not applied yet.
-- Fail: raises an exception naming the check that failed

-- NOTE (2026-09-06): the pattern_findings section has never been executed. The Supabase project
-- has been paused since it was written, and there is no local Postgres on the Windows dev machine,
-- so it is structurally reviewed but unrun. Expect to fix a typo on its first real run.

begin;

do $
declare
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  visible_count      integer;
  affected_count     integer;
  insert_was_blocked boolean := false;
  delete_was_blocked boolean := false;
  table_name         text;
  log_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  log_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  meal_a uuid := 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  meal_b uuid := 'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  findings_present   boolean := to_regclass('public.pattern_findings') is not null;
  anon_tables        text[];
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

  -- =====================================================================
  -- Symptom logs (migration 20260824140000)
  --
  -- The first user event table. Because the offline sync path upserts on an id the DEVICE
  -- generated, this section also proves the case unique to that design: a client that guesses
  -- or replays another user's row id still cannot write into their history.
  -- =====================================================================
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);

  insert into public.symptom_logs (
    id, user_id, symptom_type, severity, occurred_at, occurred_local_date,
    occurred_tz, occurred_utc_offset_minutes
  )
  values
    (log_a, user_a, 'bloating', 5, now(), current_date, 'Europe/London', 60),
    (log_b, user_b, 'cramping', 7, now(), current_date, 'Europe/London', 60);

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  -- 1. SELECT isolation
  select count(*) into visible_count from public.symptom_logs;
  if visible_count <> 1 then
    raise exception 'FAILED: user A sees % symptom logs, expected only their own', visible_count;
  end if;

  select count(*) into visible_count from public.symptom_logs where user_id = user_b;
  if visible_count <> 0 then
    raise exception 'FAILED: user A can read user B''s symptom logs';
  end if;

  -- 2. UPDATE isolation
  with attempted as (
    update public.symptom_logs set severity = 1 where id = log_b returning 1
  )
  select count(*) into affected_count from attempted;
  if affected_count <> 0 then
    raise exception 'FAILED: user A updated user B''s symptom log';
  end if;

  -- 3. DELETE isolation
  with attempted as (delete from public.symptom_logs where id = log_b returning 1)
  select count(*) into affected_count from attempted;
  if affected_count <> 0 then
    raise exception 'FAILED: user A deleted user B''s symptom log';
  end if;

  -- 4. INSERT impersonation refused
  insert_was_blocked := false;
  begin
    insert into public.symptom_logs (
      id, user_id, symptom_type, severity, occurred_at, occurred_local_date,
      occurred_tz, occurred_utc_offset_minutes
    )
    values (gen_random_uuid(), user_b, 'nausea', 4, now(), current_date, 'UTC', 0);
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: user A inserted a symptom log owned by user B';
  end if;

  -- 5. The sync upsert cannot be aimed at someone else's row.
  --
  -- This is the threat specific to device-generated ids: the client picks the primary key, so
  -- the check that matters is not "can A insert as B" but "can A's upsert land on B's row".
  begin
    insert into public.symptom_logs (
      id, user_id, symptom_type, severity, occurred_at, occurred_local_date,
      occurred_tz, occurred_utc_offset_minutes
    )
    values (log_b, user_a, 'gas', 2, now(), current_date, 'UTC', 0)
    on conflict (id) do update set severity = excluded.severity;
  exception when others then null;  -- blocked is fine; silently doing nothing is also fine
  end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
  select severity into visible_count from public.symptom_logs where id = log_b;
  if visible_count <> 7 then
    raise exception 'FAILED: an upsert aimed at user B''s row id changed it (severity is now %)',
      visible_count;
  end if;
  select count(*) into visible_count from public.symptom_logs where user_id = user_b;
  if visible_count <> 1 then
    raise exception 'FAILED: user B now owns % rows after user A''s upsert attempt', visible_count;
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  -- 6. The user's own log is writable, and a delete is a tombstone rather than a removal.
  update public.symptom_logs set deleted_at = now() where id = log_a;
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'FAILED: user A cannot tombstone their own symptom log';
  end if;

  select count(*) into visible_count from public.symptom_logs where id = log_a;
  if visible_count <> 1 then
    raise exception 'FAILED: the tombstoned row disappeared instead of being marked deleted';
  end if;

  -- 7. updated_at is server-owned.
  --
  -- The sync cursor is "everything changed at or after this timestamp". If a device with a
  -- wrong clock could write its own updated_at, it could place a row permanently behind every
  -- other device's cursor and make it invisible to them.
  update public.symptom_logs
  set severity = 6, updated_at = timestamptz '2000-01-01 00:00:00Z'
  where id = log_a;

  select count(*) into affected_count
  from public.symptom_logs
  where id = log_a and updated_at = timestamptz '2000-01-01 00:00:00Z';
  if affected_count <> 0 then
    raise exception 'FAILED: the client was able to set symptom_logs.updated_at directly';
  end if;

  -- =====================================================================
  -- Meals (migrations 20260824170000, 20260824170100)
  --
  -- Meals are an aggregate written through public.upsert_meals, so this section checks the
  -- function as well as the tables. Two threats are specific to this shape:
  --
  --   * the RPC is a transaction boundary, NOT a privilege escalation — it is security
  --     invoker, so it must be unable to do anything the caller could not already do
  --   * a composite foreign key ties each child to its parent's owner, so items cannot be
  --     attached to someone else's meal even by bypassing the function entirely
  -- =====================================================================
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);

  insert into public.meal_logs (id, user_id, title, meal_size, occurred_at,
    occurred_local_date, occurred_tz, occurred_utc_offset_minutes)
  values (meal_b, user_b, 'B lunch', 'medium', now(), current_date, 'UTC', 0);

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  -- 1. The aggregate lands whole, in one call.
  perform public.upsert_meals(jsonb_build_array(jsonb_build_object(
    'id', meal_a, 'user_id', user_a, 'title', 'Shawarma', 'meal_size', 'large',
    'occurred_at', now(), 'occurred_local_date', current_date,
    'occurred_tz', 'Europe/London', 'occurred_utc_offset_minutes', 60,
    'items', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'raw_name', 'chicken', 'position', 0),
      jsonb_build_object('id', gen_random_uuid(), 'raw_name', 'flatbread', 'position', 1)),
    'tags', jsonb_build_array('restaurant', 'spicy'))));

  select count(*) into visible_count from public.meal_items where meal_id = meal_a;
  if visible_count <> 2 then
    raise exception 'FAILED: the meal aggregate landed with % items, expected 2', visible_count;
  end if;

  -- 2. Re-upserting replaces the contents rather than accumulating them.
  perform public.upsert_meals(jsonb_build_array(jsonb_build_object(
    'id', meal_a, 'user_id', user_a, 'title', 'Shawarma', 'meal_size', 'large',
    'occurred_at', now(), 'occurred_local_date', current_date,
    'occurred_tz', 'Europe/London', 'occurred_utc_offset_minutes', 60,
    'items', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'raw_name', 'chicken', 'position', 0)),
    'tags', jsonb_build_array('restaurant'))));

  select count(*) into visible_count from public.meal_items where meal_id = meal_a;
  if visible_count <> 1 then
    raise exception 'FAILED: replacing the aggregate left % items, expected 1', visible_count;
  end if;

  -- 3. SELECT isolation across all three tables.
  select count(*) into visible_count from public.meal_logs;
  if visible_count <> 1 then
    raise exception 'FAILED: user A sees % meals, expected only their own', visible_count;
  end if;

  select count(*) into visible_count from public.meal_items where user_id = user_b;
  if visible_count <> 0 then
    raise exception 'FAILED: user A can read user B''s meal items';
  end if;

  -- 4. The RPC cannot create a meal owned by someone else.
  insert_was_blocked := false;
  begin
    perform public.upsert_meals(jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'user_id', user_b, 'title', 'impersonated',
      'meal_size', 'small', 'occurred_at', now(), 'occurred_local_date', current_date,
      'occurred_tz', 'UTC', 'occurred_utc_offset_minutes', 0)));
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: the RPC wrote a meal owned by user B';
  end if;

  -- 5. The RPC cannot land on user B's existing meal.
  insert_was_blocked := false;
  begin
    perform public.upsert_meals(jsonb_build_array(jsonb_build_object(
      'id', meal_b, 'user_id', user_a, 'title', 'hijacked', 'meal_size', 'small',
      'occurred_at', now(), 'occurred_local_date', current_date,
      'occurred_tz', 'UTC', 'occurred_utc_offset_minutes', 0)));
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: the RPC upserted onto user B''s meal';
  end if;

  -- 6. The composite foreign key holds even when the function is bypassed entirely.
  insert_was_blocked := false;
  begin
    insert into public.meal_items (id, meal_id, user_id, raw_name)
    values (gen_random_uuid(), meal_b, user_a, 'smuggled');
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: an item was attached to user B''s meal by writing the table directly';
  end if;

  -- 7. User B's meal is untouched by any of it.
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);

  select count(*) into visible_count from public.meal_items where meal_id = meal_b;
  if visible_count <> 0 then
    raise exception 'FAILED: user B''s meal gained % items', visible_count;
  end if;

  select count(*) into visible_count
  from public.meal_logs where id = meal_b and title = 'B lunch';
  if visible_count <> 1 then
    raise exception 'FAILED: user B''s meal was modified';
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  -- =====================================================================
  -- Bowel, wellbeing and context logs (migration 20260824190000)
  --
  -- All three are single-row tables following the symptom_logs template, so the checks are the
  -- same four every user-owned table must pass. They are driven from a loop rather than written
  -- out three times: a table added to the list is a table that gets tested, which is the
  -- property worth having.
  -- =====================================================================
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);

  insert into public.bowel_logs (id, user_id, bristol_type, urgency, difficulty, occurred_at,
    occurred_local_date, occurred_tz, occurred_utc_offset_minutes)
  values (gen_random_uuid(), user_b, 4, 'low', 'easy', now(), current_date, 'UTC', 0);

  insert into public.wellbeing_logs (id, user_id, occurred_at, occurred_local_date,
    occurred_tz, occurred_utc_offset_minutes)
  values (gen_random_uuid(), user_b, now(), current_date, 'UTC', 0);

  insert into public.context_logs (id, user_id, context_type, value_numeric, occurred_at,
    occurred_local_date, occurred_tz, occurred_utc_offset_minutes)
  values (gen_random_uuid(), user_b, 'stress', 4, now(), current_date, 'UTC', 0);

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  foreach table_name in array array['bowel_logs', 'wellbeing_logs', 'context_logs']
  loop
    -- 1. SELECT isolation: user B's row is invisible, so the table reads as empty to user A.
    execute format('select count(*) from public.%I', table_name) into visible_count;
    if visible_count <> 0 then
      raise exception 'FAILED: user A sees % rows in %, expected none of user B''s',
        visible_count, table_name;
    end if;

    -- 2. UPDATE isolation.
    execute format('update public.%I set note = ''HACKED'' where user_id = $1', table_name)
      using user_b;
    get diagnostics affected_count = row_count;
    if affected_count <> 0 then
      raise exception 'FAILED: user A updated % rows in % belonging to user B',
        affected_count, table_name;
    end if;

    -- 3. DELETE isolation.
    execute format('delete from public.%I where user_id = $1', table_name) using user_b;
    get diagnostics affected_count = row_count;
    if affected_count <> 0 then
      raise exception 'FAILED: user A deleted % rows from % belonging to user B',
        affected_count, table_name;
    end if;
  end loop;

  -- 4. INSERT impersonation refused, per table (the columns differ, so not a loop).
  insert_was_blocked := false;
  begin
    insert into public.bowel_logs (id, user_id, bristol_type, urgency, difficulty, occurred_at,
      occurred_local_date, occurred_tz, occurred_utc_offset_minutes)
    values (gen_random_uuid(), user_b, 4, 'low', 'easy', now(), current_date, 'UTC', 0);
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: user A inserted a bowel log owned by user B';
  end if;

  insert_was_blocked := false;
  begin
    insert into public.wellbeing_logs (id, user_id, occurred_at, occurred_local_date,
      occurred_tz, occurred_utc_offset_minutes)
    values (gen_random_uuid(), user_b, now(), current_date, 'UTC', 0);
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: user A inserted a wellbeing log owned by user B';
  end if;

  insert_was_blocked := false;
  begin
    insert into public.context_logs (id, user_id, context_type, value_numeric, occurred_at,
      occurred_local_date, occurred_tz, occurred_utc_offset_minutes)
    values (gen_random_uuid(), user_b, 'stress', 2, now(), current_date, 'UTC', 0);
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: user A inserted a context log owned by user B';
  end if;

  -- 5. A context row must carry the value its type calls for. This is a data-integrity rule
  --    rather than an RLS one, but a row the engine cannot interpret is worth catching here.
  insert_was_blocked := false;
  begin
    insert into public.context_logs (id, user_id, context_type, value_text, occurred_at,
      occurred_local_date, occurred_tz, occurred_utc_offset_minutes)
    values (gen_random_uuid(), user_a, 'stress', 'moderate', now(), current_date, 'UTC', 0);
  exception when others then insert_was_blocked := true;
  end;
  if not insert_was_blocked then
    raise exception 'FAILED: a stress entry was accepted carrying an exercise level';
  end if;

  -- 6. The user's own rows remain writable.
  insert into public.wellbeing_logs (id, user_id, occurred_at, occurred_local_date,
    occurred_tz, occurred_utc_offset_minutes)
  values (gen_random_uuid(), user_a, now(), current_date, 'UTC', 0);

  select count(*) into visible_count from public.wellbeing_logs;
  if visible_count <> 1 then
    raise exception 'FAILED: user A cannot record their own wellbeing log';
  end if;

  -- ---------------------------------------------------------------------
  -- pattern_findings (spec §86). Derived data, but every column is health content: a factor
  -- label is a food and an outcome is a symptom, so it is isolated exactly like a diary row.
  --
  -- Guarded because the migration may not be applied yet. A skip is announced loudly rather
  -- than passing quietly — a security check that silently covers nothing is worse than none,
  -- and the final summary below repeats whether this ran.
  -- ---------------------------------------------------------------------
  if not findings_present then
    raise notice 'SKIPPED: public.pattern_findings does not exist. Apply %',
      '20260906090000_pattern_findings.sql, then re-run — this table is NOT yet covered.';
  else
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', null, true);

    insert into public.pattern_findings (
      id, user_id, engine_version, factor_key, factor_label, factor_source,
      outcome_kind, analysis_start, analysis_end, window_key, status, confidence,
      exposed_count, control_count, unknown_count, absolute_difference,
      metrics, consistency, tracking_completeness, generated_at
    )
    values (
      gen_random_uuid(), user_b, '1.0.0', 'meal_item:dairy', 'Dairy', 'meal_item',
      'any_symptom', current_date - 30, current_date, 'later_same_day', 'moderate', 0.6,
      10, 12, 3, 0.25,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, now()
    );

    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', user_a, 'role', 'authenticated')::text,
      true
    );

    -- 1. SELECT isolation.
    select count(*) into visible_count from public.pattern_findings;
    if visible_count <> 0 then
      raise exception 'FAILED: user A sees % rows in pattern_findings, expected none',
        visible_count;
    end if;

    -- 2. UPDATE isolation. `status` rather than `note` — this table has no free-text column,
    -- which is itself deliberate.
    update public.pattern_findings set status = 'stronger_recurring_signal' where user_id = user_b;
    get diagnostics affected_count = row_count;
    if affected_count <> 0 then
      raise exception 'FAILED: user A updated % pattern_findings rows belonging to user B',
        affected_count;
    end if;

    -- 3. DELETE isolation.
    delete from public.pattern_findings where user_id = user_b;
    get diagnostics affected_count = row_count;
    if affected_count <> 0 then
      raise exception 'FAILED: user A deleted % pattern_findings rows belonging to user B',
        affected_count;
    end if;

    -- 4. INSERT impersonation refused.
    insert_was_blocked := false;
    begin
      insert into public.pattern_findings (
        id, user_id, engine_version, factor_key, factor_label, factor_source,
        outcome_kind, analysis_start, analysis_end, window_key, status, confidence,
        exposed_count, control_count, unknown_count, absolute_difference,
        metrics, consistency, tracking_completeness, generated_at
      )
      values (
        gen_random_uuid(), user_b, '1.0.0', 'meal_item:dairy', 'Dairy', 'meal_item',
        'any_symptom', current_date - 30, current_date, 'later_same_day', 'moderate', 0.6,
        10, 12, 3, 0.25,
        '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, now()
      );
    exception when others then insert_was_blocked := true;
    end;
    if not insert_was_blocked then
      raise exception 'FAILED: user A inserted a pattern finding owned by user B';
    end if;
  end if;

  -- ---------------------------------------------------------------------
  -- Act as an unauthenticated client.
  -- ---------------------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', null, true);

  anon_tables := array[
    'profiles', 'user_preferences', 'user_symptom_preferences', 'user_suspected_factors',
    'symptom_logs', 'meal_logs', 'meal_items', 'meal_tags',
    'bowel_logs', 'wellbeing_logs', 'context_logs'
  ];

  if findings_present then
    anon_tables := anon_tables || 'pattern_findings';
  end if;

  foreach table_name in array anon_tables
  loop
    execute format('select count(*) from public.%I', table_name) into visible_count;
    if visible_count <> 0 then
      raise exception 'FAILED: anonymous clients can read % rows in %', visible_count, table_name;
    end if;
  end loop;

  if findings_present then
    raise notice 'RLS isolation: ALL CHECKS PASSED (including pattern_findings)';
  else
    raise notice 'RLS isolation: ALL CHECKS PASSED — but pattern_findings was NOT covered';
  end if;
end;
$$;

-- Fixtures are discarded with the transaction, so the test leaves no residue whether it
-- passed or failed. Deleting auth.users would also cascade to profiles — the same cascade
-- account deletion relies on (spec §97).
rollback;
