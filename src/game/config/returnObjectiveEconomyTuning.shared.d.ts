export type ReturnObjectiveMetric = 'harvest_count' | 'sell_value'

export interface ReturnObjectiveEconomyObjectiveConfig {
  readonly id: string
  readonly goalId: string
  readonly title: string
  readonly metric: ReturnObjectiveMetric
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

export declare const returnObjectiveEconomyTuning: ReturnObjectiveEconomyTuningConfig
