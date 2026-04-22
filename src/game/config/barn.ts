export interface BarnProcessingLineItem {
  itemId: string
  quantity: number
}

export interface BarnProcessingRecipeConfig {
  label: string
  description: string
  durationMs: number
  fee: number
  inputs: readonly BarnProcessingLineItem[]
  outputs: readonly BarnProcessingLineItem[]
}

function validateLineItem(item: BarnProcessingLineItem, fieldName: string): BarnProcessingLineItem {
  if (item.itemId.trim().length === 0) {
    throw new Error(`Barn recipe ${fieldName} item id is required`)
  }

  if (!Number.isFinite(item.quantity) || Math.floor(item.quantity) !== item.quantity || item.quantity <= 0) {
    throw new Error(`Barn recipe ${fieldName} quantity must be a positive integer`)
  }

  return {
    itemId: item.itemId.trim(),
    quantity: item.quantity,
  }
}

function defineBarnProcessingRecipe(
  config: BarnProcessingRecipeConfig,
): BarnProcessingRecipeConfig {
  if (config.label.trim().length === 0) {
    throw new Error('Barn recipe label is required')
  }

  if (config.description.trim().length === 0) {
    throw new Error('Barn recipe description is required')
  }

  if (!Number.isFinite(config.durationMs) || Math.floor(config.durationMs) !== config.durationMs || config.durationMs <= 0) {
    throw new Error('Barn recipe duration must be a positive integer')
  }

  if (!Number.isFinite(config.fee) || Math.floor(config.fee) !== config.fee || config.fee < 0) {
    throw new Error('Barn recipe fee must be a non-negative integer')
  }

  if (config.inputs.length === 0) {
    throw new Error('Barn recipe requires at least one input item')
  }

  if (config.outputs.length === 0) {
    throw new Error('Barn recipe requires at least one output item')
  }

  return {
    ...config,
    label: config.label.trim(),
    description: config.description.trim(),
    inputs: config.inputs.map((item) => validateLineItem(item, 'input')),
    outputs: config.outputs.map((item) => validateLineItem(item, 'output')),
  }
}

export const barnProcessingRecipeConfigs = {
  cheese_press: defineBarnProcessingRecipe({
    label: 'Cheese Press',
    description: 'Press fresh milk into a shelf-stable cheese wheel.',
    durationMs: 45_000,
    fee: 0,
    inputs: [{ itemId: 'milk', quantity: 2 }],
    outputs: [{ itemId: 'cheese', quantity: 1 }],
  }),
  feed_mix: defineBarnProcessingRecipe({
    label: 'Feed Mix',
    description: 'Blend turnips and eggs into a richer animal feed batch.',
    durationMs: 30_000,
    fee: 4,
    inputs: [
      { itemId: 'turnip', quantity: 2 },
      { itemId: 'egg', quantity: 1 },
    ],
    outputs: [{ itemId: 'animal_feed', quantity: 1 }],
  }),
  wool_bundle: defineBarnProcessingRecipe({
    label: 'Wool Bundle',
    description: 'Card loose wool into bundled yarn stock for later sale.',
    durationMs: 60_000,
    fee: 6,
    inputs: [{ itemId: 'wool', quantity: 2 }],
    outputs: [{ itemId: 'yarn', quantity: 1 }],
  }),
} as const

export type BarnProcessingRecipeId = keyof typeof barnProcessingRecipeConfigs

export const barnProcessingRecipeIds = Object.freeze(
  Object.keys(barnProcessingRecipeConfigs) as BarnProcessingRecipeId[],
)

export const barnProcessingRecipes = Object.freeze(
  barnProcessingRecipeIds.map((recipeId) => ({
    id: recipeId,
    ...barnProcessingRecipeConfigs[recipeId],
  })),
)

export function getBarnProcessingRecipeConfig(
  recipeId: BarnProcessingRecipeId,
): BarnProcessingRecipeConfig {
  return barnProcessingRecipeConfigs[recipeId]
}
