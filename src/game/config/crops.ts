export interface CropSeedConfig {
  label: string
  stageFrames: readonly number[]
  stageDurationsMs: readonly number[]
  yieldItemId: string
}

function defineCropSeedConfig(config: CropSeedConfig): CropSeedConfig {
  if (config.stageFrames.length === 0) {
    throw new Error('Crop seed config requires at least one stage frame')
  }

  if (config.stageDurationsMs.length !== config.stageFrames.length - 1) {
    throw new Error('Crop seed config must provide stage durations for each stage transition')
  }

  return config
}

export const cropSeedConfigs = {
  turnip: defineCropSeedConfig({
    label: 'Turnip Seed',
    stageFrames: [4, 9, 14, 19],
    stageDurationsMs: [45_000, 60_000, 90_000],
    yieldItemId: 'turnip',
  }),
} as const

export type CropSeedId = keyof typeof cropSeedConfigs

export const defaultCropSeedId: CropSeedId = 'turnip'

export function getCropSeedConfig(seedId: CropSeedId): CropSeedConfig {
  return cropSeedConfigs[seedId]
}
