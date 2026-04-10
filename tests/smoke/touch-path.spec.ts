import { expect, test, type Page } from '@playwright/test'

const SMOKE_HARNESS_KEY = '__TINY_RANCH_SMOKE__'
const TOUCH_TELEMETRY_BUFFER_KEY = '__TINY_RANCH_TOUCH_TELEMETRY__'

const MOVE_TILE = Object.freeze({ x: 10, y: 9 })
const CROP_TILE = Object.freeze({ x: 3, y: 10 })
const SHIPPING_TILE = Object.freeze({ x: 3, y: 6 })
const UTILITY_WELL_TILE = Object.freeze({ x: 7, y: 5 })
const EXTRA_TURNIPS_FOR_EXPANSION = 14

type SmokeSnapshot = {
  activeScene: string | null
  currency: number
  inventory: Record<string, number>
  expansionTier: number
  nextExpansionCost: number | null
  ranchCropCount: number
  saveStateExists: boolean
}

type TouchSmokeHarness = {
  waitForReady: (timeoutMs?: number) => Promise<void>
  getSnapshot: () => SmokeSnapshot
  getTileScreenPoint: (tileX: number, tileY: number) => { x: number; y: number }
  debugGetPlantedCropTiles: () => Array<{ x: number; y: number }>
  debugForceCropToMature: (tileX: number, tileY: number) => void
  debugSeedInventory: (itemId: string, quantity: number) => void
}

async function waitForTouchSmokeHarness(page: Page): Promise<void> {
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
      const harness = window[key] as TouchSmokeHarness | undefined
      if (!harness) {
        throw new Error('Touch smoke harness is not available on window.')
      }

      await harness.waitForReady(15_000)
    },
    SMOKE_HARNESS_KEY,
  )
}

async function getSnapshot(page: Page): Promise<SmokeSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as TouchSmokeHarness | undefined
    if (!harness) {
      throw new Error('Touch smoke harness is not available on window.')
    }

    return harness.getSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function getTileScreenPoint(
  page: Page,
  tileX: number,
  tileY: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ harnessKey, x, y }) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as TouchSmokeHarness | undefined
      if (!harness) {
        throw new Error('Touch smoke harness is not available on window.')
      }

      return harness.getTileScreenPoint(x, y)
    },
    { harnessKey: SMOKE_HARNESS_KEY, x: tileX, y: tileY },
  )
}

async function tapTile(page: Page, tileX: number, tileY: number): Promise<void> {
  await page.locator('canvas').first().scrollIntoViewIfNeeded()
  const point = await getTileScreenPoint(page, tileX, tileY)
  await page.touchscreen.tap(point.x, point.y)
}

async function tapDesiredTile(
  page: Page,
  desiredTileX: number,
  desiredTileY: number,
  tileOffsetX: number,
  tileOffsetY: number,
): Promise<void> {
  await tapTile(page, desiredTileX - tileOffsetX, desiredTileY - tileOffsetY)
}

async function forceCropToMature(page: Page, tileX: number, tileY: number): Promise<void> {
  await page.evaluate(
    ({ harnessKey, x, y }) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as TouchSmokeHarness | undefined
      if (!harness) {
        throw new Error('Touch smoke harness is not available on window.')
      }

      harness.debugForceCropToMature(x, y)
    },
    { harnessKey: SMOKE_HARNESS_KEY, x: tileX, y: tileY },
  )
}

async function getPlantedCropTiles(page: Page): Promise<Array<{ x: number; y: number }>> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as TouchSmokeHarness | undefined
    if (!harness) {
      throw new Error('Touch smoke harness is not available on window.')
    }

    return harness.debugGetPlantedCropTiles()
  }, SMOKE_HARNESS_KEY)
}

async function seedInventory(page: Page, itemId: string, quantity: number): Promise<void> {
  await page.evaluate(
    ({ harnessKey, targetItemId, targetQuantity }) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as TouchSmokeHarness | undefined
      if (!harness) {
        throw new Error('Touch smoke harness is not available on window.')
      }

      harness.debugSeedInventory(targetItemId, targetQuantity)
    },
    { harnessKey: SMOKE_HARNESS_KEY, targetItemId: itemId, targetQuantity: quantity },
  )
}

async function installTouchTelemetryBuffer(page: Page): Promise<void> {
  await page.evaluate((bufferKey: string) => {
    const key = bufferKey as keyof Window
    const windowRecord = window as unknown as Record<string, unknown>

    if (Array.isArray(windowRecord[key])) {
      return
    }

    const events: unknown[] = []
    windowRecord[key] = events

    window.addEventListener('tiny-ranch:telemetry', (event) => {
      const telemetryEvent = event as CustomEvent<{ name?: string; payload?: Record<string, unknown> }>
      events.push(telemetryEvent.detail)
    })
  }, TOUCH_TELEMETRY_BUFFER_KEY)
}

async function hasTouchMoveTelemetry(page: Page): Promise<boolean> {
  return page.evaluate((bufferKey: string) => {
    const key = bufferKey as keyof Window
    const windowRecord = window as unknown as Record<string, unknown>
    const events = windowRecord[key]
    if (!Array.isArray(events)) {
      return false
    }

    return events.some((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false
      }

      const telemetryEntry = entry as { name?: unknown; payload?: { source?: unknown } }
      return telemetryEntry.name === 'first_session_move' && telemetryEntry.payload?.source === 'touch'
    })
  }, TOUCH_TELEMETRY_BUFFER_KEY)
}

test('mobile touch-path smoke: move -> plant -> harvest -> sell -> expansion -> reload save', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Touch-path smoke runs only for mobile project.')

  await page.goto('/?smokeTest=1', { waitUntil: 'domcontentloaded' })
  await waitForTouchSmokeHarness(page)
  await installTouchTelemetryBuffer(page)

  const initialSnapshot = await getSnapshot(page)
  expect(initialSnapshot.activeScene).toBe('ranch')
  expect(initialSnapshot.expansionTier).toBe(1)
  expect(initialSnapshot.nextExpansionCost).toBe(210)
  expect(initialSnapshot.ranchCropCount).toBe(0)

  await tapTile(page, CROP_TILE.x, CROP_TILE.y)
  await expect
    .poll(async () => (await getSnapshot(page)).ranchCropCount, {
      timeout: 5_000,
      message: 'Expected crop count to increase after touch plant tap.',
    })
    .toBe(1)

  const plantedTile = (await getPlantedCropTiles(page))[0]
  if (!plantedTile) {
    throw new Error('Expected a planted crop tile after touch plant interaction.')
  }

  const tileOffsetX = plantedTile.x - CROP_TILE.x
  const tileOffsetY = plantedTile.y - CROP_TILE.y

  await tapDesiredTile(page, MOVE_TILE.x, MOVE_TILE.y, tileOffsetX, tileOffsetY)
  await expect
    .poll(async () => hasTouchMoveTelemetry(page), {
      timeout: 5_000,
      message: 'Expected first_session_move telemetry with source=touch after tap-to-move.',
    })
    .toBe(true)

  await forceCropToMature(page, plantedTile.x, plantedTile.y)
  await tapDesiredTile(page, plantedTile.x, plantedTile.y, tileOffsetX, tileOffsetY)

  await expect
    .poll(async () => (await getSnapshot(page)).ranchCropCount, {
      timeout: 5_000,
      message: 'Expected crop to be removed from the ranch after touch harvest tap.',
    })
    .toBe(0)
  await expect
    .poll(async () => (await getSnapshot(page)).inventory.turnip ?? 0, {
      timeout: 5_000,
      message: 'Expected harvested turnip inventory to be available after touch harvest.',
    })
    .toBeGreaterThanOrEqual(1)

  await seedInventory(page, 'turnip', EXTRA_TURNIPS_FOR_EXPANSION)
  await tapDesiredTile(page, SHIPPING_TILE.x, SHIPPING_TILE.y, tileOffsetX, tileOffsetY)

  await expect
    .poll(async () => (await getSnapshot(page)).currency, {
      timeout: 5_000,
      message: 'Expected touch sell interaction to produce enough coins for first expansion.',
    })
    .toBeGreaterThanOrEqual(210)

  const afterSaleSnapshot = await getSnapshot(page)
  await tapDesiredTile(page, UTILITY_WELL_TILE.x, UTILITY_WELL_TILE.y, tileOffsetX, tileOffsetY)

  await expect
    .poll(async () => (await getSnapshot(page)).expansionTier, {
      timeout: 5_000,
      message: 'Expected touch expansion purchase to advance tier to 2.',
    })
    .toBe(2)

  const expandedSnapshot = await getSnapshot(page)
  expect(expandedSnapshot.currency).toBeLessThan(afterSaleSnapshot.currency)
  expect(expandedSnapshot.saveStateExists).toBe(true)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForTouchSmokeHarness(page)

  const reloadedSnapshot = await getSnapshot(page)
  expect(reloadedSnapshot.activeScene).toBe('ranch')
  expect(reloadedSnapshot.expansionTier).toBe(2)
  expect(reloadedSnapshot.currency).toBe(expandedSnapshot.currency)
  expect(reloadedSnapshot.saveStateExists).toBe(true)
})
