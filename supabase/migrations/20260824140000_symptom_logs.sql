-- GutSignal — symptom logs
--
-- The first user event table, and the template the remaining log tables (meals, bowel,
-- wellbeing, context) will follow. Three things about it are deliberate:
--
--   * `id` is supplied by the device, not generated here. A log exists on the phone before it
--     has ever touched the network, and sync is an upsert on that id — which is what makes a
--     retry after an ambiguous timeout update rather than duplicate (docs/PROJECT_PLAN.md §6).
--
--   * Four occurrence columns, not one. Storing only the instant makes "today" ambiguous after
--     travel or a DST change; storing only local time loses ordering. Day grouping reads
--     `occurred_local_date`, which the device computes once, in the user's zone, at log time.
--     This is risk R-02 — the most likely source of silent corruption in the product.
--
--   * Deletes are tombstones. A hard delete looks, to a second device, exactly like a row that
--     never arrived. `deleted_at` lets the deletion itself replicate (§4.1).
--
-- A symptom log is an observation the user reported. It is not a diagnosis and carries no
-- clinical interpretation (CLAUDE.md §17).

create table public.symptom_logs (
  -- Generated on the device, before the network is involved.
  id                          uuid        primary key,
  user_id                     uuid        not null references auth.users (id) on delete cascade,

  -- Must stay in step with SYMPTOM_KEYS in src/domain/onboarding/options.ts, which a test
  -- asserts by reading this file. A check constraint rather than an enum: widening a check is
  -- cheap, while adding an enum value is a migration with locking implications.
  symptom_type                text        not null check (symptom_type in (
                                'bloating', 'abdominal_pain', 'cramping', 'loose_stool',
                                'constipation', 'urgency', 'gas', 'incomplete_evacuation',
                                'nausea', 'heartburn', 'other'
                              )),

  -- How strongly the user said it felt. An intensity, never a severity grading with clinical
  -- meaning.
  severity                    smallint    not null check (severity between 1 and 10),

  -- The user's own words. Anything longer belongs in a journal entry (M7).
  note                        text        check (note is null or length(note) <= 1000),

  -- Unconfirmed AI output never reaches this table at all; it waits in
  -- ai_extraction_candidates until the user confirms it (§4.1, CLAUDE.md §23).
  source                      text        not null default 'manual' check (source in (
                                'manual', 'ai_confirmed', 'healthkit', 'imported'
                              )),

  -- When it happened, from four angles. See the note above.
  occurred_at                 timestamptz not null,
  occurred_local_date         date        not null,
  occurred_tz                 text        not null check (length(occurred_tz) between 1 and 64),
  occurred_utc_offset_minutes smallint    not null check (
                                occurred_utc_offset_minutes between -900 and 900
                              ),

  deleted_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.symptom_logs is
  'Symptoms the user reported, with the local day they occurred on. Observations, not diagnoses.';

comment on column public.symptom_logs.occurred_local_date is
  'The user''s calendar day at occurred_at, computed on the device in occurred_tz. Day grouping and every pattern-engine window read this, never the UTC date.';

comment on column public.symptom_logs.deleted_at is
  'Tombstone. Set instead of deleting the row so the deletion replicates to other devices.';

-- ---------------------------------------------------------------------------
-- updated_at
--
-- Server-maintained on insert as well as update, so the sync cursor advances on a single
-- trusted clock. A device with a skewed clock cannot write itself into the past and become
-- invisible to the next pull.
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at_always()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at_always() from public, anon, authenticated;

create trigger symptom_logs_set_updated_at
  before insert or update on public.symptom_logs
  for each row
  execute function private.set_updated_at_always();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Timeline pagination (§4.5).
create index symptom_logs_user_occurred_idx
  on public.symptom_logs (user_id, occurred_at desc);

-- Day grouping and the pattern engine's windows.
create index symptom_logs_user_local_date_idx
  on public.symptom_logs (user_id, occurred_local_date);

-- The sync pull: "everything of mine that changed since my cursor".
create index symptom_logs_user_updated_idx
  on public.symptom_logs (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- `(select auth.uid())` is wrapped so Postgres evaluates it once per query rather than once
-- per row, and policies are scoped `to authenticated` so the anon role is never considered.
--
-- Delete is granted even though the app tombstones rather than deletes: account deletion and
-- a future "erase this entry permanently" both need it, and withholding it would push that
-- work to a service-role path, which is strictly worse.
-- ---------------------------------------------------------------------------
alter table public.symptom_logs enable row level security;

create policy "symptom_logs: read own" on public.symptom_logs
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "symptom_logs: insert own" on public.symptom_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "symptom_logs: update own" on public.symptom_logs
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "symptom_logs: delete own" on public.symptom_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.symptom_logs to authenticated;
