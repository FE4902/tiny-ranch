# VER-104 Retention Gate CI Runtime Budget + Stage Timing Report

## Scope

Add deterministic runtime telemetry and budget enforcement to the retention release gate so CI can
catch runtime regressions before merge.

## Source Of Truth

- Runtime budget fixture: `tests/fixtures/analytics/retention-release-gate-runtime-budgets.fixture.json`
- Orchestrator script: `scripts/run-retention-release-gate.mjs`
- Gate command: `pnpm run gate:retention:release`
- CI hook: `.github/workflows/bundle-budget-gate.yml` (`retention-release-gate` job)

## Runtime Budget Model

Budget inputs are source-controlled in the fixture:

- `budgets.totalDurationMsCeiling`: max total wall-clock duration for all executed stages
- `budgets.stageDurationMsCeilings`: optional per-stage ceilings keyed by stage id

The gate fails (`exit 1`) when either condition is breached:

- total runtime > `totalDurationMsCeiling`
- any configured stage runtime > that stage's ceiling

## Timing Artifacts

Each run now emits dedicated timing artifacts:

- `artifacts/retention-release-gate/retention-release-gate-runtime-timing.json`
- `artifacts/retention-release-gate/retention-release-gate-runtime-timing.md`

They include:

- per-stage duration, share of total runtime, configured ceiling, over-budget amount
- total runtime and total ceiling
- breach list used for CI failure messaging

## Breach Output To Remediation Mapping

When CI prints:

- `[retention-release-gate] runtime budget breaches: N`
- `- [total] ...`
- `- [<stage-id>] ...`

use this path:

1. Open `retention-release-gate-runtime-timing.md` and identify the largest `over budget (ms)` row.
2. Re-run only the offending stage command locally:
   - `balance_check`: `pnpm run balance:check:return-objectives`
   - `save_migration_smoke`: `pnpm run test:smoke:save-migration`
   - `retention_soak`: `pnpm run test:soak:retention`
   - `memory_gate`: `pnpm run test:soak:retention:memory`
   - `retention_health_snapshot`: `pnpm run report:retention:health -- --run-playwright`
3. Apply runtime fix first when regression is unintentional (test scope, fixture bloat, startup cost).
4. Update budget fixture only when slower runtime is intentional and approved, then re-run full gate.

## Budget Tuning Workflow

1. Run `pnpm run gate:retention:release`.
2. Review runtime timing artifacts and stderr breach lines.
3. If intentional, edit `tests/fixtures/analytics/retention-release-gate-runtime-budgets.fixture.json`.
4. Re-run `pnpm run gate:retention:release` and confirm no budget breaches remain.
5. Include rationale for fixture changes in issue/PR notes.

