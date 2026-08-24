-- GutSignal — onboarding preferences
--
-- What the user tells us during onboarding (spec §24–§28). Three tables rather than one blob,
-- because these values have different lifetimes and different relational futures:
--
--   * user_preferences        — one row of settings, read as a unit
--   * user_symptom_preferences — the symptom catalogue this user tracks; symptom_logs will
--                                reference the same vocabulary, so it is normalized
--   * user_suspected_factors   — the user's own hypotheses; the pattern engine reads these to
--                                decide what to examine first, and they join to factor_catalog
--                                once that exists (M8)
--
-- Spec §78 warns against dumping everything into JSON. `goals` stays as an array because it is
-- personalization only — nothing will ever join to it.

-- ---------------------------------------------------------------------------
-- Shared vocabularies.
--
-- Check constraints rather than Postgres enums: adding a value to an enum is a schema
-- migration with locking implications, while widening a check constraint is cheap. These
-- lists must stay in step with src/domain/onboarding/options.ts, which a test asserts.
-- ---------------------------------------------------------------------------

create table public.user_preferences (
  user_id               uuid primary key references auth.users (id) on delete cascade,

  bowel_pattern         text check (bowel_pattern in (
                          'mostly_loose', 'mostly_constipated', 'mixed', 'varies', 'unsure'
                        )),

  -- Personalization only (spec §24). Never joined, so an array is the right shape.
  goals                 text[]      not null default '{}',

  -- Privacy defaults are OFF. The app must be fully usable with every one of these
  -- disabled (spec §94), so nothing here defaults to true on the user's behalf.
  keep_meal_photos      boolean     not null default false,
  analytics_consent     boolean     not null default false,
  ai_processing_consent boolean     not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.user_preferences is
  'One row per user. Privacy-affecting flags default to false and are opt-in.';

create table public.user_symptom_preferences (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  symptom_type text        not null check (symptom_type in (
                 'bloating', 'abdominal_pain', 'cramping', 'loose_stool', 'constipation',
                 'urgency', 'gas', 'incomplete_evacuation', 'nausea', 'heartburn', 'other'
               )),
  created_at   timestamptz not null default now(),

  primary key (user_id, symptom_type)
);

comment on table public.user_symptom_preferences is
  'Symptoms this user chose to track. A tracking preference, not a diagnosis (spec §25).';

create table public.user_suspected_factors (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  -- Canonical key ('coffee', 'dairy'), or 'custom:<slug>' for a user-defined factor.
  factor_key   text        not null check (length(factor_key) between 1 and 64),
  -- The user's own words, kept verbatim for custom factors (spec §54: never destroy raw input).
  custom_label text        check (custom_label is null or length(custom_label) between 1 and 120),
  created_at   timestamptz not null default now(),

  primary key (user_id, factor_key),

  -- A custom factor must carry its label; a catalogue factor must not invent one.
  constraint custom_factors_have_a_label check (
    (factor_key like 'custom:%' and custom_label is not null)
    or (factor_key not like 'custom:%' and custom_label is null)
  )
);

comment on table public.user_suspected_factors is
  'What the user already suspects affects them (spec §27). A hypothesis to examine, never a finding.';

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row
  execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- The child tables are keyed on user_id directly rather than joining back to a parent, so a
-- policy check is an index lookup on the primary key rather than a subquery per row.
-- ---------------------------------------------------------------------------
alter table public.user_preferences         enable row level security;
alter table public.user_symptom_preferences enable row level security;
alter table public.user_suspected_factors   enable row level security;

create policy "user_preferences: read own" on public.user_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_preferences: insert own" on public.user_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_preferences: update own" on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "user_symptom_preferences: read own" on public.user_symptom_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_symptom_preferences: insert own" on public.user_symptom_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
-- Deletable: changing which symptoms you track means removing rows. Unlike profiles, these
-- rows are user-managed content rather than account identity.
create policy "user_symptom_preferences: delete own" on public.user_symptom_preferences
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "user_suspected_factors: read own" on public.user_suspected_factors
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_suspected_factors: insert own" on public.user_suspected_factors
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_suspected_factors: delete own" on public.user_suspected_factors
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update on public.user_preferences to authenticated;
grant select, insert, delete on public.user_symptom_preferences to authenticated;
grant select, insert, delete on public.user_suspected_factors to authenticated;
