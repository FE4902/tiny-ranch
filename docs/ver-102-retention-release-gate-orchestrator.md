# VER-102 Retention Release Gate Orchestrator

## Scope

Add one deterministic release-readiness command that runs retention hardening gates in one
sequence, fails on blocking stages, and emits a single machine-readable + human-readable summary.

## Source Of Truth

- Orchestrator script: `scripts/run-retention-release-gate.mjs`
- Gate command: `npm run gate:retention:release`
- Runtime budget fixture: `tests/fixtures/analytics/retention-release-gate-runtime-budgets.fixture.json`
- CI hook: `.github/workflows/bundle-budget-gate.yml` (`retention-release-gate` job)

## Stage Order

The orchestrator always runs stages in this order:

1. Return objective balance check (`check-return-objective-balance`)
2. Save migration matrix smoke (`save-migration-matrix.spec.ts`)
3. Retention soak checks (`check-retention-soak`)
4. Mobile retention memory gate (`retention-memory-gate.spec.ts`)
5. Retention health snapshot (`report-retention-health --run-playwright`)

## Fail-Fast Behavior

- Default mode is fail-fast for hard blockers.
- If a stage fails, later stages are marked `skipped` and the command exits non-zero.
- The failing stage still writes stdout/stderr logs and any stage artifacts needed for triage.

Optional local override:

- `npm run gate:retention:release -- --no-fail-fast`
- `npm run gate:retention:release -- --runtime-budgets=<path>`

## Artifacts

Running the gate writes:

- `artifacts/retention-release-gate/retention-release-gate-summary.json`
- `artifacts/retention-release-gate/retention-release-gate-summary.md`
- `artifacts/retention-release-gate/retention-release-gate-runtime-timing.json`
- `artifacts/retention-release-gate/retention-release-gate-runtime-timing.md`
- `artifacts/retention-release-gate/logs/*.log` (per-stage stdout/stderr)
- `artifacts/retention-release-gate/reports/*.playwright.json` (Playwright stage reports)
- `artifacts/retention-release-gate/retention-health/*` (nested health snapshot artifacts)

The summary explicitly records:

- stage order and status (`pass`, `fail`, `skipped`)
- stage command and exit code
- key stage metrics (scenario counts, soak coverage, Playwright pass/fail counts)
- runtime budget status (total + stage-level breaches)
- artifact/log paths for debugging and release triage

## Standard Release Workflow

1. Run `npm run gate:retention:release`.
2. If pass, archive or attach `artifacts/retention-release-gate/*` to release notes.
3. If fail, inspect:
   - stage failures in `retention-release-gate-summary.md`
   - runtime budget breaches in `retention-release-gate-runtime-timing.md`
4. Fix the owning subsystem or update approved budgets, then re-run the full gate before ship approval.

## Fallback Procedure On Sub-Gate Failure

1. Open `artifacts/retention-release-gate/retention-release-gate-summary.md`.
2. Locate the first failed stage and read:
   - `logs/<stage>.stdout.log`
   - `logs/<stage>.stderr.log`
3. Re-run only that stage command for faster iteration:
   - Balance: `npm run balance:check:return-objectives`
   - Migration smoke: `npm run test:smoke:save-migration`
   - Soak: `npm run test:soak:retention`
   - Memory: `npm run test:soak:retention:memory`
   - Health snapshot: `npm run report:retention:health -- --run-playwright`
4. Apply fix (or approved threshold/baseline update), then re-run full orchestrator.
5. If runtime budget breaches occur with passing stages, open:
   - `artifacts/retention-release-gate/retention-release-gate-runtime-timing.md`
   - `artifacts/retention-release-gate/retention-release-gate-runtime-timing.json`
   then follow the remediation playbook in `docs/ver-104-retention-gate-ci-runtime-budget.md`.
