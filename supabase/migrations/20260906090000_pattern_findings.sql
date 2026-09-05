-- GutSignal — pattern findings
--
-- Snapshots of what the engine concluded, stored so a finding can be shown, revisited and
-- explained later without recomputing it, and so reports (M15) have something stable to cite.
--
-- **These are derived data, not source of truth.** Every row here is reproducible from the
-- user's logs by `src/domain/pattern-engine`, and the logs remain the only record of what
-- actually happened. That has two consequences worth stating up front:
--
--   * A finding may be regenerated at any time, so writes are upserts keyed on the computation
--     that produced them rather than inserts that accumulate duplicates.
--   * Deleting every row here loses nothing permanently. Account deletion still cascades, and
--     export still includes them, but they are a cache with provenance rather than a diary.
--
-- **There is deliberately no local mirror.** Findings are cheap to recompute from the local
-- SQLite logs and are always current when computed; a stale local copy could show a conclusion
-- the user's own logs no longer support, which is exactly the failure this product cannot
-- afford. The offline story for insights is "recompute", not "cache".
--
-- Every column is C3 sensitive health data: a factor label is a food, an outcome is a symptom.
-- RLS is mandatory and nothing here may ever reach analytics (CLAUDE.md §§28–29).

create table public.pattern_findings (
  id                    uuid        primary key,
  user_id               uuid        not null references auth.users (id) on delete cascade,

  -- Which build of the engine produced this. A finding computed under different rules is not
  -- comparable to one computed under these, so the version is part of its identity (spec §62).
  engine_version        text        not null check (length(engine_version) between 1 and 32),

  -- The factor examined. Stored denormalised because `factor_catalog` does not exist yet, and
  -- because a finding must stay readable even if the catalogue later renames something.
  factor_key            text        not null check (length(factor_key) between 1 and 120),
  factor_label          text        not null check (length(factor_label) between 1 and 120),
  factor_source         text        not null check (factor_source in (
                          'meal_tag', 'meal_item', 'context', 'meal_size'
                        )),

  outcome_kind          text        not null check (outcome_kind in (
                          'symptom_occurrence', 'symptom_severity', 'any_symptom',
                          'bowel_urgency', 'stool_consistency', 'wellbeing'
                        )),
  -- Set only for symptom-specific outcomes.
  outcome_symptom_type  text        check (outcome_symptom_type is null
                                           or length(outcome_symptom_type) between 1 and 64),

  analysis_start        date        not null,
  analysis_end          date        not null,
  window_key            text        not null check (window_key in (
                          'shortly_after', 'later_same_day', 'next_morning', 'next_day'
                        )),

  -- The five permitted states (spec §50). There is deliberately no 'confirmed_trigger'.
  status                text        not null check (status in (
                          'insufficient_data', 'emerging', 'moderate',
                          'stronger_recurring_signal', 'no_clear_pattern'
                        )),
  confidence            real        not null check (confidence between 0 and 1),

  -- Promoted out of the metrics blob because they are the numbers a user is most likely to be
  -- shown, sorted by, or to question — and a claim whose sample size needs a JSON parse to
  -- check is a claim that will not get checked.
  exposed_count         integer     not null check (exposed_count >= 0),
  control_count         integer     not null check (control_count >= 0),
  unknown_count         integer     not null check (unknown_count >= 0),
  absolute_difference   real        not null check (absolute_difference between -1 and 1),

  -- The rest of §62's reproducibility payload. JSONB because these are read as whole documents
  -- by the app and never filtered on in SQL.
  metrics               jsonb       not null,
  consistency           jsonb       not null,
  confounders           jsonb       not null default '[]'::jsonb,
  tracking_completeness jsonb       not null,

  -- Every reason confidence was held back, in the words shown to the user. Stored so the
  -- explanation cannot drift from the finding it explains.
  limitations           text[]      not null default '{}',

  generated_at          timestamptz not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint analysis_range_is_forwards check (analysis_start <= analysis_end)
);

comment on table public.pattern_findings is
  'Snapshots of engine conclusions. Derived from logs and reproducible from them; a cache with provenance, never a source of truth.';

-- ---------------------------------------------------------------------------
-- One row per computation.
--
-- A finding is identified by what produced it: whose logs, which factor, which outcome, over
-- which range, in which window, under which engine version. Recomputing the same question must
-- update the existing row rather than pile up near-duplicates the user would have to
-- disambiguate.
--
-- `nulls not distinct` because outcome_symptom_type is null for whole-day outcomes, and the
-- default SQL semantics would treat every such row as unique — quietly defeating the whole
-- constraint for exactly the outcomes that have no symptom type.
-- ---------------------------------------------------------------------------
create unique index pattern_findings_computation_idx
  on public.pattern_findings (
    user_id, factor_key, outcome_kind, outcome_symptom_type,
    analysis_start, analysis_end, window_key, engine_version
  )
  nulls not distinct;

-- ---------------------------------------------------------------------------
-- updated_at — server-owned, as everywhere else.
-- ---------------------------------------------------------------------------
create trigger pattern_findings_set_updated_at
  before insert or update on public.pattern_findings
  for each row
  execute function private.set_updated_at_always();

-- ---------------------------------------------------------------------------
-- Indexes
--
-- The Insights screen asks one question above all others: "what are this user's strongest
-- current findings?" That is the index that matters.
-- ---------------------------------------------------------------------------
create index pattern_findings_user_status_idx
  on public.pattern_findings (user_id, status, confidence desc);

create index pattern_findings_user_generated_idx
  on public.pattern_findings (user_id, generated_at desc);

-- Pattern detail and Ask My Gut both look up one factor's history.
create index pattern_findings_user_factor_idx
  on public.pattern_findings (user_id, factor_key, analysis_end desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.pattern_findings enable row level security;

create policy "pattern_findings: read own" on public.pattern_findings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "pattern_findings: insert own" on public.pattern_findings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pattern_findings: update own" on public.pattern_findings
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Deletable: regenerating an analysis should be able to clear what it replaces, and a user
-- clearing their insights is a reasonable thing to want.
create policy "pattern_findings: delete own" on public.pattern_findings
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.pattern_findings to authenticated;
