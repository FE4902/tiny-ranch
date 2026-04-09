import { expect, test, type Page } from '@playwright/test'

const SMOKE_HARNESS_KEY = '__TINY_RANCH_SMOKE__'

type SmokeSnapshot = {
  activeScene: string | null
  currency: number
  expansionTier: number
  nextExpansionCost: number | null
  ranchCropCount: number
  saveStateExists: boolean
}

type CoreLoopRunResult = {
  launchScene: string | null
  planted: boolean
  harvested: boolean
  sold: boolean
  expansionPurchased: boolean
  currencyAfterSale: number
  currencyAfterPurchase: number
  expansionTierAfterPurchase: number
  persistedExpansionTier: number | null
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

async function runCoreLoopFlow(page: Page): Promise<CoreLoopRunResult> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          runCoreLoopFlow: () => CoreLoopRunResult
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.runCoreLoopFlow()
  }, SMOKE_HARNESS_KEY)
}

test('launch -> plant -> harvest -> sell -> expansion -> reload save', async ({ page }) => {
  await page.goto('/?smokeTest=1', { waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const initialSnapshot = await getSnapshot(page)
  expect(initialSnapshot.activeScene).toBe('ranch')
  expect(initialSnapshot.expansionTier).toBe(1)
  expect(initialSnapshot.nextExpansionCost).not.toBeNull()
  expect(initialSnapshot.nextExpansionCost ?? 0).toBeGreaterThan(0)
  expect(initialSnapshot.ranchCropCount).toBe(0)

  const coreLoopResult = await runCoreLoopFlow(page)
  expect(coreLoopResult.launchScene).toBe('ranch')
  expect(coreLoopResult.planted).toBe(true)
  expect(coreLoopResult.harvested).toBe(true)
  expect(coreLoopResult.sold).toBe(true)
  expect(coreLoopResult.expansionPurchased).toBe(true)
  expect(coreLoopResult.currencyAfterSale).toBeGreaterThanOrEqual(220)
  expect(coreLoopResult.expansionTierAfterPurchase).toBe(2)
  expect(coreLoopResult.persistedExpansionTier).toBe(2)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const reloadedSnapshot = await getSnapshot(page)
  expect(reloadedSnapshot.activeScene).toBe('ranch')
  expect(reloadedSnapshot.expansionTier).toBe(2)
  expect(reloadedSnapshot.currency).toBe(coreLoopResult.currencyAfterPurchase)
  expect(reloadedSnapshot.saveStateExists).toBe(true)
})
