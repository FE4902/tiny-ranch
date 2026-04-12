# VER-91 Return Objective/Streak Economy Guardrails

## Scope

Add a deterministic economy simulation for return objective rewards so reward tuning is measurable and regression-safe.

## Source Of Truth

- Shared tuning config: `src/game/config/returnObjectiveEconomyTuning.shared.js`
- Gameplay consumers:
  - `src/game/config/returnObjectives.ts`
  - `src/game/config/returnObjectiveStreak.ts`
- Guardrail script: `scripts/check-return-objective-balance.mjs`
- Run command: `npm run balance:check:return-objectives`

## What The Script Replays

For each configured scenario:

- deterministic objective assignment (seed + assignment cycle)
- deterministic claim cadence in hours
- streak decay/recovery using `graceWindowMs` and tier config
- per-session objective reward claim
- deterministic spend pattern per session cycle

## Reported Outputs

- total currency earned from objective claims
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

## Local Tuning Workflow

1. Edit objective/streak tuning in `src/game/config/returnObjectiveEconomyTuning.shared.js`.
2. Run `npm run balance:check:return-objectives`.
3. If guardrails are intentionally adjusted, update:
   - scenario baselines in the same shared config
   - guardrail thresholds (only when explicitly approved)
4. Re-run retention analytics checks:
   - `npm run test:analytics:retention`
5. Re-run smoke regression before release:
   - `npm run test:smoke`
