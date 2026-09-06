-- GutSignal — indexes for keyset sync pagination
--
-- The pull cursor moved from `updated_at` to `(updated_at, id)`. The reason is correctness and is
-- documented in ADR-0043 and `src/services/sync/cursors.ts`: `updated_at` is the transaction
-- timestamp, so a batched write gives every row the same value, and a tie group wider than one
-- page could never be paged past.
--
-- These indexes are what stop that fix from being slow in exactly the case it was written for.
--
-- The existing `(user_id, updated_at)` indexes can serve the range scan, but not the ordering:
-- Postgres would have to sort each tie group by `id` before applying the LIMIT. That is cheap for
-- a batch of fifty meals and ruinous for the scenario this is really about — a data migration
-- doing `UPDATE symptom_logs SET ...`, which stamps every row in the table with one timestamp and
-- makes the tie group the whole table. Sorting all of it, once per page, for fifty pages.
--
-- With `id` in the index the scan is already in cursor order, so each page is a range scan that
-- stops at the LIMIT regardless of how many rows share a timestamp.
--
-- The old indexes are dropped rather than kept: a two-column index whose columns are the leading
-- prefix of a three-column one earns nothing and still costs a write on every insert and update.

create index if not exists symptom_logs_user_updated_id_idx
  on public.symptom_logs (user_id, updated_at, id);
drop index if exists public.symptom_logs_user_updated_idx;

create index if not exists bowel_logs_user_updated_id_idx
  on public.bowel_logs (user_id, updated_at, id);
drop index if exists public.bowel_logs_user_updated_idx;

create index if not exists wellbeing_logs_user_updated_id_idx
  on public.wellbeing_logs (user_id, updated_at, id);
drop index if exists public.wellbeing_logs_user_updated_idx;

create index if not exists context_logs_user_updated_id_idx
  on public.context_logs (user_id, updated_at, id);
drop index if exists public.context_logs_user_updated_idx;

create index if not exists meal_logs_user_updated_id_idx
  on public.meal_logs (user_id, updated_at, id);
drop index if exists public.meal_logs_user_updated_idx;
