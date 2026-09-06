# GutSignal — Privacy and security

What protects the user's health data, where each protection lives, and — as importantly — what is
not protected yet. `CLAUDE.md` §28–§30 and §58 are the rules; this is the record of how they are
met and where they are not.

Written during Milestone 16. Every claim here is one an engineer can check in the code, and every
gap is listed rather than left for someone to discover.

---

## 1. What the app holds

| Where                         | What                                                                   | Protection                                                                     |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Local SQLite (`gutsignal.db`) | Every meal, symptom, bowel, wellbeing and context entry, in plain rows | Per-user scoping, and a wipe when the account on the device changes (§4 below) |
| Supabase Postgres             | The same rows, per user                                                | Row Level Security (see `docs/DATABASE.md`)                                    |
| Supabase Auth                 | Email or Apple identity                                                | Supabase-managed; no passwords exist anywhere                                  |
| Zustand (memory)              | The timeline's filter and search box                                   | Never persisted — a search term can name a food or a symptom                   |
| Product analytics             | **Event counts only.** No health content of any kind                   | §2 below                                                                       |
| Crash reports                 | Error type, operation, redacted message                                | §3 below                                                                       |

The local database is a **mirror, not a cache**. It holds the complete diary in readable rows,
which is what makes §4 necessary.

---

## 2. Analytics cannot carry health content

Health content reaching a product-analytics vendor is a release blocker (`CLAUDE.md` §58), and it
does not usually happen through malice — it happens when a helpful property is added to an existing
event two years later by someone in a hurry.

**The design.** `src/services/analytics/events.ts` declares every event the app may ever send, with
a Zod schema per event. `track()` is the only way to send one. There is no `trackRaw`, and no
property passthrough.

- **Two walls.** TypeScript rejects an undeclared event or property at the call site; Zod
  `.strict()` rejects it again at runtime, because types vanish at the boundary with untyped code.
- **No free-form values.** Not one property is a `z.string()` or `z.number()`. Every property is an
  enum or a boolean, which cannot carry content by construction. A string property is an open
  channel whatever discipline exists today.
- **The log kind lives in the event name**, never a property (`symptom_log_completed`), which is
  §29's own worked example.
- **`pattern_detail_opened` carries nothing at all.** A status would say "this user has a moderate
  signal", which is a statement about their health however abstract it looks.
- **`timeline_searched` is property-free** and fires only when typing settles. The search string
  decides _when_ to report and never travels.
- **`sync_failed` carries one of four words**, never an error message — a Supabase error can name a
  constraint, a column, a row id, or text a user typed.

**Enforced by tests, not by review.** `events.test.ts` scans the declarations for content-shaped
names, so adding `severity` fails the suite. `callSites.test.ts` forbids `track` anywhere in
`src/domain`, forbids importing a vendor SDK directly, and fails on any declared event with no call
site unless it is listed with a written reason.

**Not done yet:** no provider is configured. The sink is null, so `track` validates and discards.
When a PostHog key is supplied, **session replay must stay off** (`docs/PROJECT_PLAN.md`).

---

## 3. Crash reports are scrubbed before anything can send one

`src/services/monitoring/scrub.ts` is shaped as a Sentry `beforeSend` so the SDK can be handed it
directly. The design is deliberately lopsided, and the asymmetry is the point.

**Structured fields are an allowlist — this is a guarantee.** `scrubEvent` builds its result field
by field rather than deleting from the input, so a field added later is dropped by default rather
than forwarded by default. Request headers, request bodies, breadcrumb `data` and `extra` are
dropped whole rather than inspected. Only the user id is attached; email, username and IP are not.

**Free text is best effort — this is not a guarantee.** Tokens, email addresses, UUIDs and long
quoted values are redacted, and messages are truncated. A sentence like "could not save: user
reported bloating after dairy" is not caught, and cannot be. There is a test named
`DOES NOT catch health content written as an ordinary sentence` to stop anyone assuming otherwise.

**The consequence is a rule for us, not for the scrubber: never interpolate user content into an
error message.** `summariseError` in the outbox and the analytics developer warning both name keys
rather than values, for this reason.

**Not done yet:** no DSN, so no SDK is installed and the sink is null.

---

## 4. One person's diary stays off another person's screen

The local database is keyed by `user_id` and every query filters on it — but "the UI happens not to
show it" is not an access control, and §58 calls known cross-user data access a release blocker.

`src/services/db/localAccount.ts` clears every other account's rows when someone signs in, before
the sync engine starts. Children are deleted before parents so a meal item cannot outlive its meal
regardless of `PRAGMA foreign_keys`. `sync_cursors` is cleared too: the watermark is keyed by table
rather than by user, so a stale one would make the next user's first pull resume from someone
else's position and silently skip their history.

Signing back in as the **same** user is a deliberate no-op — that must never cost someone their
offline entries.

**The trade-off, stated plainly.** Clearing a departed account can discard entries the server never
accepted, which §15 forbids doing silently. Sign-out is the only moment that can be said to the
person it belongs to, so `features/auth/signOutPlan.ts` flushes the outbox, counts what is left and
names it before continuing. An unreadable count is not treated as zero.

---

## 5. Secrets

Only `EXPO_PUBLIC_*` values exist in the client, and everything under that prefix is compiled into
the bundle where anyone can read it. `.env` is never committed; `.env.example` carries names with
no values.

`src/__tests__/secrets.test.ts` scans every tracked file on each test run, anchored on the prefixes
vendors actually use rather than the word "key" — a pattern that fires on `apiKey` teaches people to
add suppressions. It also fails if a `.env` is ever committed, or if `.env.example` gains a value.

---

## 6. Dependency audit

**Run 2026-09-06 against SDK 57. Result: 14 moderate, 0 high, 0 critical — two root advisories, and
no fix is applied.** See ADR-0039 for the reasoning; the short version follows.

| Advisory                                                                        | Path                                                                   | Exposure                                                                                                                                               |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`decode-uri-component` DoS](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | `expo-router` → `query-string` → `decode-uri-component@0.2.2`          | **Runtime.** A `gutsignal://` scheme is registered, so the router parses incoming URLs. A crafted deep link could burn CPU. No data exposure.          |
| [`uuid` bounds check](https://github.com/advisories/GHSA-w5hq-g745-h8pq)        | `expo-splash-screen` → `@expo/config-plugins` → `xcode` → `uuid@7.0.3` | **Build time only**, on the machine running prebuild. Not in the shipped bundle, and the vulnerable path needs a `buf` argument `xcode` does not pass. |

`npm audit fix` offers **downgrades**, not upgrades — `expo-router` 57.0.19 → 5.1.11 and
`expo-splash-screen` 57.0.8 → 55.0.25, both semver-major. Taking either would break the SDK 57
install that `npx expo install --check` currently reports as correct, in exchange for two moderate
issues with no data-exposure component. Neither is fixable within SDK 57's tree; Expo has to bump
them upstream.

**Re-check** on every Expo SDK upgrade, and treat any **high or critical** finding as a release
blocker under §58 rather than a documented acceptance.

---

## 7. What is not protected yet

Listed so nobody has to discover it.

- **Export writes to the cache directory, not documents.** An export is a copy of the whole
  record and exists only long enough to reach the share sheet, so it is written somewhere the
  system can reclaim rather than somewhere it lives forever (§28). Availability is checked before
  anything is written, so a share that cannot happen leaves no copy behind.
- **Nothing has run on a physical device.** Every protection here is verified by tests, against
  the live database, or by reading; none has been observed working on a phone.

### Closed on 2026-09-06

- **The RLS audit has been run** against the live project, and `pattern_findings` is applied and
  covered: 67 assertions pass across every user-owned table plus the anonymous-client checks, with
  no rows left behind and no security lints from Supabase's advisor. Running it mattered more than
  writing it had: the suite contained a dollar-quoting error that made it invalid SQL, so **no**
  part of it had ever executed, plus a runtime type error in the `pattern_findings` path. Both are
  in ADR-0041.
- **Account deletion exists** (spec §97), end to end. See ADR-0042 for the design; the property
  worth repeating here is that the Edge Function takes **no user id** — it reads the caller's id
  from the verified token, so it cannot be aimed at anyone else. Verified against the live project:
  a caller who named a second account in the request body deleted only their own, and the named
  account was untouched.
