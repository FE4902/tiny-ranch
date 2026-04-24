export interface BarnProcessingSharedLineItem {
  readonly itemId: string
  readonly quantity: number
}

export interface BarnProcessingSharedRecipeDefinition {
  readonly label: string
  readonly description: string
  readonly durationMs: number
  readonly fee: number
  readonly inputs: readonly BarnProcessingSharedLineItem[]
  readonly outputs: readonly BarnProcessingSharedLineItem[]
}

export declare const barnProcessingRecipeDefinitions: Readonly<
  Record<string, BarnProcessingSharedRecipeDefinition>
>
export declare const barnProcessingRecipeIds: readonly string[]
