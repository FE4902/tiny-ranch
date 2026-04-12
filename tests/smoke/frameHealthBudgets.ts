export interface FrameHealthBudget {
  sampleWindowMs: number
  minimumSampleCount: number
  longFrameThresholdMs: number
  maxP95FrameDurationMs: number
  maxLongFrameCount: number
}

const DEFAULT_BUDGET: FrameHealthBudget = {
  sampleWindowMs: 3_000,
  minimumSampleCount: 90,
  longFrameThresholdMs: 50,
  maxP95FrameDurationMs: 45,
  maxLongFrameCount: 3,
}

const FRAME_HEALTH_BUDGET_BY_PROJECT: Record<string, FrameHealthBudget> = {
  'desktop-chromium': {
    sampleWindowMs: 3_000,
    minimumSampleCount: 120,
    longFrameThresholdMs: 45,
    maxP95FrameDurationMs: 30,
    maxLongFrameCount: 2,
  },
  'mobile-chromium': {
    sampleWindowMs: 3_000,
    minimumSampleCount: 90,
    longFrameThresholdMs: 55,
    maxP95FrameDurationMs: 42,
    maxLongFrameCount: 4,
  },
}

export function resolveFrameHealthBudget(projectName: string): FrameHealthBudget {
  return FRAME_HEALTH_BUDGET_BY_PROJECT[projectName] ?? DEFAULT_BUDGET
}
