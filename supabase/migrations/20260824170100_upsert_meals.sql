-- GutSignal — the meal aggregate upsert
--
-- Symptoms sync as a plain table upsert because a symptom is one row. A meal is three tables,
-- and the failure mode of writing them separately is not a harmless partial write: a meal that
-- reaches the server without its items reads to the pattern engine as an eating occasion with
-- no exposures — a data point that never happened, silently weakening every comparison drawn
-- from it. So the whole aggregate is written by one function, in one transaction.
--
-- `security invoker`, so RLS still applies exactly as it would to a direct insert. This
-- function is a transaction boundary, not a privilege escalation: it can do nothing the caller
-- could not already do one statement at a time. `search_path` is pinned empty and every name is
-- schema-qualified, so a caller cannot shadow a table or function it resolves.
--
-- Items and tags are replaced wholesale rather than diffed. The client always sends the
-- complete aggregate, ids are device-generated and stable, and a diff would be a second place
-- for "what is in this meal?" to be decided — the sort of duplicated truth that goes wrong
-- quietly. See ADR-0034.

create or replace function public.upsert_meals(payloads jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  meal      jsonb;
  -- v_ prefixed so nothing here can be read as a column reference. plpgsql resolves bare
  -- names against the statement's tables first, and `meal_id` is a column on two of them.
  v_meal_id uuid;
  v_owner   uuid;
begin
  if jsonb_typeof(payloads) is distinct from 'array' then
    raise exception 'upsert_meals expects a JSON array of meals';
  end if;

  for meal in select value from jsonb_array_elements(payloads)
  loop
    v_meal_id := (meal->>'id')::uuid;
    v_owner   := (meal->>'user_id')::uuid;

    if v_meal_id is null or v_owner is null then
      raise exception 'upsert_meals: every meal needs an id and a user_id';
    end if;

    -- The parent first: the children's composite foreign key requires it to exist, and RLS
    -- decides here whether this caller may write this meal at all.
    insert into public.meal_logs (
      id, user_id, title, meal_size, note, source, photo_asset_id,
      occurred_at, occurred_local_date, occurred_tz, occurred_utc_offset_minutes,
      deleted_at, created_at
    )
    values (
      v_meal_id,
      v_owner,
      meal->>'title',
      meal->>'meal_size',
      meal->>'note',
      coalesce(meal->>'source', 'manual'),
      meal->>'photo_asset_id',
      (meal->>'occurred_at')::timestamptz,
      (meal->>'occurred_local_date')::date,
      meal->>'occurred_tz',
      (meal->>'occurred_utc_offset_minutes')::smallint,
      (meal->>'deleted_at')::timestamptz,
      coalesce((meal->>'created_at')::timestamptz, now())
    )
    on conflict (id) do update set
      title                       = excluded.title,
      meal_size                   = excluded.meal_size,
      note                        = excluded.note,
      source                      = excluded.source,
      photo_asset_id              = excluded.photo_asset_id,
      occurred_at                 = excluded.occurred_at,
      occurred_local_date         = excluded.occurred_local_date,
      occurred_tz                 = excluded.occurred_tz,
      occurred_utc_offset_minutes = excluded.occurred_utc_offset_minutes,
      deleted_at                  = excluded.deleted_at;

    -- Replace the contents. RLS confines both the delete and the insert to the caller's rows.
    delete from public.meal_items where meal_items.meal_id = v_meal_id;
    delete from public.meal_tags  where meal_tags.meal_id  = v_meal_id;

    insert into public.meal_items (
      id, meal_id, user_id, raw_name, canonical_factor_id, confidence, user_confirmed, position
    )
    select
      (item->>'id')::uuid,
      v_meal_id,
      v_owner,
      item->>'raw_name',
      (item->>'canonical_factor_id')::uuid,
      (item->>'confidence')::real,
      coalesce((item->>'user_confirmed')::boolean, false),
      coalesce((item->>'position')::smallint, 0)
    from jsonb_array_elements(coalesce(meal->'items', '[]'::jsonb)) as item;

    insert into public.meal_tags (meal_id, user_id, tag)
    select v_meal_id, v_owner, tag_value #>> '{}'
    from jsonb_array_elements(coalesce(meal->'tags', '[]'::jsonb)) as tag_value;
  end loop;
end;
$fn$;

comment on function public.upsert_meals(jsonb) is
  'Writes complete meal aggregates in one transaction. security invoker, so RLS applies unchanged.';

revoke execute on function public.upsert_meals(jsonb) from public, anon;
grant execute on function public.upsert_meals(jsonb) to authenticated;
