# HANDOFF — superseded

This file was the handoff between iterations of an overnight autonomous loop. It served that
purpose and is no longer maintained.

**Project state now lives in [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).** One file, updated
when state moves.

It was retired rather than left in place because stale status is more dangerous here than on an
ordinary team: this file was written to be read first by coding agents, and it went on confidently
describing a paused database, an unapplied migration, an unwritten account-deletion flow and a
branch that had since been merged — all of which had been done. A document that directs work has
to be right or gone.

The full text is in git history if you want it:

```bash
git log --follow -p -- HANDOFF.md
```

What was worth keeping moved to where it belongs:

| What                                        | Now in                     |
| ------------------------------------------- | -------------------------- |
| Project state, blockers, what to do next    | `docs/PROJECT_STATUS.md`   |
| Pattern-engine thresholds and the reasoning | `docs/PATTERN_ENGINE.md`   |
| Architectural decisions                     | `docs/DECISIONS.md`        |
| What is not protected yet                   | `docs/PRIVACY_SECURITY.md` |
| Engineering rules                           | `CLAUDE.md`                |
| Setup and commands                          | `README.md`                |

The one line from it still worth repeating, because it remains true and remains the largest
caveat on everything else:

> Automated green does not mean correct. In Milestone 6 a real defect — a route that opened as a
> full-screen push instead of a sheet — survived typecheck, lint, 292 tests and a complete iOS
> bundle. Only running the app catches that class of bug, and GutSignal has still never run on a
> physical iPhone.
