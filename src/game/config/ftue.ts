export type FtueProgressSignal = 'plant' | 'grow' | 'harvest' | 'sell'

const FTUE_STEPS = [
  {
    id: 'plant_seed',
    title: 'Plant your first crop.',
    touchHint: 'Tap any soil tile inside Crop Area.',
    keyboardHint: 'Press E/Space near Crop Area or tap a soil tile.',
    completionSignal: 'plant',
  },
  {
    id: 'wait_for_growth',
    title: 'Wait for the crop to mature.',
    touchHint: 'Keep playing; crops grow automatically over time.',
    keyboardHint: 'Keep moving; crops grow automatically over time.',
    completionSignal: 'grow',
  },
  {
    id: 'harvest_crop',
    title: 'Harvest the mature crop.',
    touchHint: 'Tap the mature crop in Crop Area.',
    keyboardHint: 'Press E/Space near Crop Area or tap the mature crop.',
    completionSignal: 'harvest',
  },
  {
    id: 'sell_inventory',
    title: 'Sell your harvest for coins.',
    touchHint: 'Tap the shipping crate or market stall.',
    keyboardHint: 'Press E/Space near crate/stall or tap it.',
    completionSignal: 'sell',
  },
] as const

export type FtueStepId = (typeof FTUE_STEPS)[number]['id']

export interface FtueStepConfig {
  id: FtueStepId
  title: string
  touchHint: string
  keyboardHint: string
  completionSignal: FtueProgressSignal
}

export const ftueConfig: Readonly<{
  enabledByDefault: boolean
  steps: readonly FtueStepConfig[]
}> = {
  enabledByDefault: true,
  steps: FTUE_STEPS,
}

export function isFtueStepId(value: unknown): value is FtueStepId {
  if (typeof value !== 'string') {
    return false
  }

  return ftueConfig.steps.some((step) => step.id === value)
}

export function getFtueStepConfig(stepId: FtueStepId): FtueStepConfig {
  const step = ftueConfig.steps.find((entry) => entry.id === stepId)
  if (!step) {
    throw new Error(`Unknown FTUE step id: ${stepId}`)
  }

  return step
}

export function getFtueStepIndex(stepId: FtueStepId): number {
  const stepIndex = ftueConfig.steps.findIndex((step) => step.id === stepId)
  if (stepIndex === -1) {
    throw new Error(`Unknown FTUE step id: ${stepId}`)
  }

  return stepIndex
}

export function getFirstFtueStepId(): FtueStepId {
  const firstStep = ftueConfig.steps[0]
  if (!firstStep) {
    throw new Error('FTUE config must define at least one step')
  }

  return firstStep.id
}

export function getNextFtueStepId(stepId: FtueStepId): FtueStepId | null {
  const currentStepIndex = getFtueStepIndex(stepId)
  const nextStep = ftueConfig.steps[currentStepIndex + 1]
  return nextStep?.id ?? null
}
