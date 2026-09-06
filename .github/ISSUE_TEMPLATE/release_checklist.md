---
name: Release checklist
about: Gate a TestFlight or App Store submission
labels: release
---

Release: <!-- version / build -->

The authoritative list lives in `docs/PROJECT_STATUS.md`. This issue tracks one release through it.

## Gates

- [ ] `npm run verify:full` green on the release commit
- [ ] CI green, including migrations-from-zero and the RLS suite
- [ ] Migrations applied to the target environment
- [ ] Supabase security advisor clean
- [ ] Physical-device acceptance run completed (PROJECT_STATUS §5 C2)
- [ ] Accessibility pass (C3)
- [ ] Release-mode build tested, not only a development build
- [ ] No health content in analytics or crash telemetry, verified against the real SDKs
- [ ] Account deletion verified end to end in the target environment
- [ ] Diagnostics panel reports the correct environment, version, build and SHA
- [ ] `docs/PROJECT_STATUS.md` updated with what was actually verified, and when

## Rollback

<!-- What you do if this build is bad: previous build number, and whether a migration needs
     reversing. A release without a written way back is not ready. -->
