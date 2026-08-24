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

Milestone 5 adds the logging tables (`meal_logs`, `meal_items`, `meal_tags`, `symptom_logs`,
`bowel_logs`, `wellbeing_logs`, `context_logs`, `journal_entries`), Milestone 7 adds
`ai_extraction_candidates` and `ai_usage_events`, and Milestone 8 adds `factor_catalog`,
`factor_aliases` and `pattern_findings`. Each arrives with its own migration, its own RLS
policies, and its own entry in the isolation test — a table without both is not finished.
