import {
  expansionEconomyTuning,
  type ExpansionEconomyUpgradeConfig,
  type ExpansionEconomyUpgradeId,
  type ExpansionEconomyUpgradeLevelConfig,
} from './expansionEconomyTuning.shared.js'

export interface RanchUpgradeLevelConfig {
  cost: number
  summary: string
  cropGrowthDurationMultiplier?: number
  sellPriceMultiplier?: number
}

export interface RanchUpgradeConfig {
  label: string
  description: string
  levels: readonly RanchUpgradeLevelConfig[]
}

export interface UpgradeEffectSnapshot {
  cropGrowthDurationMultiplier: number
  sellPriceMultiplier: number
}

const BASE_UPGRADE_EFFECTS: UpgradeEffectSnapshot = Object.freeze({
  cropGrowthDurationMultiplier: 1,
  sellPriceMultiplier: 1,
})

function defineUpgradeConfig(config: RanchUpgradeConfig): RanchUpgradeConfig {
  if (config.levels.length === 0) {
    throw new Error(`Upgrade "${config.label}" must declare at least one level`)
  }

  config.levels.forEach((level, index) => {
    if (!Number.isFinite(level.cost) || Math.floor(level.cost) !== level.cost || level.cost <= 0) {
      throw new Error(`Upgrade "${config.label}" level ${index + 1} cost must be a positive integer`)
    }

    if (level.summary.trim().length === 0) {
      throw new Error(`Upgrade "${config.label}" level ${index + 1} requires a summary`)
    }

    if (
      level.cropGrowthDurationMultiplier !== undefined &&
      (!Number.isFinite(level.cropGrowthDurationMultiplier) || level.cropGrowthDurationMultiplier <= 0)
    ) {
      throw new Error(
        `Upgrade "${config.label}" level ${index + 1} cropGrowthDurationMultiplier must be > 0`,
      )
    }

    if (
      level.sellPriceMultiplier !== undefined &&
      (!Number.isFinite(level.sellPriceMultiplier) || level.sellPriceMultiplier <= 0)
    ) {
      throw new Error(`Upgrade "${config.label}" level ${index + 1} sellPriceMultiplier must be > 0`)
    }
  })

  return config
}

function cloneUpgradeLevelConfig(
  level: ExpansionEconomyUpgradeLevelConfig,
): RanchUpgradeLevelConfig {
  return {
    cost: level.cost,
    summary: level.summary,
    cropGrowthDurationMultiplier: level.cropGrowthDurationMultiplier,
    sellPriceMultiplier: level.sellPriceMultiplier,
  }
}

function cloneUpgradeConfig(config: ExpansionEconomyUpgradeConfig): RanchUpgradeConfig {
  return {
    label: config.label,
    description: config.description,
    levels: config.levels.map((level) => cloneUpgradeLevelConfig(level)),
  }
}

const upgradeConfigsById = {
  greenhouse_tools: defineUpgradeConfig(
    cloneUpgradeConfig(expansionEconomyTuning.upgrades.greenhouse_tools),
  ),
  market_ledger: defineUpgradeConfig(cloneUpgradeConfig(expansionEconomyTuning.upgrades.market_ledger)),
} as const satisfies Record<ExpansionEconomyUpgradeId, RanchUpgradeConfig>

export type UpgradeId = keyof typeof upgradeConfigsById
export type UpgradeLevels = Record<UpgradeId, number>

export const upgradeIds = Object.freeze(Object.keys(upgradeConfigsById) as UpgradeId[])

export function getUpgradeConfig(upgradeId: UpgradeId): RanchUpgradeConfig {
  return upgradeConfigsById[upgradeId]
}

export function getUpgradeMaxLevel(upgradeId: UpgradeId): number {
  return upgradeConfigsById[upgradeId].levels.length
}

export function getUpgradeLevelConfig(
  upgradeId: UpgradeId,
  level: number,
): RanchUpgradeLevelConfig | null {
  const normalizedLevel = Math.floor(level)
  if (!Number.isFinite(normalizedLevel) || normalizedLevel <= 0) {
    return null
  }

  return upgradeConfigsById[upgradeId].levels[normalizedLevel - 1] ?? null
}

export function getNextUpgradeLevelConfig(
  upgradeId: UpgradeId,
  currentLevel: number,
): RanchUpgradeLevelConfig | null {
  return getUpgradeLevelConfig(upgradeId, Math.floor(currentLevel) + 1)
}

export function clampUpgradeLevel(upgradeId: UpgradeId, level: number): number {
  const normalizedLevel = Number.isFinite(level) ? Math.floor(level) : 0
  if (normalizedLevel <= 0) {
    return 0
  }

  return Math.min(normalizedLevel, getUpgradeMaxLevel(upgradeId))
}

export function createDefaultUpgradeLevels(): UpgradeLevels {
  const levels = {} as UpgradeLevels
  upgradeIds.forEach((upgradeId) => {
    levels[upgradeId] = 0
  })
  return levels
}

export function normalizeUpgradeLevels(
  value: Partial<Record<UpgradeId, number>>,
): UpgradeLevels {
  const normalized = createDefaultUpgradeLevels()
  upgradeIds.forEach((upgradeId) => {
    const rawLevel = value[upgradeId]
    if (rawLevel === undefined) {
      return
    }

    normalized[upgradeId] = clampUpgradeLevel(upgradeId, rawLevel)
  })

  return normalized
}

export function resolveUpgradeEffects(levels: Readonly<UpgradeLevels>): UpgradeEffectSnapshot {
  const effects: UpgradeEffectSnapshot = {
    ...BASE_UPGRADE_EFFECTS,
  }

  upgradeIds.forEach((upgradeId) => {
    const appliedLevel = clampUpgradeLevel(upgradeId, levels[upgradeId] ?? 0)
    const levelConfig = getUpgradeLevelConfig(upgradeId, appliedLevel)
    if (!levelConfig) {
      return
    }

    effects.cropGrowthDurationMultiplier *= levelConfig.cropGrowthDurationMultiplier ?? 1
    effects.sellPriceMultiplier *= levelConfig.sellPriceMultiplier ?? 1
  })

  return effects
}
