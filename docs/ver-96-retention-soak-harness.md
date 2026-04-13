# VER-96 Deterministic Retention Soak Harness

## Scope

Add a deterministic long-run soak gate for the retention stack that exercises objective/streak
flows with periodic save/load boundaries and rollout-flag permutations.

## Source Of Truth

- Soak runner: `scripts/check-retention-soak.mjs`
- Soak command: `npm run test:soak:retention`
- Baseline digest fixture: `tests/fixtures/save/retention-soak-baseline.fixture.json`
- Runtime tuning: `src/game/config/returnObjectiveEconomyTuning.shared.js`
- CI hook: `.github/workflows/bundle-budget-gate.yml` (`retention-soak` job)

## Matrix Coverage

For each deterministic retention scenario in
`returnObjectiveEconomyTuning.deterministicBalanceCheck.scenarios`, the soak gate expands session
count via a source-controlled multiplier and runs all raw flag permutations:

- objective UI on/off
- streak bonus on/off
- retention kill-switch on/off

The runner also computes effective runtime flags (kill-switch dominance and streak dependency on
objective UI) so each permutation is checked in its real execution shape.

## Save/Load Stress Behavior

During each scenario+flag case, the soak runner:

1. advances deterministic session cadence
2. progresses and claims objective rewards when objective loop is enabled
3. applies deterministic spend cadence
4. runs save->load JSON round-trips at a fixed interval
5. verifies post-load state consistency before continuing

## Enforced Invariants

The gate fails (`exit 1`) when any case violates:

- objective loop enabled but no claim occurs for a session (stuck objective detection)
- currency goes negative at runtime
- currency drifts negatively across save/load boundaries
- assignment cycle drifts across save/load boundaries
- same-input replay generates a different digest
- digest differs from the source-controlled baseline fixture

Failure output includes case key, session index, and concise mismatch details for triage.

## Local Workflow

1. Run soak validation:
   - `npm run test:soak:retention`
2. If a retention change intentionally alters deterministic output, regenerate baseline:
   - `node scripts/check-retention-soak.mjs --update-baseline`
3. Re-run soak command to confirm clean pass after baseline update.

## Notes

- This soak check complements (does not replace) the runtime Playwright smoke suite.
- Keep baseline updates tightly scoped to intentional retention logic or tuning changes.
