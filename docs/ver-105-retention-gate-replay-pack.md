# VER-105 Retention Gate Failure Replay Pack + Deterministic Context Capture

## Scope

When `pnpm run gate:retention:release` fails, emit a replay pack that captures deterministic stage
context so the failure can be replayed locally with one command.

## Source Of Truth

- Orchestrator: `scripts/run-retention-release-gate.mjs`
- Replay helper: `scripts/replay-retention-gate-stage.mjs`
- Gate command: `pnpm run gate:retention:release`
- Replay command: `pnpm run gate:retention:replay`
- CI hook: `.github/workflows/bundle-budget-gate.yml` (`retention-release-gate` job)

## Replay Pack Artifacts

Each orchestrator run now writes:

- `artifacts/retention-release-gate/replay-pack/retention-release-gate-replay-pack.json`
- `artifacts/retention-release-gate/replay-pack/retention-release-gate-replay-pack.md`

Captured stage metadata includes:

- exact replay command (binary + args + cwd)
- stage env overrides used by the original run
- fixture/input references per stage
- stage runtime metadata (start/end/duration/exit code)
- stage artifact links (stdout/stderr logs + reports)
- failure classification (`deterministic_failure` or `non_deterministic_flake`) when a stage fails
- rerun diagnostics evidence (`#attempt:status(exit=code)`) used to assign that classification

## CI Behavior

The retention release gate job uploads:

- full retention release gate artifact directory (`if: always()`)
- replay-pack artifact bundle (`if: failure()`)

This ensures replay context is preserved specifically on failing CI runs.

## Failure -> Replay -> Verification Workflow

1. Open CI artifact `retention-release-gate-replay-pack` (or full `retention-release-gate` bundle).
2. Read `replay-pack/retention-release-gate-replay-pack.md` and identify failed stage(s).
3. Reproduce first failure locally:
   - `pnpm run gate:retention:replay`
4. Reproduce a specific failing stage when needed:
   - `pnpm run gate:retention:replay -- --stage=<stage-id>`
5. Apply fix and verify stage replay passes.
6. Re-run full release gate:
   - `pnpm run gate:retention:release`
7. Confirm both gate summary and runtime timing artifacts are `PASS` before merge.

## Rerun Attempt Tuning

- Default rerun attempts: `1` (one retry after the first failed attempt).
- Override locally: `pnpm run gate:retention:release -- --rerun-attempts=<count>`.
- Increase attempts only to improve diagnostic signal; the gate still fails on both deterministic failures and flakes.
- Do not use rerun attempts to auto-pass flaky runs. Strict-fail remains the default and expected CI policy.

## Local Helper Options

- `--pack=<path>`: replay from an alternate replay-pack JSON file
- `--stage=<stage-id>`: replay a specific stage id
- `--list`: list stage ids/statuses from the pack
- `--allow-passed`: replay a stage that did not fail
- `--dry-run`: print resolved replay command/context without executing
