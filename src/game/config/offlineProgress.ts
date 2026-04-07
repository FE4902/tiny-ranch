export interface OfflineProgressConfig {
  enabled: boolean
  minimumElapsedMs: number
  maximumElapsedMs: number
  maxTotalRewardItems: number
  maxCropHarvests: number
  maxAnimalProducts: number
}

function defineOfflineProgressConfig(config: OfflineProgressConfig): OfflineProgressConfig {
  if (!Number.isFinite(config.minimumElapsedMs) || config.minimumElapsedMs < 0) {
    throw new Error('Offline progress minimumElapsedMs must be a non-negative finite number')
  }

  if (!Number.isFinite(config.maximumElapsedMs) || config.maximumElapsedMs <= 0) {
    throw new Error('Offline progress maximumElapsedMs must be a positive finite number')
  }

  if (config.maximumElapsedMs < config.minimumElapsedMs) {
    throw new Error('Offline progress maximumElapsedMs must be >= minimumElapsedMs')
  }

  if (!Number.isFinite(config.maxTotalRewardItems) || config.maxTotalRewardItems <= 0) {
    throw new Error('Offline progress maxTotalRewardItems must be a positive finite number')
  }

  if (!Number.isFinite(config.maxCropHarvests) || config.maxCropHarvests <= 0) {
    throw new Error('Offline progress maxCropHarvests must be a positive finite number')
  }

  if (!Number.isFinite(config.maxAnimalProducts) || config.maxAnimalProducts <= 0) {
    throw new Error('Offline progress maxAnimalProducts must be a positive finite number')
  }

  return {
    enabled: config.enabled,
    minimumElapsedMs: Math.floor(config.minimumElapsedMs),
    maximumElapsedMs: Math.floor(config.maximumElapsedMs),
    maxTotalRewardItems: Math.floor(config.maxTotalRewardItems),
    maxCropHarvests: Math.floor(config.maxCropHarvests),
    maxAnimalProducts: Math.floor(config.maxAnimalProducts),
  }
}

export const offlineProgressConfig: OfflineProgressConfig = defineOfflineProgressConfig({
  enabled: true,
  minimumElapsedMs: 30_000,
  maximumElapsedMs: 8 * 60 * 60 * 1000,
  maxTotalRewardItems: 24,
  maxCropHarvests: 16,
  maxAnimalProducts: 12,
})
