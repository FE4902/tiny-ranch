# VER-78 Expansion Economy Pacing Targets

## Scope

Define one reversible economy tuning surface for expansion progression and enforce pacing checkpoints through a deterministic script.

## Source Of Truth

- Config file: `src/game/config/expansionEconomyTuning.shared.js`
- Enforcement script: `scripts/check-expansion-pacing.mjs`
- Run command: `pnpm run balance:check`

The shared config is consumed by:

- `src/game/config/expansion.ts` (tier costs + unlock capacities/zones)
- `src/game/config/economy.ts` (crop/animal sell rates)
- `src/game/config/upgrades.ts` (upgrade cost thresholds and effects)
- `scripts/check-expansion-pacing.mjs` (deterministic pacing checkpoints)

## Target Ranges (Minutes)

| Checkpoint | Target range |
| --- | --- |
| Time to first expansion (Tier 2 purchase) | 8-14 |
| Time to second expansion (Tier 3 purchase) | 18-28 |

## Deterministic Balance Scenarios

The script evaluates these fixed loops from config:

- First expansion loop: every `75s`, sell bundle `2x turnip`.
- Second expansion loop: every `75s`, sell bundle `3x turnip + 1x egg`.
- Strategy toggle: buy `market_ledger` level 1 before progressing to the second expansion checkpoint.

The script fails with exit code `1` when either checkpoint falls outside target range.

## Reversible Tuning Workflow

1. Edit economy levers in `src/game/config/expansionEconomyTuning.shared.js`.
2. Run `pnpm run balance:check`.
3. Run `pnpm run test:smoke` to verify the expansion regression flow remains green.
4. If needed, iterate with config-only changes (scene logic changes are not required for pacing).
