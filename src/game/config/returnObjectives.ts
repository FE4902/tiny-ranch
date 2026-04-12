import {
  returnObjectiveEconomyTuning,
  type ReturnObjectiveEconomyObjectiveConfig,
  type ReturnObjectiveMetric,
} from './returnObjectiveEconomyTuning.shared.js'

export type { ReturnObjectiveMetric }

export interface ReturnObjectiveConfig {
  id: string
  goalId: string
  title: string
  metric: ReturnObjectiveMetric
  targetValue: number
  rewardAmount: number
}

function defineReturnObjectiveConfig(config: ReturnObjectiveConfig): ReturnObjectiveConfig {
  if (config.id.trim().length === 0) {
    throw new Error('Return objective id is required')
  }

  if (config.goalId.trim().length === 0) {
    throw new Error(`Return objective "${config.id}" requires a goalId`)
  }

  if (config.title.trim().length === 0) {
    throw new Error(`Return objective "${config.id}" requires a title`)
  }

  if (!Number.isFinite(config.targetValue) || Math.floor(config.targetValue) !== config.targetValue) {
    throw new Error(`Return objective "${config.id}" targetValue must be an integer`)
  }

  if (config.targetValue <= 0) {
    throw new Error(`Return objective "${config.id}" targetValue must be > 0`)
  }

  if (!Number.isFinite(config.rewardAmount) || Math.floor(config.rewardAmount) !== config.rewardAmount) {
    throw new Error(`Return objective "${config.id}" rewardAmount must be an integer`)
  }

  if (config.rewardAmount <= 0) {
    throw new Error(`Return objective "${config.id}" rewardAmount must be > 0`)
  }

  return {
    id: config.id.trim(),
    goalId: config.goalId.trim(),
    title: config.title.trim(),
    metric: config.metric,
    targetValue: config.targetValue,
    rewardAmount: config.rewardAmount,
  }
}

function cloneReturnObjectiveConfig(
  config: ReturnObjectiveEconomyObjectiveConfig,
): ReturnObjectiveConfig {
  return {
    id: config.id,
    goalId: config.goalId,
    title: config.title,
    metric: config.metric,
    targetValue: config.targetValue,
    rewardAmount: config.rewardAmount,
  }
}

const RETURN_OBJECTIVE_CONFIGS = returnObjectiveEconomyTuning.objectives.map((config) =>
  defineReturnObjectiveConfig(cloneReturnObjectiveConfig(config)),
)

export type ReturnObjectiveId = (typeof RETURN_OBJECTIVE_CONFIGS)[number]['id']

const returnObjectiveConfigsById = RETURN_OBJECTIVE_CONFIGS.reduce(
  (map, objective) => {
    map[objective.id] = objective
    return map
  },
  {} as Record<ReturnObjectiveId, ReturnObjectiveConfig>,
)

export const returnObjectiveConfigs = RETURN_OBJECTIVE_CONFIGS

export function isReturnObjectiveId(value: unknown): value is ReturnObjectiveId {
  return typeof value === 'string' && Object.hasOwn(returnObjectiveConfigsById, value)
}

export function getReturnObjectiveConfig(objectiveId: ReturnObjectiveId): ReturnObjectiveConfig {
  return returnObjectiveConfigsById[objectiveId]
}
