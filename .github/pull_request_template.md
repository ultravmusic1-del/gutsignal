## What changed

<!-- One or two sentences. What a reviewer needs before reading the diff. -->

## Why

<!-- The problem, not the solution. Link the ADR if this changes an architectural decision
     (CLAUDE.md §48) — a material change without one is incomplete. -->

## Verification evidence

<!-- Paste OUTPUT, not adjectives. This repository has already shipped a test suite that had
     never executed (ADR-0041) and a navigation bug that survived typecheck, lint, 292 tests and
     a full iOS bundle. Test existence is not test evidence. -->

- [ ] `npm run verify:full` passes locally — paste the tail
- [ ] New behaviour has a test that was confirmed to **fail before the fix**
- [ ] Verified on a physical iPhone, or explicitly stated as not device-verified

```text
<paste output here>
```

## Risk

- [ ] Touches sync, migrations, RLS, auth or account deletion — if so, say what could go wrong
- [ ] Changes what the user is told about their health data (CLAUDE.md §17)
- [ ] Adds a dependency — if so, name the §38 checks it passed
- [ ] Needs a migration applied to the live project

## Checklist

- [ ] No secrets, no `.env`, no service-role key
- [ ] No health content in analytics, logs or crash reports (§29, §30)
- [ ] `docs/PROJECT_STATUS.md` updated if project state moved
