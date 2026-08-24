# M5 slice — offline symptom logging, outbox and sync

Date: 2026-08-24
Milestone: 5 (first vertical slice)
Status: approved, implementing

---

## 1. Why this slice

Milestone 5 is "core offline logging + outbox + sync" across five log types. Building all five
at once produces a large unreviewable change and delays the first proof that the architecture
works. This slice takes **one** log type — symptoms — end to end through the entire spine:

```text
device UUID → SQLite write + outbox row (one transaction) → drain → idempotent upsert
            → cursor pull → merge → UI reads from SQLite
```

Symptoms were chosen over the simpler one-tap wellbeing log because they exercise the parts
that are actually hard: a real form, a severity scale, a user-chosen occurrence time, and
therefore the timezone handling that risk R-02 names as the most likely source of silent data
corruption in this product.

Once the spine is proven, meals, bowel, wellbeing and context are largely a repetition of it.

## 2. Decisions taken

| #   | Decision                                                       | Reason                                                                                                                                                                                     |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Vertical slice, symptoms first                                 | `CLAUDE.md` §50 step 3 — smallest coherent vertical slice                                                                                                                                  |
| 2   | Push **and** cursor pull in this slice                         | `PROJECT_PLAN.md` §6 specifies only push; push-only means a reinstall shows an empty timeline. Designing the read path after shipping the write path is more expensive than doing both now |
| 3   | `expo-network` for connectivity                                | §38 check 1 — Expo already solves it. First-party, SDK-pinned (`~57.0.1`), New Architecture ready. Added _before_ the first dev build exists, so it costs no extra EAS cycle (R-03)        |
| 4   | Framework-free sync engine, injected dependencies              | Testable without React or timers, and portable to the Deno Edge runtime later (R-09)                                                                                                       |
| 5   | Engine implements insert/update/delete; UI exposes create only | The outbox schema already has all three operations. Leaving two unimplemented would only half-prove the architecture. Edit/delete **UI** belongs to M6                                     |
| 6   | Tests run against real SQLite via `node:sqlite`                | Node 24 ships it. Transactional and idempotency guarantees get tested against a real engine rather than a hand-rolled fake, with no new dependency                                         |

### Rejected

- **TanStack Query offline mutations as the outbox.** The queue would live in a serialized
  cache rather than in SQLite, so the outbox row would no longer be written in the same
  transaction as the log. That transaction is the entire defence against T9 (offline log lost).
- **Write-through repository** that tries the network first. Couples the UI write path to the
  network and invites the UI to await it — contradicts §6's "the UI never waits on the network".

## 3. Module boundaries

| Module                               | Responsibility                                                  | Pure? |
| ------------------------------------ | --------------------------------------------------------------- | ----- |
| `domain/time/occurrence.ts`          | `Date` + IANA zone → the four occurrence fields                 | yes   |
| `domain/logs/symptom.ts`             | Zod schema and types; reuses `SYMPTOM_KEYS`                     | yes   |
| `services/db/sqlite.ts`              | Narrow `SqlDatabase` interface over the expo-sqlite subset used | —     |
| `services/db/migrations.ts`          | Local migration v2: `symptom_logs` mirror, `sync_cursors`       | —     |
| `services/sync/backoff.ts`           | Retry delay arithmetic                                          | yes   |
| `services/sync/merge.ts`             | Last-writer-wins resolution                                     | yes   |
| `services/sync/outbox.ts`            | `enqueue` / `claimPending` / `markSynced` / `markFailed`        | —     |
| `services/logs/symptomRepository.ts` | SQLite reads/writes. Write = one transaction                    | —     |
| `services/sync/network.ts`           | `expo-network` behind a 3-method interface                      | —     |
| `services/sync/syncEngine.ts`        | `drainOnce` / `pullOnce` / `start` / `stop`                     | —     |
| `features/logs/useLogSymptom.ts`     | Form submit → repository → dismiss                              | —     |
| `app/log/symptom.tsx`                | The form screen                                                 | —     |

`symptomRepository` is the only module holding SQL for this table. `syncEngine` is the only
module that talks to Supabase. Neither imports the other's internals.

## 4. Postgres schema

`public.symptom_logs`:

- `id uuid` primary key — **generated on the device**, so a retry upserts rather than duplicates
- `user_id uuid not null references auth.users(id) on delete cascade`
- `symptom_type text not null` checked against the same keys as `SYMPTOM_KEYS`
- `severity int not null check (severity between 1 and 10)`
- `occurred_at timestamptz not null`, `occurred_local_date date not null`,
  `occurred_tz text not null`, `occurred_utc_offset_minutes int not null`
- `note text`, `source text not null default 'manual'`
- `deleted_at timestamptz` — soft delete, so a delete on one device survives sync
- `created_at`, `updated_at` — `updated_at` maintained by trigger, never by the client

RLS enabled, four policies scoped `to authenticated` using `(select auth.uid()) = user_id`
per §4.4. Indexes: `(user_id, occurred_at desc)`, `(user_id, occurred_local_date)`,
`(user_id, updated_at)` for the pull cursor.

The existing key-drift test is extended so `SYMPTOM_KEYS` and the new check constraint cannot
diverge.

## 5. Data flow

**Write.** UUID generated on device → one SQLite transaction writes the log row _and_ its
outbox row → the screen dismisses immediately, reading back from SQLite. No network on this
path.

**Push.** `drainOnce()` claims pending rows oldest-first and upserts on `id`. Idempotent, so an
ambiguous timeout cannot duplicate. Triggered on: foreground, connectivity regained, after each
write, and on backoff expiry.

**Pull.** `pullOnce()` fetches rows with `updated_at > cursor`, resolves last-writer-wins, and
advances the cursor in `sync_cursors`. A row with a pending local edit is never overwritten
until its own push lands.

## 6. Timezone (risk R-02)

`occurrence.ts` is pure and carries the heaviest fixture set in the slice: a 23:59 log, a 00:01
log, both DST transitions, a zone change between write and sync, and a negative-offset zone.
`occurred_local_date` is computed at log time from the user's zone and is **never** recomputed
server-side. Day grouping never derives from the UTC date.

## 7. Failure handling

Exponential backoff with jitter, capped. `attempt_count` and `last_error` persist on the outbox
row. Failure surfaces as a quiet badge, never a modal. Nothing leaves the outbox until the
server confirms — `markSynced` runs only after a successful response. A repeatedly failing row
stays `failed` and visible; it is never silently dropped.

## 8. Privacy

`symptom_type`, `severity` and `note` are C3 sensitive health data. They travel to Postgres and
nowhere else: no analytics properties, no crash-report payloads. Sync errors record the
operation and status code only, never the row body. The existing safe-language scanner picks up
new source automatically.

## 9. Out of scope for this slice

Meals, bowel, wellbeing, context and journal logging · edit/delete **UI** (M6) · the virtualized
paginated timeline (M6) · GutSignal Score (M8). The other five rows of the log sheet remain
visibly and accessibly disabled rather than silently dead.

## 10. Acceptance

Verifiable on Windows: typecheck, lint, the full test suite, and an iOS Metro bundle.

**Not verifiable on Windows:** the milestone's own criterion — create a log in airplane mode,
reconnect, confirm it syncs exactly once. That needs the Apple Developer enrolment and a
registered iPhone, and stays explicitly unverified until then.
