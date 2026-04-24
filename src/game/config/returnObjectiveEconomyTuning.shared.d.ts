export type ReturnObjectiveMetric = 'harvest_count' | 'sell_value' | 'barn_claim_count'

export interface ReturnObjectiveEconomyObjectiveConfig {
  readonly id: string
  readonly goalId: string
  readonly title: string
  readonly metric: ReturnObjectiveMetric
  readonly barnRecipeId?: string | null
  readonly targetValue: number
  readonly rewardAmount: number
}

export interface ReturnObjectiveEconomyStreakTierConfig {
  readonly tier: number
  readonly rewardMultiplier: number
  readonly rewardBonus: number
}

export interface ReturnObjectiveEconomyStreakConfig {
  readonly maxTier: number
  readonly graceWindowMs: number
  readonly tiers: readonly ReturnObjectiveEconomyStreakTierConfig[]
}

export interface ReturnObjectiveBalanceBaselineConfig {
  readonly currencyEarned: number
  readonly currencySpent: number
  readonly streakBonusTotal: number
  readonly barnNetValueEarned?: number
}

export interface ReturnObjectiveBalanceScenarioConfig {
  readonly id: string
  readonly label: string
  readonly sessionCount: number
  readonly claimCadenceHours: readonly number[]
  readonly spendAmountsBySessionCycle: readonly number[]
  readonly baseline: ReturnObjectiveBalanceBaselineConfig
}

export interface ReturnObjectiveBalanceGuardrailsConfig {
  readonly maxRewardInflationDeltaPct: number
  readonly maxNetInflationDeltaPct: number
  readonly maxStreakBonusSharePct: number
}

export interface ReturnObjectiveEconomyTuningConfig {
  readonly objectives: readonly ReturnObjectiveEconomyObjectiveConfig[]
  readonly streak: ReturnObjectiveEconomyStreakConfig
  readonly deterministicBalanceCheck: {
    readonly seed: number
    readonly scenarios: readonly ReturnObjectiveBalanceScenarioConfig[]
    readonly guardrails: ReturnObjectiveBalanceGuardrailsConfig
  }
}

export interface RetentionTuningRewardCaps {
  readonly maxObjectiveRewardAmount: number
  readonly maxClaimRewardAmount: number
  readonly maxRewardMultiplier: number
  readonly maxStreakRewardBonusAmount: number
}

export interface RetentionTuningFlagDefaults {
  readonly objectiveLoopUiEnabled: boolean
  readonly streakBonusEnabled: boolean
  readonly retentionKillSwitchEnabled: boolean
}

export interface RetentionTuningPack {
  readonly id: string
  readonly version: number
  readonly rewardCaps: RetentionTuningRewardCaps
  readonly flagDefaults: RetentionTuningFlagDefaults
  readonly tuning: ReturnObjectiveEconomyTuningConfig
}

export type RetentionTuningPackFallbackReason = 'missing_pack' | 'invalid_pack'

export interface LoadRetentionTuningPackOptions {
  readonly candidatePacks?: readonly RetentionTuningPack[]
}

export interface LoadedRetentionTuningPack {
  readonly requestedPackId: string
  readonly tuningPackId: string
  readonly tuningPackVersion: number
  readonly fallbackReason: RetentionTuningPackFallbackReason | null
  readonly normalizationCount: number
  readonly pack: RetentionTuningPack
}

export declare const RETENTION_TUNING_PACK_FALLBACK_REASONS: Readonly<{
  missingPack: RetentionTuningPackFallbackReason
  invalidPack: RetentionTuningPackFallbackReason
}>
export declare const RETENTION_TUNING_SAFE_DEFAULT_PACK_ID: string
export declare const retentionTuningPacks: readonly RetentionTuningPack[]
export declare function loadReturnObjectiveEconomyTuningPack(
  requestedPackId: string | null | undefined,
  options?: LoadRetentionTuningPackOptions,
): LoadedRetentionTuningPack
export declare const returnObjectiveEconomyTuning: ReturnObjectiveEconomyTuningConfig
