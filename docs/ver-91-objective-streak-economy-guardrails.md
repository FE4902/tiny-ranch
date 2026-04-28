# VER-91 Return Objective/Streak Economy Guardrails

## Scope

Add a deterministic economy simulation for return objective rewards so reward tuning is measurable and regression-safe.

## Source Of Truth

- Shared tuning config: `src/game/config/returnObjectiveEconomyTuning.shared.js`
- Barn recipe inputs/outputs: `src/game/config/barnRecipes.shared.js`
- Barn output sell values: `src/game/config/expansionEconomyTuning.shared.js`
- Runtime tuning-pack selection: `src/game/config/retentionTuningPack.ts`
- Retention rollout flags: `src/game/config/retentionFlags.ts`
- Gameplay consumers:
  - `src/game/config/returnObjectives.ts`
  - `src/game/config/returnObjectiveStreak.ts`
- Guardrail script: `scripts/check-return-objective-balance.mjs`
- Run command: `pnpm run balance:check:return-objectives`

## What The Script Replays

For each configured scenario:

- deterministic objective assignment (seed + assignment cycle)
- deterministic claim cadence in hours
- streak decay/recovery using `graceWindowMs` and tier config
- per-session objective reward claim
- Barn claim objective net value using Barn recipe inputs/outputs plus source-controlled sell prices
- deterministic spend pattern per session cycle

## Reported Outputs

- total earned value (`objective claim coins + Barn net value`)
- Barn net value contribution alongside raw claim coins
- total currency spent from configured sink pattern
- net currency (`earned - spent`)
- streak bonus contribution (`reward - base reward`)
- inflation deltas vs source-controlled baselines:
  - reward inflation delta
  - net inflation delta

## Guardrails

Thresholds live in source control under:

- `returnObjectiveEconomyTuning.deterministicBalanceCheck.guardrails`

The check fails (`exit 1`) if any scenario exceeds:

- maximum reward inflation delta
- maximum net inflation delta
- maximum streak-bonus share

## Barn Retention Extension (VER-110)

The Barn milestone is represented as a standard return objective:

- metric: `barn_claim_count`
- required Barn recipe link: `barnRecipeId`
- current rollout milestone: `barn_claim_cheese_press_1`

Economy impact stays deterministic by reusing source-controlled Barn data:

- recipe fee/input/output definitions come from `src/game/config/barnRecipes.shared.js`
- sell prices for Barn outputs come from `src/game/config/expansionEconomyTuning.shared.js`
- the guardrail script converts each Barn objective claim into net value (`outputs - inputs - fee`) before inflation checks

Telemetry coverage for the Barn retention path is validated by:

- `return_objective_progressed`
- `return_objective_completed`
- `return_objective_claimed`
- `barn_job_completed`

The contract fixture lives at `tests/fixtures/analytics/retention-contract.fixture.json`.

## Retention Rollout Flags (VER-92)

Source-controlled rollout controls live in `src/game/config/retentionFlags.ts`.

- `objectiveLoopUiEnabled`
  - Controls return objective assignment/progression/claim UI behavior.
- `streakBonusEnabled`
  - Controls streak multiplier/bonus application and streak lifecycle telemetry.
- `retentionKillSwitchEnabled`
  - Master kill switch. Forces objective-loop and streak-bonus paths off.

Runtime expectations when disabled:

- objective loop disabled:
  - boot does not assign a return objective
  - progress/claim calls return safely with no retention lifecycle telemetry emission
- streak bonus disabled (objective loop still enabled):
  - objective claims still work
  - claim rewards stay base-only (no streak multiplier/bonus)
  - streak lifecycle telemetry (`streak_started`, `streak_advanced`, `streak_reset`, `streak_claim_bonus`) is suppressed

Smoke-only query overrides (for local validation) are available when `smokeTest=1`:

- `retentionObjectiveUi=0|1`
- `retentionStreakBonus=0|1`
- `retentionKillSwitch=0|1`

## Local Tuning Workflow

1. Edit objective/streak tuning in `src/game/config/returnObjectiveEconomyTuning.shared.js`.
2. If Barn output value changes, update `src/game/config/expansionEconomyTuning.shared.js`.
3. If the Barn milestone recipe changes, update `src/game/config/barnRecipes.shared.js` and the objective `barnRecipeId`.
4. Run `pnpm run balance:check:return-objectives`.
5. If guardrails are intentionally adjusted, update:
   - scenario baselines in the same shared config
   - guardrail thresholds (only when explicitly approved)
6. Re-run retention analytics checks:
   - `pnpm run test:analytics:retention`
   - `pnpm run test:telemetry:retention`
7. Re-run smoke regression before release:
   - `pnpm run test:smoke`
   - `pnpm run test:smoke --grep "barn claim progress completes the Barn return objective"`

## Rollout / Rollback Steps

1. Edit `src/game/config/retentionFlags.ts` with the planned rollout state.
2. Validate analytics contracts:
   - `pnpm run test:analytics:retention`
3. Validate smoke on both paths:
   - default flags on: `pnpm run test:smoke --grep "return objective streak increments"`
   - Barn milestone path: `pnpm run test:smoke --grep "barn claim progress completes the Barn return objective"`
   - kill switch path: `pnpm run test:smoke --grep "retention kill switch disables objective boot assignment and claim flow safely"`
4. Ship once both analytics + smoke checks pass.
5. Rollback (if needed): set `retentionKillSwitchEnabled` to `true` in the same file, re-run checks, and redeploy.

Barn-specific rollback notes:

- fastest rollback: use `retentionKillSwitchEnabled` to disable the objective loop immediately
- Barn-only economy rollback: revert Barn output sell prices in `src/game/config/expansionEconomyTuning.shared.js`
- Barn-only retention rollback: revert the Barn objective reward or `barnRecipeId` in `src/game/config/returnObjectiveEconomyTuning.shared.js`
- after any Barn rollback, re-run `pnpm run balance:check:return-objectives` before shipping

## Follow-On Stability Gate (VER-96)

Long-run save/load + rollout-flag soak validation is documented in:

- `docs/ver-96-retention-soak-harness.md`
- Versioned tuning-pack loading/fallback is documented in:
  - `docs/ver-97-retention-tuning-pack-loader.md`
