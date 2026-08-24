-- GutSignal — profiles
--
-- The first user-owned table. It establishes the patterns every later table follows:
--   * RLS enabled, policies scoped `to authenticated`, `(select auth.uid())` wrapped so the
--     function is evaluated once per query rather than once per row
--   * timestamptz everywhere, `text` over `varchar(n)`, check constraints for enums
--   * helper functions in a private schema with `search_path = ''` and execute revoked
--
-- Spec §77 (profiles), §91 (RLS is mandatory and release-blocking).

-- ---------------------------------------------------------------------------
-- Private schema for helper functions.
-- Anything SECURITY DEFINER in `public` is callable by anon/authenticated by default, which
-- makes it a public API endpoint. Keeping helpers out of `public` avoids that entirely.
-- ---------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text,
  -- IANA zone (e.g. 'Europe/London'). Day boundaries and every analysis window depend on
  -- the user's local day, never on UTC dates (spec §102).
  timezone                text        not null default 'UTC',
  tracking_style          text        not null default 'balanced'
                                      check (tracking_style in ('minimal', 'balanced', 'detailed')),
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated user. Created automatically when an auth user is inserted.';
comment on column public.profiles.timezone is
  'IANA time zone name used to resolve the user''s local day for grouping and analysis.';
comment on column public.profiles.tracking_style is
  'Controls how much detail logging screens ask for by default (spec §28).';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
--
-- Kept server-side rather than trusting the client: a device with a wrong clock, or an
-- offline record replayed later, must not be able to rewrite ordering metadata.
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile creation on sign-up
--
-- SECURITY DEFINER because it runs from an auth.users trigger, where the caller has no rights
-- on public.profiles. It is confined to a private schema, has an empty search_path, and writes
-- only the row belonging to the user being created — it takes no caller-supplied arguments.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- Apple and email sign-in both may omit a name; the app asks during onboarding.
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name',
                         new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- No DELETE policy by design: a profile row is owned by the auth user and is removed by the
-- cascade when the account is deleted (spec §97). Letting a client delete its profile while
-- the account survives would leave an authenticated user with no profile and no way back.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles: users read their own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: users insert their own"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles: users update their own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Explicit grants: a table in an exposed schema still needs privileges for the Data API
-- roles. `anon` is granted nothing — an unauthenticated client has no business here.
grant select, insert, update on public.profiles to authenticated;
