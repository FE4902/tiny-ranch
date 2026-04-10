export type ReturnObjectiveMetric = 'harvest_count' | 'sell_value'

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

const RETURN_OBJECTIVE_CONFIGS = [
  defineReturnObjectiveConfig({
    id: 'harvest_turnips_4',
    goalId: 'harvest_count_goal',
    title: 'Harvest 4 crops',
    metric: 'harvest_count',
    targetValue: 4,
    rewardAmount: 32,
  }),
  defineReturnObjectiveConfig({
    id: 'sell_value_56',
    goalId: 'sell_value_goal',
    title: 'Sell goods worth 56 coins',
    metric: 'sell_value',
    targetValue: 56,
    rewardAmount: 40,
  }),
] as const satisfies readonly ReturnObjectiveConfig[]

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
