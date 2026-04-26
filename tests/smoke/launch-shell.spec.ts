import { expect, test, type Page } from '@playwright/test'

const SMOKE_HARNESS_KEY = '__TINY_RANCH_SMOKE__'
const EXPECTED_TITLE = 'Tiny Ranch - Cozy Browser Ranch Game'
const EXPECTED_DESCRIPTION =
  'Tiny Ranch is a cozy browser ranch game where players plant crops, care for animals, craft barn goods, and ship village orders.'
const EXPECTED_SHARE_DESCRIPTION =
  'Plant crops, care for animals, craft barn goods, and ship village orders in a mobile-friendly browser ranch.'

type LaunchMetadata = {
  title: string
  description: string | null
  applicationName: string | null
  themeColor: string | null
  manifestHref: string | null
  faviconHref: string | null
  appleIconHref: string | null
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  twitterCard: string | null
  twitterTitle: string | null
  twitterDescription: string | null
  twitterImage: string | null
}

type SmokeSnapshot = {
  activeScene: string | null
}

function resolveLaunchMetadata(): LaunchMetadata {
  const readMeta = (selector: string): string | null =>
    document.querySelector<HTMLMetaElement>(selector)?.content ?? null
  const readLink = (selector: string): string | null =>
    document.querySelector<HTMLLinkElement>(selector)?.getAttribute('href') ?? null

  return {
    title: document.title,
    description: readMeta('meta[name="description"]'),
    applicationName: readMeta('meta[name="application-name"]'),
    themeColor: readMeta('meta[name="theme-color"]'),
    manifestHref: readLink('link[rel="manifest"]'),
    faviconHref: readLink('link[rel="icon"]'),
    appleIconHref: readLink('link[rel="apple-touch-icon"]'),
    ogTitle: readMeta('meta[property="og:title"]'),
    ogDescription: readMeta('meta[property="og:description"]'),
    ogImage: readMeta('meta[property="og:image"]'),
    twitterCard: readMeta('meta[name="twitter:card"]'),
    twitterTitle: readMeta('meta[name="twitter:title"]'),
    twitterDescription: readMeta('meta[name="twitter:description"]'),
    twitterImage: readMeta('meta[name="twitter:image"]'),
  }
}

async function expectAssetFetches(page: Page, assetPath: string): Promise<void> {
  const result = await page.evaluate(async (path) => {
    const response = await fetch(path, { cache: 'no-store' })
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
    }
  }, assetPath)

  expect(result.ok, `${assetPath} should be fetchable`).toBe(true)
  expect(result.status, `${assetPath} should return HTTP 200`).toBe(200)
  expect(result.contentType, `${assetPath} should include a content type`).not.toBeNull()
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

test('production launch shell exposes metadata and boots the game', async ({ page }) => {
  await page.goto('/?smokeTest=1', { waitUntil: 'domcontentloaded' })

  const metadata = await page.evaluate(resolveLaunchMetadata)
  expect(metadata.title).toBe(EXPECTED_TITLE)
  expect(metadata.description).toBe(EXPECTED_DESCRIPTION)
  expect(metadata.applicationName).toBe('Tiny Ranch')
  expect(metadata.themeColor).toBe('#173c2e')
  expect(metadata.manifestHref).toBe('/site.webmanifest')
  expect(metadata.faviconHref).toBe('/favicon.svg')
  expect(metadata.appleIconHref).toBe('/apple-touch-icon.png')
  expect(metadata.ogTitle).toBe(EXPECTED_TITLE)
  expect(metadata.ogDescription).toBe(EXPECTED_SHARE_DESCRIPTION)
  expect(metadata.ogImage).toBe('/share-card.svg')
  expect(metadata.twitterCard).toBe('summary_large_image')
  expect(metadata.twitterTitle).toBe(EXPECTED_TITLE)
  expect(metadata.twitterDescription).toBe(EXPECTED_SHARE_DESCRIPTION)
  expect(metadata.twitterImage).toBe('/share-card.svg')

  await expectAssetFetches(page, '/favicon.svg')
  await expectAssetFetches(page, '/app-icon.svg')
  await expectAssetFetches(page, '/apple-touch-icon.png')
  await expectAssetFetches(page, '/share-card.svg')

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/site.webmanifest', { cache: 'no-store' })
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json(),
    }
  })

  expect(manifest.ok).toBe(true)
  expect(manifest.status).toBe(200)
  expect(manifest.body).toMatchObject({
    name: 'Tiny Ranch',
    short_name: 'Tiny Ranch',
    start_url: '/',
    display: 'standalone',
    theme_color: '#173c2e',
  })
  expect(manifest.body.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: '/app-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      }),
    ]),
  )

  await expect(page.locator('#game-root canvas')).toBeVisible({ timeout: 15_000 })
  await waitForSmokeHarness(page)

  const snapshot = await getSnapshot(page)
  expect(snapshot.activeScene).toBe('ranch')
})
