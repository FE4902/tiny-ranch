import {
  barnMarketOrderDefinitions,
  barnMarketOrderIds as sharedBarnMarketOrderIds,
} from './barnMarketOrders.shared.js'
import { getItemSellPrice } from './economy'

export interface BarnMarketOrderLineItem {
  itemId: string
  quantity: number
}

export interface BarnMarketOrderConfig {
  label: string
  description: string
  requiredItems: readonly BarnMarketOrderLineItem[]
  payout: number
  baseSellValue: number
  premiumValue: number
}

type BarnMarketOrderDefinitionInput = Omit<
  BarnMarketOrderConfig,
  'baseSellValue' | 'premiumValue'
>

function validateLineItem(
  item: BarnMarketOrderLineItem,
  orderLabel: string,
): BarnMarketOrderLineItem {
  const itemId = item.itemId.trim().toLowerCase()
  if (itemId.length === 0) {
    throw new Error(`Barn market order "${orderLabel}" item id is required`)
  }

  if (!Number.isFinite(item.quantity) || Math.floor(item.quantity) !== item.quantity || item.quantity <= 0) {
    throw new Error(`Barn market order "${orderLabel}" quantity must be a positive integer`)
  }

  return {
    itemId,
    quantity: item.quantity,
  }
}

function calculateBaseSellValue(items: readonly BarnMarketOrderLineItem[]): number {
  return items.reduce(
    (total, item) => total + getItemSellPrice(item.itemId) * item.quantity,
    0,
  )
}

function defineBarnMarketOrder(config: BarnMarketOrderDefinitionInput): BarnMarketOrderConfig {
  if (config.label.trim().length === 0) {
    throw new Error('Barn market order label is required')
  }

  if (config.description.trim().length === 0) {
    throw new Error(`Barn market order "${config.label}" description is required`)
  }

  if (config.requiredItems.length === 0) {
    throw new Error(`Barn market order "${config.label}" requires at least one item`)
  }

  const requiredItems = config.requiredItems.map((item) => validateLineItem(item, config.label))
  const payout = Math.floor(config.payout)
  if (!Number.isFinite(payout) || payout <= 0) {
    throw new Error(`Barn market order "${config.label}" payout must be a positive integer`)
  }

  const baseSellValue = calculateBaseSellValue(requiredItems)
  if (payout <= baseSellValue) {
    throw new Error(
      `Barn market order "${config.label}" payout must exceed base sell value ${baseSellValue}`,
    )
  }

  return {
    label: config.label.trim(),
    description: config.description.trim(),
    requiredItems,
    payout,
    baseSellValue,
    premiumValue: payout - baseSellValue,
  }
}

export const barnMarketOrderConfigs = {
  creamery_delivery: defineBarnMarketOrder(barnMarketOrderDefinitions.creamery_delivery),
  feedlot_supplement: defineBarnMarketOrder(barnMarketOrderDefinitions.feedlot_supplement),
  weaver_contract: defineBarnMarketOrder(barnMarketOrderDefinitions.weaver_contract),
} as const

export type BarnMarketOrderId = keyof typeof barnMarketOrderConfigs

export const barnMarketOrderIds = Object.freeze(
  sharedBarnMarketOrderIds as BarnMarketOrderId[],
)

export const barnMarketOrders = Object.freeze(
  barnMarketOrderIds.map((orderId) => ({
    id: orderId,
    ...barnMarketOrderConfigs[orderId],
  })),
)

export function getBarnMarketOrderConfig(orderId: BarnMarketOrderId): BarnMarketOrderConfig {
  return barnMarketOrderConfigs[orderId]
}
