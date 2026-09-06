# End-to-end flows

Eight journeys, written to be run against a real build on a real iPhone.

## ⚠ None of these has ever been run

They are written, not verified. There is no Docker, no simulator and no device on the development
machine, so every selector below was read out of the source rather than observed on screen. Expect
to fix selectors on the first run — a flow that fails because a label reads "Log my first entry"
rather than "Log first entry" is maintenance, not a defect in the app.

They exist now anyway, for one reason: the first device session should be spent finding out
whether GutSignal works, not deciding what to try. This is the script for that session.

**Do not treat a green run as proof until the flows have failed at least once for a real reason.**
A suite that has only ever passed is the same trap as `rls_isolation.sql`, which sat in the tree
for weeks looking like verification while containing SQL that had never executed (ADR-0041).

## Running them

```bash
# once
curl -Ls "https://get.maestro.mobile.dev" | bash

# then, with a development build installed and the device connected
maestro test .maestro/
```

Maestro is a CLI, not an npm dependency — it adds nothing to the bundle and is outside
`CLAUDE.md` §38's dependency policy. Nothing in `package.json` changes.

## What is covered, and why these eight

Chosen against `CLAUDE.md` §54's priority order: reliable logging first, data correctness second.
They are not a map of the app — the review's advice was 8–12 journeys, not a test per button.

| Flow                             | The promise it checks                                                   |
| -------------------------------- | ----------------------------------------------------------------------- |
| `01-onboarding-and-first-log`    | A new person can get from install to a saved entry                      |
| `02-offline-logging-survives`    | **The core claim.** Log in airplane mode, force-quit, reopen, reconnect |
| `03-offline-edit-syncs`          | An edit made offline reaches the server and does not duplicate          |
| `04-offline-delete-propagates`   | A deletion is a tombstone that travels, not a local disappearance       |
| `05-sign-out-warns-about-unsent` | Nobody loses an unsent entry without being told first                   |
| `06-account-switch-hides-diary`  | One person's diary never appears on another person's screen             |
| `07-account-deletion`            | Deletion removes the account and the device copy, and ends the session  |
| `08-report-and-export-sheets`    | The two things that hand a file to iOS actually open                    |

## What these cannot check

Everything about how it looks and feels: detents, keyboard avoidance, Dynamic Type, VoiceOver
order, safe areas, the interactive back gesture. Those need eyes, and are listed in
`docs/PROJECT_STATUS.md` §5 as a device pass rather than pretended at here.

They also cannot check what the server received. After flow 02 and 03, confirm the rows in
Supabase — the flows assert what the _app_ shows, and the whole point of sync is that the two
agree.
