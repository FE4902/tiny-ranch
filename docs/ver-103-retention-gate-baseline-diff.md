# VER-103 Retention Gate Baseline Diff + Trend Summary

## Scope

Add a deterministic baseline-vs-current diff layer on top of retention health gate outputs so
regressions can be triaged quickly and intentional tuning changes can be updated safely.

## Source Of Truth

- Diff script: `scripts/diff-retention-gate-baseline.mjs`
- Baseline fixture: `tests/fixtures/analytics/retention-gate-baseline.fixture.json`
- pnpm command: `pnpm run gate:retention:baseline-diff`
- CI hook: `.github/workflows/bundle-budget-gate.yml` (`retention-health-snapshot` job)

## Artifacts

Running `pnpm run gate:retention:baseline-diff` writes:

- JSON diff: `artifacts/retention-baseline-diff/retention-baseline-diff.json`
- Markdown diff: `artifacts/retention-baseline-diff/retention-baseline-diff.md`
- Report-run logs (when summary is generated in-command):
  - `artifacts/retention-baseline-diff/logs/retention_health_snapshot.stdout.log`
  - `artifacts/retention-baseline-diff/logs/retention_health_snapshot.stderr.log`

The JSON diff includes per-metric baseline/current values, drift magnitude, thresholds, and breach
status for machine triage.

## Metrics Tracked

The baseline fixture tracks critical retention metrics:

- claim completion rate (`retentionSoak.minimumObjectiveEnabledClaimRate`)
- streak continuity metrics (`objectiveBalance.scenarios.*.streakBonus`)
- objective/soak guardrail outcomes (`objectiveBalance.failingScenarios`, `retentionSoak.failingCases`)
- migration guardrail outcomes (`saveMigration.failedTests`, `saveMigration.status`)
- memory guardrail outcomes (`memoryGate.failedTests`, `memoryGate.status`)
- overall retention health status (`overallStatus`)

## Drift Threshold Configuration

Each metric uses a path-based threshold entry in
`tests/fixtures/analytics/retention-gate-baseline.fixture.json`:

- exact-match metrics: omit numeric threshold fields
- numeric metrics: optional
  - `maxAbsoluteDelta`
  - `maxRelativeDeltaPct`

The diff gate fails when any metric breaches its configured threshold.

## Standard Workflow

1. Run:
   - `pnpm run gate:retention:baseline-diff`
2. Review diff artifacts:
   - `artifacts/retention-baseline-diff/retention-baseline-diff.md`
   - `artifacts/retention-baseline-diff/retention-baseline-diff.json`
3. If the run fails, inspect the breached metric rows and owning subsystem from the referenced
   retention health checks.

## Intentional Baseline Refresh Workflow

Use this only when behavior drift is intentional and approved.

1. Confirm change intent and expected retention impact.
2. Refresh baseline values:
   - `pnpm run gate:retention:baseline-diff -- --update-baseline`
3. Re-run baseline diff:
   - `pnpm run gate:retention:baseline-diff`
4. Include rationale for threshold and/or baseline value changes in the issue update and PR notes.

## CI Behavior

The `retention-health-snapshot` CI job:

1. builds the retention health summary (`report-retention-health --run-playwright`)
2. runs baseline diff against that generated summary
3. uploads both:
   - `artifacts/retention-health`
   - `artifacts/retention-baseline-diff`

If baseline drift breaches thresholds, the baseline diff step exits non-zero and fails CI.
