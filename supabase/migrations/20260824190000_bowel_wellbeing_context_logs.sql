-- GutSignal — bowel, wellbeing and context logs
--
-- The three remaining event tables of Milestone 5. All follow the symptom_logs template: a
-- device-generated uuid primary key, four occurrence columns, a source, a deleted_at tombstone
-- and a server-owned updated_at driving the sync cursor.
--
-- Two of them deserve a note.
--
-- `wellbeing_logs` is the smallest table in the product and the one the pattern engine cannot
-- work without. It is the **control group**. The absence of a symptom log is not evidence of a
-- good day — it could equally mean the user was busy or forgot — so a good day only counts when
-- the user says so explicitly. That is the entire reason this exists as its own table rather
-- than being inferred from a gap in the data (spec §44, §59; CLAUDE.md §19).
--
-- `context_logs` stores a typed observation carrying exactly one value: scaled types carry a
-- number, exercise carries a level. The constraint enforcing that pairing is the same rule the
-- Zod schema states in the app — deliberately written the same way in both places, so the
-- agreement between them is checkable rather than assumed.
--
-- Deliberately absent from context: travel and menstrual-cycle observations. Spec §47 lists them
-- as possible *later, opt-in* additions and warns in the same breath against building an
-- overwhelming universal health diary. Asking every user for them would be that overreach.

create table public.bowel_logs (
  id                          uuid        primary key,
  user_id                     uuid        not null references auth.users (id) on delete cascade,

  -- The Bristol scale describes one observation. Nothing here maps a type to a condition, and
  -- nothing should (CLAUDE.md §17).
  bristol_type                smallint    not null check (bristol_type between 1 and 7),
  urgency                     text        not null check (urgency in ('none','low','moderate','high')),
  difficulty                  text        not null check (difficulty in ('easy','moderate','difficult')),
  -- Whether it felt unfinished. A reported sensation, not a clinical finding.
  incomplete                  boolean     not null default false,

  note                        text        check (note is null or length(note) <= 1000),
  source                      text        not null default 'manual' check (source in (
                                'manual', 'ai_confirmed', 'healthkit', 'imported')),

  occurred_at                 timestamptz not null,
  occurred_local_date         date        not null,
  occurred_tz                 text        not null check (length(occurred_tz) between 1 and 64),
  occurred_utc_offset_minutes smallint    not null check (
                                occurred_utc_offset_minutes between -900 and 900),

  deleted_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table public.wellbeing_logs (
  id                          uuid        primary key,
  user_id                     uuid        not null references auth.users (id) on delete cascade,

  -- No value column, by design. One tap. Anything that makes this slower makes the control
  -- group smaller, and a control group only the most diligent users produce is a biased one.
  note                        text        check (note is null or length(note) <= 1000),
  source                      text        not null default 'manual' check (source in (
                                'manual', 'ai_confirmed', 'healthkit', 'imported')),

  occurred_at                 timestamptz not null,
  occurred_local_date         date        not null,
  occurred_tz                 text        not null check (length(occurred_tz) between 1 and 64),
  occurred_utc_offset_minutes smallint    not null check (
                                occurred_utc_offset_minutes between -900 and 900),

  deleted_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table public.context_logs (
  id                          uuid        primary key,
  user_id                     uuid        not null references auth.users (id) on delete cascade,

  context_type                text        not null check (context_type in (
                                'stress', 'sleep_quality', 'exercise')),
  value_numeric               smallint    check (value_numeric is null
                                                 or value_numeric between 1 and 5),
  value_text                  text        check (value_text is null or value_text in (
                                'none', 'light', 'moderate', 'intense')),

  note                        text        check (note is null or length(note) <= 1000),
  source                      text        not null default 'manual' check (source in (
                                'manual', 'ai_confirmed', 'healthkit', 'imported')),

  occurred_at                 timestamptz not null,
  occurred_local_date         date        not null,
  occurred_tz                 text        not null check (length(occurred_tz) between 1 and 64),
  occurred_utc_offset_minutes smallint    not null check (
                                occurred_utc_offset_minutes between -900 and 900),

  deleted_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Exactly one value, matching the type. A stress entry carrying a text level, or an exercise
  -- entry carrying a 1–5 number, would be a row the engine could not interpret.
  constraint context_value_matches_type check (
    (context_type in ('stress','sleep_quality')
       and value_numeric is not null and value_text is null)
    or (context_type = 'exercise'
       and value_text is not null and value_numeric is null)
  )
);

comment on table public.wellbeing_logs is
  'Explicit good-day observations. The pattern engine control group, never inferred from missing symptom logs.';
comment on table public.bowel_logs is
  'Bowel movements the user recorded. A description of one observation, never a statement about the person.';
comment on table public.context_logs is
  'Stress, sleep and exercise. Read by the engine mainly as confounders.';

-- ---------------------------------------------------------------------------
-- updated_at — server-owned on insert as well as update, so the sync cursor
-- advances on one trusted clock.
-- ---------------------------------------------------------------------------
create trigger bowel_logs_set_updated_at
  before insert or update on public.bowel_logs
  for each row execute function private.set_updated_at_always();
create trigger wellbeing_logs_set_updated_at
  before insert or update on public.wellbeing_logs
  for each row execute function private.set_updated_at_always();
create trigger context_logs_set_updated_at
  before insert or update on public.context_logs
  for each row execute function private.set_updated_at_always();

-- ---------------------------------------------------------------------------
-- Indexes: timeline pagination, day grouping, and the sync pull.
-- ---------------------------------------------------------------------------
create index bowel_logs_user_occurred_idx     on public.bowel_logs (user_id, occurred_at desc);
create index bowel_logs_user_local_date_idx   on public.bowel_logs (user_id, occurred_local_date);
create index bowel_logs_user_updated_idx      on public.bowel_logs (user_id, updated_at);

create index wellbeing_logs_user_occurred_idx on public.wellbeing_logs (user_id, occurred_at desc);
create index wellbeing_logs_user_local_idx    on public.wellbeing_logs (user_id, occurred_local_date);
create index wellbeing_logs_user_updated_idx  on public.wellbeing_logs (user_id, updated_at);

create index context_logs_user_occurred_idx   on public.context_logs (user_id, occurred_at desc);
-- Context is almost always read as "this type, on this day", hence the third column.
create index context_logs_user_local_idx      on public.context_logs (user_id, occurred_local_date, context_type);
create index context_logs_user_updated_idx    on public.context_logs (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.bowel_logs     enable row level security;
alter table public.wellbeing_logs enable row level security;
alter table public.context_logs   enable row level security;

create policy "bowel_logs: read own" on public.bowel_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "bowel_logs: insert own" on public.bowel_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bowel_logs: update own" on public.bowel_logs
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "bowel_logs: delete own" on public.bowel_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "wellbeing_logs: read own" on public.wellbeing_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "wellbeing_logs: insert own" on public.wellbeing_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "wellbeing_logs: update own" on public.wellbeing_logs
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "wellbeing_logs: delete own" on public.wellbeing_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "context_logs: read own" on public.context_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "context_logs: insert own" on public.context_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "context_logs: update own" on public.context_logs
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "context_logs: delete own" on public.context_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.bowel_logs     to authenticated;
grant select, insert, update, delete on public.wellbeing_logs to authenticated;
grant select, insert, update, delete on public.context_logs   to authenticated;
