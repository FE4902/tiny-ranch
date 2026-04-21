# VER-102 Retention Release Gate Orchestrator

## Scope

Add one deterministic release-readiness command that runs retention hardening gates in one
sequence, fails on blocking stages, and emits a single machine-readable + human-readable summary.

## Source Of Truth

- Orchestrator script: `scripts/run-retention-release-gate.mjs`
- Replay helper script: `scripts/replay-retention-gate-stage.mjs`
- Gate command: `npm run gate:retention:release`
- Replay command: `npm run gate:retention:replay`
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
- If a stage fails, the gate reruns that stage (default: 1 rerun attempt) using captured replay context to classify deterministic regression vs non-deterministic flake.
- Later stages are still marked `skipped` and the command exits non-zero for both deterministic failures and flakes (strict-fail policy).
- The failing stage still writes stdout/stderr logs and any stage artifacts needed for triage.

Optional local override:

- `npm run gate:retention:release -- --no-fail-fast`
- `npm run gate:retention:release -- --runtime-budgets=<path>`
- `npm run gate:retention:release -- --rerun-attempts=<count>`

## Artifacts

Running the gate writes:

- `artifacts/retention-release-gate/retention-release-gate-summary.json`
- `artifacts/retention-release-gate/retention-release-gate-summary.md`
- `artifacts/retention-release-gate/retention-release-gate-runtime-timing.json`
- `artifacts/retention-release-gate/retention-release-gate-runtime-timing.md`
- `artifacts/retention-release-gate/retention-release-gate-artifact-index.json`
- `artifacts/retention-release-gate/replay-pack/retention-release-gate-replay-pack.json`
- `artifacts/retention-release-gate/replay-pack/retention-release-gate-replay-pack.md`
- `artifacts/retention-release-gate/logs/*.log` (per-stage stdout/stderr)
- `artifacts/retention-release-gate/reports/*.playwright.json` (Playwright stage reports)
- `artifacts/retention-release-gate/retention-health/*` (nested health snapshot artifacts)

The summary explicitly records:

- stage order and status (`pass`, `fail`, `skipped`)
- stage command and exit code
- failure classification (`deterministic_failure` vs `non_deterministic_flake`) for failed stages
- rerun attempt evidence (attempt index, status, exit code, logs)
- key stage metrics (scenario counts, soak coverage, Playwright pass/fail counts)
- deterministic replay metadata (exact command, input fixture refs, stage env overrides, runtime context)
- runtime budget status (total + stage-level breaches)
- artifact/log paths for debugging and release triage
- stage-level artifact index mapping (timing report + replay pack + classification evidence paths)

## CI Summary Publishing

The `retention-release-gate` job appends
`artifacts/retention-release-gate/retention-release-gate-summary.md` directly to
`$GITHUB_STEP_SUMMARY` on every run (`if: always()`), then prints the artifact-index JSON path.

This gives a single CI-first triage view with:

- stage timings
- runtime budget pass/fail state
- deterministic-vs-flaky failure classification
- replay command pointers
- direct paths to logs, reports, and stage artifacts

## <5 Minute Failure Triage Path (From CI Output)

1. Open CI job summary (`retention-release-gate` job) and read the `Stage Summary` + `Failures` table.
2. Use the `Stage Artifacts` table to open `stdout/stderr` logs and stage artifact paths for the first failed stage.
3. If runtime budgets failed, open `retention-release-gate-runtime-timing.md` and inspect `over budget (ms)` rows.
4. Open `retention-release-gate-artifact-index.json` for machine-readable stage mapping to timing and replay artifacts.
5. Reproduce with `npm run gate:retention:replay` (or `--stage=<stage-id>`), apply fix, then rerun full gate.

## Standard Release Workflow

1. Run `npm run gate:retention:release`.
2. If pass, archive or attach `artifacts/retention-release-gate/*` to release notes.
3. If fail, inspect:
   - stage failures in `retention-release-gate-summary.md`
   - deterministic vs flake classification and rerun evidence in the same summary
   - runtime budget breaches in `retention-release-gate-runtime-timing.md`
   - replay metadata in `replay-pack/retention-release-gate-replay-pack.md`
4. Reproduce the first failed stage with:
   - `npm run gate:retention:replay`
   - or `npm run gate:retention:replay -- --stage=<stage-id>` for targeted reruns
5. Apply fix in owning subsystem or update approved budgets, then re-run the full gate before ship approval.

## Fallback Procedure On Sub-Gate Failure

1. Open `artifacts/retention-release-gate/retention-release-gate-summary.md`.
2. Open `artifacts/retention-release-gate/retention-release-gate-artifact-index.json`.
3. Open `artifacts/retention-release-gate/replay-pack/retention-release-gate-replay-pack.md`.
4. Locate the first failed stage and read:
   - `logs/<stage>.stdout.log`
   - `logs/<stage>.stderr.log`
5. Re-run only that stage command from captured context:
   - `npm run gate:retention:replay -- --stage=<stage-id>`
6. Apply fix (or approved threshold/baseline update), then re-run full orchestrator.
7. If runtime budget breaches occur with passing stages, open:
   - `artifacts/retention-release-gate/retention-release-gate-runtime-timing.md`
   - `artifacts/retention-release-gate/retention-release-gate-runtime-timing.json`
   then follow the remediation playbook in `docs/ver-104-retention-gate-ci-runtime-budget.md`.
