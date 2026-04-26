const barnMarketOrderDefinitions = Object.freeze({
  creamery_delivery: Object.freeze({
    label: 'Creamery Delivery',
    description: 'Ship a pressed cheese wheel to the village creamery.',
    requiredItems: Object.freeze([{ itemId: 'cheese', quantity: 1 }]),
    payout: 84,
  }),
  feedlot_supplement: Object.freeze({
    label: 'Feedlot Supplement',
    description: 'Send a rich feed batch to the neighboring feedlot.',
    requiredItems: Object.freeze([{ itemId: 'animal_feed', quantity: 1 }]),
    payout: 72,
  }),
  weaver_contract: Object.freeze({
    label: 'Weaver Contract',
    description: 'Deliver bundled yarn stock for a standing weaver order.',
    requiredItems: Object.freeze([{ itemId: 'yarn', quantity: 1 }]),
    payout: 110,
  }),
})

const barnMarketOrderIds = Object.freeze(Object.keys(barnMarketOrderDefinitions))

export { barnMarketOrderDefinitions, barnMarketOrderIds }
