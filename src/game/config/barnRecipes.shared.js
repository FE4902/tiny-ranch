const barnProcessingRecipeDefinitions = Object.freeze({
  cheese_press: Object.freeze({
    label: 'Cheese Press',
    description: 'Press fresh milk into a shelf-stable cheese wheel.',
    durationMs: 45_000,
    fee: 0,
    inputs: Object.freeze([{ itemId: 'milk', quantity: 2 }]),
    outputs: Object.freeze([{ itemId: 'cheese', quantity: 1 }]),
  }),
  feed_mix: Object.freeze({
    label: 'Feed Mix',
    description: 'Blend turnips and eggs into a richer animal feed batch.',
    durationMs: 30_000,
    fee: 4,
    inputs: Object.freeze([
      { itemId: 'turnip', quantity: 2 },
      { itemId: 'egg', quantity: 1 },
    ]),
    outputs: Object.freeze([{ itemId: 'animal_feed', quantity: 1 }]),
  }),
  wool_bundle: Object.freeze({
    label: 'Wool Bundle',
    description: 'Card loose wool into bundled yarn stock for later sale.',
    durationMs: 60_000,
    fee: 6,
    inputs: Object.freeze([{ itemId: 'wool', quantity: 2 }]),
    outputs: Object.freeze([{ itemId: 'yarn', quantity: 1 }]),
  }),
})

const barnProcessingRecipeIds = Object.freeze(Object.keys(barnProcessingRecipeDefinitions))

export { barnProcessingRecipeDefinitions, barnProcessingRecipeIds }
