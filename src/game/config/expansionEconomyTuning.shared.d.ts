import type { RanchZoneId } from '../maps/ranchMap'

export type ExpansionEconomyUpgradeId = 'greenhouse_tools' | 'market_ledger'

export interface ExpansionEconomyTierConfig {
  readonly tier: number
  readonly cost: number
  readonly label: string
  readonly summary: string
  readonly cropTileCapacity: number
  readonly animalSlotCapacity: number
  readonly unlockedZoneIds: readonly RanchZoneId[]
}

export interface ExpansionEconomyUpgradeLevelConfig {
  readonly cost: number
  readonly summary: string
  readonly cropGrowthDurationMultiplier?: number
  readonly sellPriceMultiplier?: number
}

export interface ExpansionEconomyUpgradeConfig {
  readonly label: string
  readonly description: string
  readonly levels: readonly ExpansionEconomyUpgradeLevelConfig[]
}

export interface ExpansionEconomyBalanceScenarioConfig {
  readonly loopDurationSeconds: number
  readonly saleBundle: Readonly<Record<string, number>>
}

export interface ExpansionEconomyTargetRangeConfig {
  readonly min: number
  readonly max: number
}

export interface ExpansionEconomyTuningConfig {
  readonly expansionTiers: readonly ExpansionEconomyTierConfig[]
  readonly itemSellUnitPrices: Readonly<Record<string, number>>
  readonly upgrades: Readonly<Record<ExpansionEconomyUpgradeId, ExpansionEconomyUpgradeConfig>>
  readonly pacingTargetsMinutes: {
    readonly firstExpansion: ExpansionEconomyTargetRangeConfig
    readonly secondExpansion: ExpansionEconomyTargetRangeConfig
  }
  readonly deterministicBalanceCheck: {
    readonly firstExpansion: ExpansionEconomyBalanceScenarioConfig
    readonly secondExpansion: ExpansionEconomyBalanceScenarioConfig
    readonly buyMarketLedgerLevel1BeforeSecondExpansion: boolean
  }
}

export declare const expansionEconomyTuning: ExpansionEconomyTuningConfig
