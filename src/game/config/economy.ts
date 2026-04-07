export interface ItemSellConfig {
  unitPrice: number
}

const DEFAULT_ITEM_SELL_PRICE = 4

const itemSellConfigs: Readonly<Record<string, ItemSellConfig>> = Object.freeze({
  turnip: { unitPrice: 12 },
  egg: { unitPrice: 16 },
  milk: { unitPrice: 24 },
  wool: { unitPrice: 28 },
})

export function getItemSellPrice(itemId: string): number {
  const normalizedItemId = itemId.trim().toLowerCase()
  if (normalizedItemId.length === 0) {
    throw new Error('Item id is required to resolve sell price')
  }

  return itemSellConfigs[normalizedItemId]?.unitPrice ?? DEFAULT_ITEM_SELL_PRICE
}
