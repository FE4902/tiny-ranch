# VER-101 Retention Health Snapshot Report + CI Gate

## Scope

Add a deterministic release-readiness report that aggregates retention health signals into one
machine-readable + human-readable artifact pair.

## Source Of Truth

- Report script: `scripts/report-retention-health.mjs`
- Threshold fixture: `tests/fixtures/analytics/retention-health-thresholds.fixture.json`
- NPM command: `npm run report:retention:health`
- CI hook: `.github/workflows/bundle-budget-gate.yml` (`retention-health-snapshot` job)
- Baseline diff layer: `docs/ver-103-retention-gate-baseline-diff.md`

## Artifacts

Running `npm run report:retention:health` writes:

- JSON summary: `artifacts/retention-health/retention-health-summary.json`
- Markdown summary: `artifacts/retention-health/retention-health-summary.md`
- Per-check logs: `artifacts/retention-health/logs/*.log`

In CI, use `npm run report:retention:health -- --run-playwright` so the snapshot also includes:

- save migration matrix gate output
- mobile retention memory-drift gate output

## Readiness Signals Enforced

The gate composes existing deterministic checks and applies source-controlled thresholds:

- telemetry contract drift (`validate-retention-telemetry-contract`)
- deterministic cohort export integrity, including Barn milestone completion/claim cadence (`test-retention-cohort-export`)
- objective/streak economy guardrails (`check-return-objective-balance`)
- long-run soak stability (`check-retention-soak`)
- save migration compatibility (Playwright matrix, when Playwright checks are enabled)
- mobile memory/frame drift thresholds (Playwright memory gate, when Playwright checks are enabled)

## Metric Ownership Map

When a metric fails, use this table to route triage quickly.

| Failed metric key | Likely owning subsystem/check | Primary command |
| --- | --- | --- |
| `validatedEvents` | Telemetry schema + runtime payload literals (`src/game/systems/telemetry.ts`, `src/game/systems/runtime.ts`) | `node scripts/validate-retention-telemetry-contract.mjs` |
| `sampleEvents`, `barnObjectiveCompletionRate`, `barnObjectiveClaimRate` | Retention cohort summarizer (`scripts/export-retention-cohorts.mjs`) | `node scripts/test-retention-cohort-export.mjs` |
| `scenarioCount`, `failingScenarios`, `streakBonus.<scenario>` | Return objective/streak economy tuning (`src/game/config/returnObjectiveEconomyTuning.shared.js`) | `node scripts/check-return-objective-balance.mjs` |
| `caseCount`, `failingCases`, `objectiveEnabledCaseCount`, `minimumObjectiveEnabledClaimRate` | Deterministic soak replay + save/load invariants (`scripts/check-retention-soak.mjs`) | `node scripts/check-retention-soak.mjs` |
| `passedTests`, `failedTests` (save migration) | Save migration decode/re-save matrix (`tests/smoke/save-migration-matrix.spec.ts`) | `npx playwright test --project=desktop-chromium tests/smoke/save-migration-matrix.spec.ts --reporter=json` |
| `passedTests`, `failedTests` (memory gate) | Mobile memory/frame drift gate (`tests/smoke/retention-memory-gate.spec.ts`) | `npx playwright test --project=mobile-chromium tests/smoke/retention-memory-gate.spec.ts --reporter=json` |
| `commandExitCode` | Check runner + underlying check command | command listed in summary artifact |

## Threshold Update Workflow

1. Confirm failure is an intentional behavior change, not a regression.
2. Update `tests/fixtures/analytics/retention-health-thresholds.fixture.json` in the same PR.
3. Re-run:
   - `npm run report:retention:health`
   - `npm run report:retention:health -- --run-playwright` (when Playwright dependencies are available)
4. Include rationale for threshold changes in the issue comment.

## Baseline Regression Diff Layer

Retention health thresholds are complemented by baseline-vs-current drift diffing:

- command: `npm run gate:retention:baseline-diff`
- baseline fixture: `tests/fixtures/analytics/retention-gate-baseline.fixture.json`
- workflow and refresh policy: `docs/ver-103-retention-gate-baseline-diff.md`
