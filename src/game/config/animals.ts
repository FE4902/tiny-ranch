export interface AnimalProductionConfig {
  label: string
  productItemId: string
  productionDurationMs: number
  fedProductionDurationMs: number
}

function defineAnimalProductionConfig(config: AnimalProductionConfig): AnimalProductionConfig {
  if (config.productItemId.trim().length === 0) {
    throw new Error('Animal production config requires a product item id')
  }

  if (!Number.isFinite(config.productionDurationMs) || config.productionDurationMs <= 0) {
    throw new Error('Animal production config requires a positive production duration')
  }

  if (!Number.isFinite(config.fedProductionDurationMs) || config.fedProductionDurationMs <= 0) {
    throw new Error('Animal production config requires a positive fed production duration')
  }

  if (config.fedProductionDurationMs > config.productionDurationMs) {
    throw new Error('Fed production duration must be less than or equal to production duration')
  }

  return config
}

export const animalProductionConfigs = {
  chicken: defineAnimalProductionConfig({
    label: 'Chicken',
    productItemId: 'egg',
    productionDurationMs: 75_000,
    fedProductionDurationMs: 42_000,
  }),
  cow: defineAnimalProductionConfig({
    label: 'Cow',
    productItemId: 'milk',
    productionDurationMs: 110_000,
    fedProductionDurationMs: 70_000,
  }),
  sheep: defineAnimalProductionConfig({
    label: 'Sheep',
    productItemId: 'wool',
    productionDurationMs: 130_000,
    fedProductionDurationMs: 84_000,
  }),
} as const

export type AnimalProductionId = keyof typeof animalProductionConfigs

export function getAnimalProductionConfig(animalId: AnimalProductionId): AnimalProductionConfig {
  return animalProductionConfigs[animalId]
}
