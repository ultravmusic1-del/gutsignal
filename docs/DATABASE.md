# GutSignal — Database

**Project:** `mrqxmkxhyohlywiziofz` (`gutsignal`, ap-northeast-2, Postgres 17)
**Last updated:** 2026-08-24

Schema of record lives in `supabase/migrations/`. Nothing is changed through the dashboard —
a change that is not in a migration file does not exist (`CLAUDE.md` §13).

---

## 1. Conventions

Every user-owned table follows these, without exception:

| Rule                                              | Why                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| RLS enabled, policies scoped `to authenticated`   | The database is the enforcement point, not the UI (spec §91)                                 |
| `(select auth.uid())` inside policies             | Evaluated once per query instead of once per row                                             |
| Index on every column used by a policy            | An RLS predicate is a filter on every read                                                   |
| `timestamptz`, never `timestamp`                  | A naive timestamp cannot be resolved to a user's local day                                   |
| `text` + `check` constraint, not `varchar(n)`     | No artificial limits; constraints express intent                                             |
| Helper functions in `private`, `search_path = ''` | Anything `SECURITY DEFINER` in `public` is callable by `anon` and `authenticated` by default |
| `updated_at` set by trigger                       | A device with a wrong clock must not rewrite ordering metadata                               |

Event tables (from Milestone 5) additionally carry `occurred_at timestamptz`,
`occurred_local_date date`, `occurred_tz text` and `source`. See `PROJECT_PLAN.md` §4.2 for
why the local date is stored rather than derived.

---

## 2. Tables

### `public.profiles` — migration `20260824100000_profiles.sql`

One row per authenticated user, created automatically on sign-up.

| Column                      | Type                                  | Notes                                                                   |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `id`                        | `uuid` PK                             | FK → `auth.users(id)` `on delete cascade`                               |
| `display_name`              | `text`                                | From Apple/email metadata if offered; otherwise asked during onboarding |
| `timezone`                  | `text` not null, default `'UTC'`      | IANA zone. Resolves the user's local day for grouping and analysis      |
| `tracking_style`            | `text` not null, default `'balanced'` | `minimal` \| `balanced` \| `detailed` (spec §28)                        |
| `onboarding_completed_at`   | `timestamptz`                         | Null until onboarding finishes; drives the boot branch added in M4      |
| `created_at` / `updated_at` | `timestamptz` not null                | `updated_at` maintained by trigger                                      |

**Policies:** select / insert / update, each `using` and `with check` on
`(select auth.uid()) = id`.

**There is deliberately no DELETE policy.** A profile is owned by its auth user and disappears
with it via the cascade (spec §97). Allowing a client to delete its profile while the account
survives would strand an authenticated user with no profile and no route back.

**Functions** (both in `private`, execute revoked from `public`, `anon`, `authenticated`):

- `private.set_updated_at()` — `before update` trigger on `profiles`.
- `private.handle_new_user()` — `after insert` on `auth.users`; `SECURITY DEFINER` because it
  runs where the caller has no rights on `public.profiles`. It takes no caller-supplied
  arguments and writes only the row for the user being created.

### Onboarding preferences — migration `20260824120000_onboarding_preferences.sql`

Three tables rather than one JSON blob, because they have different relational futures
(spec §78).

**`public.user_preferences`** — one row per user.

| Column                  | Type                                  | Notes                                                                                                                |
| ----------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `user_id`               | `uuid` PK                             | FK → `auth.users(id)` cascade                                                                                        |
| `bowel_pattern`         | `text`                                | `mostly_loose` \| `mostly_constipated` \| `mixed` \| `varies` \| `unsure`. Never mapped to an IBS subtype (spec §26) |
| `goals`                 | `text[]` not null, default `{}`       | Personalization only; nothing joins to it, so an array is the right shape                                            |
| `keep_meal_photos`      | `boolean` not null, default **false** | Opt-in retention (spec §93)                                                                                          |
| `analytics_consent`     | `boolean` not null, default **false** |                                                                                                                      |
| `ai_processing_consent` | `boolean` not null, default **false** |                                                                                                                      |

Every privacy-affecting flag defaults to **false**. The app must be fully usable with all of
them off (spec §94), so nothing opts the user in on their behalf.

**`public.user_symptom_preferences`** — `(user_id, symptom_type)`, one row per tracked symptom.
Normalized because `symptom_logs` will share the same vocabulary. A tracking preference, not a
diagnosis (spec §25).

**`public.user_suspected_factors`** — `(user_id, factor_key)`, with `custom_label` for
user-defined factors. A check constraint enforces that a `custom:` key carries a label and a
catalogue key does not, so the pattern engine can never receive a factor it cannot name. These
are hypotheses to examine, never findings.

Symptom preferences and suspected factors are **deletable** by their owner — unlike `profiles`,
these are user-managed content rather than account identity.

---

### `public.symptom_logs` — migration `20260824140000_symptom_logs.sql`

The first user **event** table, and the template the remaining log tables follow.

| Column                        | Type                                | Notes                                                                        |
| ----------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `id`                          | `uuid` PK                           | **Generated on the device**, before the network is involved                  |
| `user_id`                     | `uuid` not null                     | FK → `auth.users(id)` `on delete cascade`                                    |
| `symptom_type`                | `text` not null                     | Checked against the same keys as `SYMPTOM_KEYS`; a test asserts parity       |
| `severity`                    | `smallint` not null                 | `between 1 and 10`. An intensity the user reported, never a clinical grade   |
| `note`                        | `text`                              | ≤ 1000 chars. Longer belongs in a journal entry (M7)                         |
| `source`                      | `text` not null, default `'manual'` | `manual`                                                                     | `ai_confirmed` | `healthkit` | `imported` |
| `occurred_at`                 | `timestamptz` not null              | The instant — gives ordering                                                 |
| `occurred_local_date`         | `date` not null                     | The user's calendar day, computed on the device — gives day grouping         |
| `occurred_tz`                 | `text` not null                     | IANA zone they were in, so the above is reconstructable                      |
| `occurred_utc_offset_minutes` | `smallint` not null                 | Offset then in force; disambiguates a repeated local hour at a DST fall-back |
| `deleted_at`                  | `timestamptz`                       | Tombstone. Set instead of deleting, so the deletion replicates               |
| `created_at` / `updated_at`   | `timestamptz` not null              | `updated_at` maintained by trigger on **insert and update**                  |

**Why four occurrence columns.** Storing only the instant makes "today" ambiguous after travel
or a DST change; storing only local time loses ordering. Day grouping and every pattern-engine
window read `occurred_local_date`, never the UTC date. This is risk R-02 — see ADR-0031.

**Why `updated_at` is server-owned on insert too.** Unlike `profiles`, this table is pulled
incrementally: the sync cursor asks for "everything changed at or after this timestamp". If a
device with a wrong clock could set its own `updated_at`, it could place a row permanently
behind every other device's cursor and make it invisible to them.
`private.set_updated_at_always()` therefore fires `before insert or update`.

**Indexes:** `(user_id, occurred_at desc)` for timeline pagination,
`(user_id, occurred_local_date)` for day grouping, `(user_id, updated_at)` for the sync pull.

**Policies:** select / insert / update / delete on `(select auth.uid()) = user_id`, scoped
`to authenticated`.

**Why DELETE is granted here but not on `profiles`.** The app tombstones rather than deletes, but
account deletion and a future "erase this entry permanently" both need a real delete. Withholding
it would push that work onto a service-role path, which is strictly worse.

**The threat specific to device-generated ids.** Because the client chooses the primary key, the
check that matters is not only "can user A insert as user B" but "can user A's upsert land on
user B's row". `rls_isolation.sql` asserts both, and that user B's row is untouched either way.

### Meals — migrations `20260824170000_meal_logs.sql`, `20260824170100_upsert_meals.sql`

The first **aggregate**: `meal_logs` (the occasion), `meal_items` (what was eaten) and
`meal_tags` (how it is described). Three tables rather than JSON columns, because the engine's
central question — "what happened after coffee?" — becomes an index lookup at M8 and a text
search over a blob otherwise (spec §78).

`meal_logs` carries the same four occurrence columns, `source`, `deleted_at` tombstone and
server-owned `updated_at` as `symptom_logs`, plus `title`, `meal_size`
(`small` | `medium` | `large`), `note` and `photo_asset_id` (null until photo retention at M7).

`meal_items` holds `raw_name` — the user's own words, **never overwritten** — alongside
`canonical_factor_id` and `confidence`, both null until normalisation at M8, plus
`user_confirmed` and `position`.

`meal_tags` is one row per tag, checked against six values. `large` is deliberately absent
(it is `meal_size`) and so is `late` (derivable from `occurred_at`) — see §12.6 of the plan.

**The composite foreign key.** `meal_logs` has a redundant `unique (id, user_id)` whose only
purpose is to be the target of `foreign key (meal_id, user_id)` on both children. Without it,
RLS alone would allow a client to insert items carrying **their own** `user_id` but pointing at
**someone else's** meal. That is not a data leak — the victim's policies still hide those rows —
but it would let one account attach junk to another's records. The composite key makes it
impossible rather than merely invisible.

**`public.upsert_meals(jsonb)`.** The only client-callable function in the project. Takes an
array of complete meals and writes each one — parent, items, tags — in a single transaction, so
a meal can never reach the server without its contents. **`security invoker`**: it is a
transaction boundary, not a privilege escalation, and can do nothing the caller could not do one
statement at a time. `search_path` pinned empty, every name schema-qualified,
`execute` revoked from `public` and `anon` and granted to `authenticated` only.

**Policies:** select / insert / update / delete on `(select auth.uid()) = user_id` for
`meal_logs` and `meal_items`; select / insert / delete for `meal_tags` (a tag is replaced, never
edited in place). Children are checked on their own `user_id` rather than joining back to the
parent — an index lookup per row instead of a subquery (§4.4).

**Indexes:** `(user_id, occurred_at desc)`, `(user_id, occurred_local_date)` and
`(user_id, updated_at)` on `meal_logs`; `(meal_id)` and `(user_id, canonical_factor_id)` on
`meal_items`; `(user_id, tag)` on `meal_tags`.

### Bowel, wellbeing and context — migration `20260824190000_bowel_wellbeing_context_logs.sql`

Three single-row event tables following the `symptom_logs` template exactly: device-generated
uuid primary key, four occurrence columns, `source`, `deleted_at` tombstone, and a server-owned
`updated_at` driving the sync cursor. RLS is the same four policies on
`(select auth.uid()) = user_id`, scoped `to authenticated`.

`bowel_logs` — `bristol_type` (1–7), `urgency`, `difficulty`, `incomplete`. The Bristol scale
describes one observation; nothing maps a type to a condition, and nothing should (CLAUDE.md
§17).

`wellbeing_logs` — the smallest table here and the one the pattern engine cannot work without.
It is the **control group**. Absence of a symptom log is not evidence of a good day, so a good
day only counts when the user says so explicitly (spec §44, §59). It has no value column by
design: spec §44 asks for one tap, and every extra second biases the control set toward the most
diligent users.

`context_logs` — a typed observation carrying **exactly one** value: `stress` and
`sleep_quality` carry `value_numeric` (1–5), `exercise` carries `value_text`. The
`context_value_matches_type` constraint enforces the pairing, and the app's Zod schema states
the same rule the same way — a row carrying the wrong kind of value is one the engine could not
interpret. Its day index includes `context_type`, because context is almost always read as
"this type, on this day".

## 3. Security verification

`supabase/tests/rls_isolation.sql` is a self-contained, repeatable isolation test covering
**every** user-owned table. A new table without an entry here is unfinished.

It creates two users, then asserts as user A that they:

1. see exactly one profile row (their own);
2. cannot read user B's row;
3. cannot update user B's row;
4. cannot delete any row (no DELETE policy exists);
5. cannot insert a row owned by user B;
6. **can** update their own row;
7. cannot set `updated_at` themselves - the trigger overrides it;

and, for each preference table, that user A sees only their own rows, cannot read, delete or
insert on behalf of user B, and that a custom factor without a label is rejected. Finally, that
an anonymous client sees nothing at all in any table.

```bash
psql "$DATABASE_URL" -f supabase/tests/rls_isolation.sql
```

Executed against the live project on 2026-08-24 after each migration: **all checks passed**,
fixtures removed, `get_advisors(security)` returned no findings.

> Note for whoever edits this test: `updated_at > created_at` cannot be asserted inside a
> single transaction, because `now()` is the transaction timestamp and both values are equal.
> The property worth testing is that the client cannot dictate the value at all.

---

## 4. Auth configuration (owner actions)

| Setting              | State on 2026-08-24 | Action                                                                                                                        |
| -------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Email provider       | **Enabled**         | —                                                                                                                             |
| Apple provider       | **Not enabled**     | Enable under Authentication → Providers → Apple, with the Services ID / bundle identifier, before Sign in with Apple can work |
| `disable_signup`     | `false`             | —                                                                                                                             |
| `mailer_autoconfirm` | `false`             | Correct: codes must be verified                                                                                               |

The app already handles the gap: if the OS offers Apple while the backend provider is
disabled, the returned error is classified as `apple_unavailable` and the user is pointed at
email sign-in rather than shown a generic failure.

---

## 5. Planned tables

Milestone 5's logging tables are complete. `journal_entries` arrives with the journal at
Milestone 7. Milestone 7 adds
`ai_extraction_candidates` and `ai_usage_events`, and Milestone 8 adds `factor_catalog`,
`factor_aliases` and `pattern_findings`. Each arrives with its own migration, its own RLS
policies, and its own entry in the isolation test — a table without both is not finished.
