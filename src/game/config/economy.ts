import { expansionEconomyTuning } from './expansionEconomyTuning.shared.js'

const DEFAULT_ITEM_SELL_PRICE = 4
const itemSellUnitPrices = expansionEconomyTuning.itemSellUnitPrices

export function getItemSellPrice(itemId: string): number {
  const normalizedItemId = itemId.trim().toLowerCase()
  if (normalizedItemId.length === 0) {
    throw new Error('Item id is required to resolve sell price')
  }

  return itemSellUnitPrices[normalizedItemId] ?? DEFAULT_ITEM_SELL_PRICE
}
