-- GutSignal — meal logs
--
-- A meal is an **aggregate**: the occasion (`meal_logs`), what was eaten (`meal_items`) and how
-- it is described (`meal_tags`). Three tables rather than one row with JSON columns, because
-- the pattern engine's central question — "what happened after coffee?" — becomes an index
-- lookup once `factor_catalog` lands at M8, and a text search over a blob otherwise (spec §78).
--
-- Two things here are specific to this being an aggregate written offline:
--
--   * **Children are owned by the parent's user, enforced by the database.** `meal_logs` carries
--     a redundant `unique (id, user_id)` purely so the children can reference it with a
--     composite foreign key. Without it, RLS alone would permit a client to insert items
--     carrying *their own* user_id but pointing at *someone else's* meal — not a data leak,
--     since the victim's policies would still hide those rows, but a way to attach junk to
--     another account's records. The composite key makes it impossible rather than merely
--     invisible.
--
--   * **The whole aggregate is written by one function.** `public.upsert_meals` replaces a
--     meal's items and tags inside a single transaction, so a meal can never reach the server
--     without its contents. A meal that arrived with no items is not a harmless partial write:
--     the engine would read it as an eating occasion with no exposures, which is a data point
--     that never happened. See ADR-0034.

create table public.meal_logs (
  -- Generated on the device, before the network is involved.
  id                          uuid        primary key,
  user_id                     uuid        not null references auth.users (id) on delete cascade,

  title                       text        not null check (length(title) between 1 and 120),
  meal_size                   text        not null check (meal_size in ('small', 'medium', 'large')),
  note                        text        check (note is null or length(note) <= 1000),

  source                      text        not null default 'manual' check (source in (
                                'manual', 'ai_confirmed', 'healthkit', 'imported'
                              )),

  -- Set when a retained photo backs this meal (M7). Null otherwise; photos are opt-in.
  photo_asset_id              text,

  occurred_at                 timestamptz not null,
  occurred_local_date         date        not null,
  occurred_tz                 text        not null check (length(occurred_tz) between 1 and 64),
  occurred_utc_offset_minutes smallint    not null check (
                                occurred_utc_offset_minutes between -900 and 900
                              ),

  deleted_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Redundant given the primary key, but required as the composite FK target below.
  unique (id, user_id)
);

comment on table public.meal_logs is
  'Meals the user recorded. The parent of an aggregate completed by meal_items and meal_tags.';

create table public.meal_items (
  id                  uuid    primary key,
  meal_id             uuid    not null,
  user_id             uuid    not null,

  -- The user's own words, kept verbatim. Normalisation adds a canonical factor alongside this;
  -- it never rewrites it (spec §54).
  raw_name            text    not null check (length(raw_name) between 1 and 80),

  -- Populated by normalisation at M8, against factor_catalog.
  canonical_factor_id uuid,

  -- Extraction confidence. Null for anything the user typed themselves.
  confidence          real    check (confidence is null or confidence between 0 and 1),

  -- False until a human agrees the item is really in the meal. AI output that has not been
  -- confirmed never reaches this table at all (CLAUDE.md §23); this flag covers the case where
  -- a confirmed meal still contains an item the user did not explicitly review.
  user_confirmed      boolean not null default false,

  position            smallint not null default 0,

  foreign key (meal_id, user_id)
    references public.meal_logs (id, user_id) on delete cascade
);

comment on column public.meal_items.raw_name is
  'What the user actually wrote. Never overwritten — normalisation adds canonical_factor_id alongside it.';

create table public.meal_tags (
  meal_id uuid not null,
  user_id uuid not null,
  tag     text not null check (tag in (
            'caffeinated', 'alcoholic', 'spicy', 'rich_high_fat', 'restaurant', 'homemade'
          )),

  primary key (meal_id, tag),

  foreign key (meal_id, user_id)
    references public.meal_logs (id, user_id) on delete cascade
);

comment on table public.meal_tags is
  'User-asserted descriptions of a meal. "large" is meal_size and "late" is derivable from occurred_at, so neither is a tag.';

-- ---------------------------------------------------------------------------
-- updated_at — server-owned, on insert as well as update, so the sync cursor
-- advances on one trusted clock. Same reasoning as symptom_logs.
-- ---------------------------------------------------------------------------
create trigger meal_logs_set_updated_at
  before insert or update on public.meal_logs
  for each row
  execute function private.set_updated_at_always();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index meal_logs_user_occurred_idx   on public.meal_logs (user_id, occurred_at desc);
create index meal_logs_user_local_date_idx on public.meal_logs (user_id, occurred_local_date);
create index meal_logs_user_updated_idx    on public.meal_logs (user_id, updated_at);

create index meal_items_meal_idx   on public.meal_items (meal_id);
create index meal_items_factor_idx on public.meal_items (user_id, canonical_factor_id);
create index meal_tags_tag_idx     on public.meal_tags (user_id, tag);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Children carry their own user_id and are checked directly rather than joining back to the
-- parent: an index lookup per row instead of a subquery (docs/PROJECT_PLAN.md §4.4).
-- ---------------------------------------------------------------------------
alter table public.meal_logs  enable row level security;
alter table public.meal_items enable row level security;
alter table public.meal_tags  enable row level security;

create policy "meal_logs: read own" on public.meal_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "meal_logs: insert own" on public.meal_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "meal_logs: update own" on public.meal_logs
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "meal_logs: delete own" on public.meal_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "meal_items: read own" on public.meal_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "meal_items: insert own" on public.meal_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "meal_items: update own" on public.meal_items
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "meal_items: delete own" on public.meal_items
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "meal_tags: read own" on public.meal_tags
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "meal_tags: insert own" on public.meal_tags
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "meal_tags: delete own" on public.meal_tags
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.meal_logs  to authenticated;
grant select, insert, update, delete on public.meal_items to authenticated;
grant select, insert, delete         on public.meal_tags  to authenticated;
