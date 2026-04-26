export interface BarnMarketOrderSharedLineItem {
  readonly itemId: string
  readonly quantity: number
}

export interface BarnMarketOrderSharedDefinition {
  readonly label: string
  readonly description: string
  readonly requiredItems: readonly BarnMarketOrderSharedLineItem[]
  readonly payout: number
}

export declare const barnMarketOrderDefinitions: Readonly<
  Record<string, BarnMarketOrderSharedDefinition>
>
export declare const barnMarketOrderIds: readonly string[]
