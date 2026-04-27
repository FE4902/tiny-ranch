import { defineConfig, devices } from '@playwright/test'

const LOCAL_BASE_URL = 'http://127.0.0.1:4173'
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim()
const BASE_URL = externalBaseUrl || LOCAL_BASE_URL
const webServer = externalBaseUrl
  ? undefined
  : {
      command:
        'VITE_EXPERIMENT_PHASER_BUILD=package pnpm run build && pnpm run preview --host 127.0.0.1 --port 4173',
      url: LOCAL_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    }

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  ...(webServer ? { webServer } : {}),
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
})
