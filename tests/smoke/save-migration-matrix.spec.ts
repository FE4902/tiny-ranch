import fs from 'node:fs'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const SMOKE_HARNESS_KEY = '__TINY_RANCH_SMOKE__'
const SAVE_STORAGE_KEY = 'tiny-ranch:save-state'
const NON_NULL_EXPECTATION = '__NON_NULL__'

type SmokeLaunchOptions = {
  retentionObjectiveUi?: boolean
  retentionStreakBonus?: boolean
  retentionKillSwitch?: boolean
}

type SmokeSnapshot = {
  currency: number
  expansionTier: number
  ranchCropCount: number
  saveStateExists: boolean
}

type ReturnObjectiveSnapshot = {
  objectiveLoopEnabled: boolean
  streakBonusEnabled: boolean
  retentionKillSwitchEnabled: boolean
  activeObjectiveId: string | null
  streakTier: number
  nextStreakTier: number
}

type SavePayloadFixture = {
  schemaVersion: number
  metadata: {
    savedAtEpochMs: number
  }
  currency: number
  inventory: Record<string, number>
  progression: {
    activeScene: string | null
    activeSeedId: string
    expansionTier: number
    upgrades?: Record<string, number>
  }
  ranch: {
    crops: unknown[]
    animals: unknown[]
  }
  ftue?: unknown
  returnObjective?: {
    activeObjectiveId: string | null
    progressValue: number
    assignedAtEpochMs: number | null
    completedAtEpochMs: number | null
    claimedAtEpochMs: number | null
    assignmentCycle: number
  }
  returnObjectiveStreak?: {
    tier: number
    lastClaimedAtEpochMs: number | null
  }
}

type FixtureCase = {
  id: string
  description: string
  launchFlags: SmokeLaunchOptions
  expectedRuntime: {
    objectiveLoopEnabled: boolean
    streakBonusEnabled: boolean
    retentionKillSwitchEnabled: boolean
    activeObjectiveId: string | null
    streakTier: number
    nextStreakTier: number
  }
  expectedResave: {
    activeObjectiveId: string | null
    streakTier: number
  }
  payload: SavePayloadFixture
}

type FixtureMatrix = {
  fixtures: FixtureCase[]
}

function loadFixtureMatrix(): FixtureMatrix {
  const fixturePath = path.resolve(
    process.cwd(),
    'tests/fixtures/save/save-migration-matrix.fixture.json',
  )
  const raw = fs.readFileSync(fixturePath, 'utf8')
  return JSON.parse(raw) as FixtureMatrix
}

function expectObjectiveId(
  actualActiveObjectiveId: string | null,
  expectedActiveObjectiveId: string | null,
): void {
  if (expectedActiveObjectiveId === NON_NULL_EXPECTATION) {
    expect(actualActiveObjectiveId).not.toBeNull()
    return
  }

  expect(actualActiveObjectiveId).toBe(expectedActiveObjectiveId)
}

async function waitForSmokeHarness(page: Page): Promise<void> {
  await page.waitForFunction(
    (harnessKey: string) => {
      const key = harnessKey as keyof Window
      return typeof window[key] !== 'undefined'
    },
    SMOKE_HARNESS_KEY,
    { timeout: 15_000 },
  )

  await page.evaluate(
    async (harnessKey: string) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as
        | {
            waitForReady: (timeoutMs?: number) => Promise<void>
          }
        | undefined
      if (!harness) {
        throw new Error('Smoke harness is not available on window.')
      }

      await harness.waitForReady(15_000)
    },
    SMOKE_HARNESS_KEY,
  )
}

async function launchSmokeSession(page: Page, options: SmokeLaunchOptions = {}): Promise<void> {
  const params = new URLSearchParams()
  params.set('smokeTest', '1')

  if (options.retentionObjectiveUi !== undefined) {
    params.set('retentionObjectiveUi', options.retentionObjectiveUi ? '1' : '0')
  }
  if (options.retentionStreakBonus !== undefined) {
    params.set('retentionStreakBonus', options.retentionStreakBonus ? '1' : '0')
  }
  if (options.retentionKillSwitch !== undefined) {
    params.set('retentionKillSwitch', options.retentionKillSwitch ? '1' : '0')
  }

  await page.goto(`/?${params.toString()}`, { waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)
}

async function getSnapshot(page: Page): Promise<SmokeSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          getSnapshot: () => SmokeSnapshot
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.getSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function getReturnObjectiveSnapshot(page: Page): Promise<ReturnObjectiveSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          getReturnObjectiveSnapshot: () => ReturnObjectiveSnapshot
          debugSaveGameState: () => unknown
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.getReturnObjectiveSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function debugSaveGameState(page: Page): Promise<void> {
  await page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          debugSaveGameState: () => unknown
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    harness.debugSaveGameState()
  }, SMOKE_HARNESS_KEY)
}

async function readRawSavedPayload(page: Page): Promise<unknown> {
  return page.evaluate((storageKey: string) => {
    const raw = window.localStorage.getItem(storageKey)
    if (raw === null) {
      return null
    }

    return JSON.parse(raw)
  }, SAVE_STORAGE_KEY)
}

const fixtureMatrix = loadFixtureMatrix()

test.describe('save migration compatibility matrix', () => {
  test.skip(({ isMobile }) => isMobile, 'Migration matrix runs as a deterministic desktop gate.')

  for (const fixture of fixtureMatrix.fixtures) {
    test(`${fixture.id}: ${fixture.description}`, async ({ page }) => {
      await page.addInitScript(
        ({ storageKey, payload }) => {
          window.localStorage.setItem(storageKey, JSON.stringify(payload))
        },
        {
          storageKey: SAVE_STORAGE_KEY,
          payload: fixture.payload,
        },
      )

      await launchSmokeSession(page, fixture.launchFlags)

      const snapshot = await getSnapshot(page)
      expect(snapshot.saveStateExists).toBe(true)
      expect(snapshot.currency).toBe(fixture.payload.currency)
      expect(snapshot.expansionTier).toBe(fixture.payload.progression.expansionTier)

      const runtimeSnapshot = await getReturnObjectiveSnapshot(page)
      expect(runtimeSnapshot.objectiveLoopEnabled).toBe(fixture.expectedRuntime.objectiveLoopEnabled)
      expect(runtimeSnapshot.streakBonusEnabled).toBe(fixture.expectedRuntime.streakBonusEnabled)
      expect(runtimeSnapshot.retentionKillSwitchEnabled).toBe(
        fixture.expectedRuntime.retentionKillSwitchEnabled,
      )
      expectObjectiveId(runtimeSnapshot.activeObjectiveId, fixture.expectedRuntime.activeObjectiveId)
      expect(runtimeSnapshot.streakTier).toBe(fixture.expectedRuntime.streakTier)
      expect(runtimeSnapshot.nextStreakTier).toBe(fixture.expectedRuntime.nextStreakTier)

      await debugSaveGameState(page)
      const rawSavedPayload = await readRawSavedPayload(page)
      expect(rawSavedPayload).not.toBeNull()

      const persisted = rawSavedPayload as {
        metadata: { savedAtEpochMs: number }
        currency: number
        inventory: Record<string, number>
        progression: { expansionTier: number }
        ranch: { crops: unknown[]; animals: unknown[] }
        returnObjective?: { activeObjectiveId: string | null }
        returnObjectiveStreak?: { tier: number }
      }

      expect(typeof persisted.metadata.savedAtEpochMs).toBe('number')
      expect(persisted.currency).toBe(fixture.payload.currency)
      expect(persisted.inventory).toEqual(fixture.payload.inventory)
      expect(persisted.progression.expansionTier).toBe(fixture.payload.progression.expansionTier)
      expect(Array.isArray(persisted.ranch.crops)).toBe(true)
      expect(Array.isArray(persisted.ranch.animals)).toBe(true)
      expect(persisted.returnObjective).toBeDefined()
      expect(persisted.returnObjectiveStreak).toBeDefined()
      expectObjectiveId(
        persisted.returnObjective?.activeObjectiveId ?? null,
        fixture.expectedResave.activeObjectiveId,
      )
      expect(persisted.returnObjectiveStreak?.tier).toBe(fixture.expectedResave.streakTier)
    })
  }
})
