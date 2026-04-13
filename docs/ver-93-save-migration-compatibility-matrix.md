# VER-93 Save Migration Compatibility Matrix

## Scope

Protect retention save evolution from backward-compatibility regressions by running a
fixture-driven migration matrix that validates:

- legacy payload decode under current runtime
- retention defaults/flag behavior after boot
- re-save persistence safety (no hard reset on critical progression/economy fields)

## Source Of Truth

- Smoke gate: `tests/smoke/save-migration-matrix.spec.ts`
- Fixture matrix: `tests/fixtures/save/save-migration-matrix.fixture.json`
- Re-save trigger: `src/game/testing/smokeHarness.ts` (`debugSaveGameState`)
- Local command: `npm run test:smoke:save-migration`
- CI hook: `.github/workflows/bundle-budget-gate.yml` (`save-migration-smoke` job)

## Fixture Matrix Coverage

Current source-controlled cases:

- `pre_objective`: payload without objective/streak fields migrates with defaults
- `objective_only`: objective payload migrates with default streak state
- `streak_enabled`: objective + streak payload remains intact through decode/re-save
- `kill_switch_fallback`: kill-switch runtime fallback is safe while persisted objective/streak
  payload remains valid

## Updating Fixtures Safely

When save schema or retention state contracts change:

1. Add/update fixture entries in `tests/fixtures/save/save-migration-matrix.fixture.json`.
2. Keep each case explicit:
   - `launchFlags`
   - `expectedRuntime`
   - `expectedResave`
   - `payload`
3. Re-run `npm run test:smoke:save-migration`.
4. If behavior changes intentionally, update fixture expectations in the same PR with a short
   rationale.

## Failure Triage

1. Re-run the gate locally:
   - `npm run test:smoke:save-migration`
2. Open the failed Playwright trace:
   - `npx playwright show-trace test-results/**/trace.zip`
3. Check whether failure is:
   - decode/runtime mismatch (`expectedRuntime` vs harness snapshot)
   - re-save mismatch (`expectedResave` vs persisted localStorage payload)
4. Fix runtime/schema logic first; update fixtures only for intentional contract changes.
