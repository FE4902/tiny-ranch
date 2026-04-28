# VER-97 Versioned Retention Tuning Packs

## Scope

Add a versioned retention tuning-pack loader that keeps objective/streak balancing configurable while preventing bad pack payloads from breaking boot.

## Source Of Truth

- Pack schema + validator + fallback loader: `src/game/config/returnObjectiveEconomyTuning.shared.js`
- Runtime pack selection: `src/game/config/retentionTuningPack.ts`
- Runtime flag defaults resolved from pack: `src/game/config/retentionFlags.ts`
- Gameplay consumers:
  - `src/game/config/returnObjectives.ts`
  - `src/game/config/returnObjectiveStreak.ts`
- Runtime telemetry emission:
  - `src/game/systems/runtime.ts`
  - `src/game/systems/telemetry.ts`
- Deterministic loader tests:
  - `scripts/test-retention-tuning-pack-loader.mjs`

## Runtime Selection

Pack selection is key-based:

1. smoke query override (`smokeTest=1&retentionTuningPack=<pack-id>`)
2. env config key (`VITE_RETENTION_TUNING_PACK=<pack-id>`)
3. source-controlled default pack id (`safe-default-v1`)

If the requested pack is missing or invalid, runtime falls back to `safe-default-v1`.

## Fallback Guarantees

- Missing pack id -> fallback reason `missing_pack`
- Invalid pack payload -> fallback reason `invalid_pack`
- Gameplay boot never throws from pack selection; safe pack is always applied
- Telemetry records selected pack metadata:
  - `tuningPackId`
  - `tuningPackVersion`
  - `fallbackReason`

## Available Bundled Packs

- `safe-default-v1`: conservative fallback-safe baseline
- `growth-push-v2`: alternate pack for higher reward/engagement tuning

Both are selectable by config key without gameplay logic changes.

## Add / Update Workflow

1. Add or modify pack entries in `returnObjectiveEconomyTuning.shared.js`.
2. Keep each pack versioned (`id` + `version`).
3. Run deterministic checks:
   - `pnpm run test:retention:tuning-packs`
   - `pnpm run test:analytics:retention`
   - `pnpm run test:soak:retention`
4. If reward behavior intentionally changes, update deterministic balance baselines in that pack.

## Rollback Expectations

- Immediate rollback path: point `VITE_RETENTION_TUNING_PACK` (or source-controlled default) back to `safe-default-v1`.
- If runtime receives an invalid release pack, it auto-falls back to `safe-default-v1` and continues boot.
- Verify fallback telemetry (`retention_tuning_pack_loaded`) and retention lifecycle telemetry fields before redeploying a corrected pack.
